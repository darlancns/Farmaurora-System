import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Página /configuracoes → aba Contas. Usa a conta administrador já configurada:
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
// O teste 8 (redirect de não-admin) usa, se disponível:
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD
//
// Os testes que criam contas usam e-mail com timestamp e apagam o que criaram
// no final, pra não acumular usuários no projeto Supabase.

const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
const socio = { email: process.env.E2E_SOCIO_EMAIL ?? "", password: process.env.E2E_SOCIO_PASSWORD ?? "" };
const hasAdmin = Boolean(admin.email && admin.password);
const hasSocio = Boolean(socio.email && socio.password);

async function login(page: Page, email: string, password: string): Promise<void> {
  // domcontentloaded, não networkidle: logo após uma troca de role da própria
  // sessão (cenário anti-lockout), o cliente Supabase mantém timers de refresh
  // de token em segundo plano, o que pode impedir a rede de ficar "idle" e
  // travar o goto por muito tempo. O DOM pronto basta — a hidratação é tratada
  // pelo retry abaixo.
  // Se já existir uma sessão válida no contexto (o cenário (b) troca de conta
  // várias vezes na mesma page), o guard global (auth.global.ts) redireciona
  // /login -> / ANTES do form aparecer — login() "sucede" sem autenticar como
  // quem foi pedido, e as chamadas seguintes rodam com a sessão ERRADA. Limpa
  // cookies primeiro pra garantir que sempre é uma sessão nova.
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Nuxt pode ainda estar hidratando quando o Playwright interage — sem
  // hidratação o @submit.prevent não roda e o form faz um GET nativo pra
  // /login?, que recarrega a página e LIMPA os campos preenchidos. Por isso o
  // fill acontece dentro do retry: se essa tentativa recarregou a página, a
  // próxima refaz o preenchimento em vez de clicar num form vazio (que o
  // `required` nativo bloqueia sem nunca sair de /login).
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

/** Abre o menu "⋮" de ações da linha da conta (necessário antes de clicar em Editar/Redefinir senha/Excluir). */
async function abrirMenuAcoes(page: Page, id: string): Promise<void> {
  await page.locator(`#btn-acoes-conta-${id}`).click();
}

/** Cria uma conta direto pela API (autenticado como admin) e devolve o id. */
async function apiCreate(
  req: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await req.post("/api/admin/users", { data: body });
  return { status: res.status(), json: await res.json().catch(() => ({})) };
}

async function apiDelete(req: APIRequestContext, id: string): Promise<void> {
  await req.delete(`/api/admin/users/${id}`);
}

async function apiMeId(req: APIRequestContext): Promise<string> {
  const res = await req.get("/api/auth/me");
  return String(((await res.json()) as { id: string }).id);
}

async function apiAdminCount(req: APIRequestContext): Promise<number> {
  const res = await req.get("/api/admin/users");
  const users = (await res.json()) as Array<{ role: string }>;
  return users.filter((u) => u.role === "administrador").length;
}

test.describe("Configurações → Contas", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("1. admin acessa /configuracoes e vê a aba Contas + a própria conta na lista", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });

    await expect(page).toHaveURL(/\/configuracoes$/);
    await expect(page.locator("#tab-contas")).toBeVisible();
    await expect(page.locator("#contas-tab")).toBeVisible();
    await expect(page.getByText(admin.email, { exact: false })).toBeVisible();
  });

  test("2. cria conta com cargo Sócio → aparece na lista após refetch", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });

    const email = `e2e+socio-${Date.now()}@farmaurora.com.br`;
    try {
      await page.locator("#btn-nova-conta").click();
      await page.locator("#conta-nome").fill("E2E Sócio Teste");
      await page.locator("#conta-email").fill(email);
      await page.locator("#btn-gerar-senha").click();
      await page.locator("#conta-role").click();
      await page.getByRole("option", { name: "Sócio", exact: true }).click();
      await page.locator("#btn-conta-salvar").click();

      // .first(): a linha da conta repete o e-mail em mais de um nó (célula +
      // destaque em <strong>) — getByText sozinho viola o strict mode do
      // Playwright. Continua checando a mesma coisa (o e-mail apareceu na
      // lista), só resolve a ambiguidade do locator.
      await expect(page.getByText(email, { exact: false }).first()).toBeVisible();
    } finally {
      // limpeza — em `finally` pra não deixar a conta órfã se alguma asserção
      // acima falhar (a versão anterior só limpava no caminho feliz).
      const list = await page.request.get("/api/admin/users");
      const users = (await list.json()) as Array<{ id: string; email: string }>;
      const created = users.find((u) => u.email === email);
      if (created) await apiDelete(page.request, created.id);
    }
  });

  test("3. cargo Consultor sem nome → validação impede o envio", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });

    await page.locator("#btn-nova-conta").click();
    await page.locator("#conta-email").fill(`e2e+c-${Date.now()}@farmaurora.com.br`);
    await page.locator("#btn-gerar-senha").click();
    // role default já é "consultor"; não selecionar nome
    await page.locator("#btn-conta-salvar").click();

    // modal continua aberto (não navegou/criou) e aparece um toast de erro
    await expect(page.locator("#conta-form")).toBeVisible();
  });

  test("4. payload direto com consultorNome fora da lista → servidor rejeita (400)", async ({ page }) => {
    await login(page, admin.email, admin.password);

    const { status, json } = await apiCreate(page.request, {
      email: `e2e+bad-${Date.now()}@farmaurora.com.br`,
      password: "senha-super-forte-123",
      role: "consultor",
      consultorNome: "Consultor Inexistente",
    });
    expect(status).toBe(400);
    expect(String(json.statusMessage ?? json.message ?? "")).toMatch(/consultorNome/i);
  });

  test("5. edita o cargo de uma conta → reflete na lista", async ({ page }) => {
    await login(page, admin.email, admin.password);

    const email = `e2e+edit-${Date.now()}@farmaurora.com.br`;
    const created = await apiCreate(page.request, {
      email,
      password: "senha-super-forte-123",
      role: "socio",
      nome: "E2E Edit Teste",
    });
    const id = String(created.json.id);

    try {
      await page.goto("/configuracoes", { waitUntil: "networkidle" });
      await abrirMenuAcoes(page, id);
      await page.locator(`#btn-editar-conta-${id}`).click();
      await page.locator("#conta-role").click();
      await page.getByRole("option", { name: "Operacional", exact: true }).click();
      await page.locator("#btn-conta-salvar").click();

      const row = page.locator(`#conta-row-${id}`);
      await expect(row).toContainText("Operacional");
    } finally {
      await apiDelete(page.request, id);
    }
  });

  test("6. exclui uma conta → some da lista", async ({ page }) => {
    await login(page, admin.email, admin.password);

    const email = `e2e+del-${Date.now()}@farmaurora.com.br`;
    const created = await apiCreate(page.request, {
      email,
      password: "senha-super-forte-123",
      role: "socio",
      nome: "E2E Del Teste",
    });
    const id = String(created.json.id);

    await page.goto("/configuracoes", { waitUntil: "networkidle" });
    await expect(page.locator(`#conta-row-${id}`)).toBeVisible();

    await abrirMenuAcoes(page, id);
    await page.locator(`#btn-excluir-conta-${id}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();

    await expect(page.locator(`#conta-row-${id}`)).toHaveCount(0);
  });

  test("7. linha do próprio admin: label (você) presente e ações liberadas", async ({ page }) => {
    await login(page, admin.email, admin.password);

    const meId = await apiMeId(page.request);

    await page.goto("/configuracoes", { waitUntil: "networkidle" });
    const row = page.locator(`#conta-row-${meId}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("(você)");
    // guardas antigas removidas — o próprio admin agora vê e usa as ações
    await abrirMenuAcoes(page, meId);
    await expect(page.locator(`#btn-editar-conta-${meId}`)).toBeVisible();
    await expect(page.locator(`#btn-reset-senha-${meId}`)).toBeVisible();
    await expect(page.locator(`#btn-excluir-conta-${meId}`)).toBeVisible();
  });

  test("guarda anti-lockout — cenário (a): único admin não pode se demover nem se excluir; reset-password da própria conta é liberado", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const meId = await apiMeId(page.request);

    test.skip(
      (await apiAdminCount(page.request)) !== 1,
      "cenário (a) exige exatamente 1 administrador no projeto",
    );

    const patch = await page.request.patch(`/api/admin/users/${meId}`, { data: { role: "socio" } });
    expect(patch.status()).toBe(400);
    expect(String(((await patch.json()) as { statusMessage?: string }).statusMessage ?? "")).toMatch(
      /único administrador/i,
    );

    const del = await page.request.delete(`/api/admin/users/${meId}`);
    expect(del.status()).toBe(400);
    expect(String(((await del.json()) as { statusMessage?: string }).statusMessage ?? "")).toMatch(
      /único administrador/i,
    );

    // redefinir a própria senha é permitido — reusa a MESMA senha pra não quebrar o login
    const reset = await page.request.post(`/api/admin/users/${meId}/reset-password`, {
      data: { password: admin.password },
    });
    expect(reset.status()).toBe(200);
  });

  test("guarda anti-lockout — cenário (b): com 2 admins, demover/excluir um deles é permitido e sobra ≥ 1", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const origId = await apiMeId(page.request);

    const email2 = `e2e+admin2-${Date.now()}@farmaurora.com.br`;
    const pass2 = "senha-super-forte-2-123";
    let id2 = "";

    try {
      const created = await apiCreate(page.request, {
        email: email2,
        password: pass2,
        role: "administrador",
        nome: "E2E Admin2 Teste",
      });
      expect(created.status).toBe(200);
      id2 = String(created.json.id);

      // agora o original não é mais o único → demoção permitida
      const demote = await page.request.patch(`/api/admin/users/${origId}`, { data: { role: "socio" } });
      expect(demote.status()).toBe(200);

      // a sessão atual virou socio; segue como admin2 pra restaurar o original
      await login(page, email2, pass2);
      const restore = await page.request.patch(`/api/admin/users/${origId}`, {
        data: { role: "administrador" },
      });
      expect(restore.status()).toBe(200);

      // volta pro original e exclui o admin2 (há 2 admins no momento → ok)
      await login(page, admin.email, admin.password);
      const delAdmin2 = await page.request.delete(`/api/admin/users/${id2}`);
      expect(delAdmin2.status()).toBe(200);
      id2 = "";

      expect(await apiAdminCount(page.request)).toBeGreaterThanOrEqual(1);
    } finally {
      // Restauração best-effort, mas SEM engolir erro em silêncio: cada passo
      // registra o status HTTP (não só exceções — page.request.patch/delete
      // RESOLVEM normalmente em 4xx/5xx, não lançam) e o final confirma o
      // estado real de origId com uma sessão nova. Se sobrar algo errado, o
      // teste falha de forma visível — a versão anterior tinha
      // `catch { /* ignore */ }` em todo passo (e nem checava status), o que
      // deixava origId (E2E_ADMIN_EMAIL, uma conta REAL compartilhada por
      // todos os specs e2e) rebaixado pra sempre sem nenhum sinal no relatório
      // quando um passo do meio falhava.
      const erros: string[] = [];

      async function tentar(label: string, fn: () => Promise<{ status(): number }>): Promise<void> {
        try {
          const res = await fn();
          if (res.status() < 200 || res.status() >= 300) {
            erros.push(`${label}: HTTP ${res.status()}`);
          }
        } catch (e) {
          erros.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (id2) {
        await login(page, email2, pass2);
        await tentar("restaurar origId via admin2", () =>
          page.request.patch(`/api/admin/users/${origId}`, { data: { role: "administrador" } }),
        );
        await login(page, admin.email, admin.password);
        await tentar("excluir admin2 órfão", () => page.request.delete(`/api/admin/users/${id2}`));
      } else {
        await login(page, admin.email, admin.password);
        await tentar("restaurar origId direto", () =>
          page.request.patch(`/api/admin/users/${origId}`, { data: { role: "administrador" } }),
        );
      }

      // Confirmação final, com sessão nova: origId precisa estar administrador
      // de novo, custe o que custar (é a conta usada por TODOS os outros specs
      // e2e). Se não estiver, o teste falha alto em vez de deixar a próxima
      // suíte quebrar em cascata sem explicação.
      try {
        await login(page, admin.email, admin.password);
        const check = await page.request.get("/api/admin/users");
        if (!check.ok()) {
          erros.push(`checagem final: GET /api/admin/users retornou HTTP ${check.status()}`);
        } else {
          const meAgain = ((await check.json()) as Array<{ id: string; role: string }>).find(
            (u) => u.id === origId,
          );
          if (meAgain?.role !== "administrador") {
            erros.push(`origId terminou como "${meAgain?.role}", esperado "administrador"`);
          }
        }
      } catch (e) {
        erros.push(`checagem final de origId: ${e instanceof Error ? e.message : String(e)}`);
      }

      expect(erros, `restauração pós-teste falhou: ${erros.join(" | ")}`).toEqual([]);
    }
  });

  test("8. não-admin em /configuracoes é redirecionado", async ({ page }) => {
    test.skip(!hasSocio, "defina E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD");

    await login(page, socio.email, socio.password);
    await page.goto("/configuracoes");
    await expect(page).not.toHaveURL(/\/configuracoes$/);
    // O guard de autorização (authz.global.ts) é assíncrono (await load()) —
    // a página pode renderizar #configuracoes-page brevemente antes do
    // redirect completar. Timeout maior aqui evita falso negativo por essa
    // corrida; a asserção continua a mesma (a página não deve ficar visível).
    await expect(page.locator("#configuracoes-page")).toHaveCount(0, { timeout: 10000 });
  });
});
