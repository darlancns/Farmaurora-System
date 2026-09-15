import { test, expect, type Page } from "@playwright/test";

// RBAC end-to-end. Depende de contas de teste já criadas no Supabase, cada uma
// com `app_metadata.role` (e `consultorNome` para o cargo consultor), passadas
// por env para o processo do Playwright:
//
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD
//   E2E_CONSULTOR_EMAIL / E2E_CONSULTOR_PASSWORD / E2E_CONSULTOR_NOME
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
//
// Cada teste é pulado (test.skip) quando as credenciais do cargo não estão
// presentes. Nenhuma conta é criada aqui.

const socio = { email: process.env.E2E_SOCIO_EMAIL ?? "", password: process.env.E2E_SOCIO_PASSWORD ?? "" };
const consultor = {
  email: process.env.E2E_CONSULTOR_EMAIL ?? "",
  password: process.env.E2E_CONSULTOR_PASSWORD ?? "",
  nome: process.env.E2E_CONSULTOR_NOME ?? "",
};
const operacional = {
  email: process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };

const hasSocio = Boolean(socio.email && socio.password);
const hasConsultor = Boolean(consultor.email && consultor.password && consultor.nome);
const hasOperacional = Boolean(operacional.email && operacional.password);
const hasAdmin = Boolean(admin.email && admin.password);

async function login(page: Page, email: string, password: string): Promise<void> {
  // domcontentloaded, não networkidle: o cliente Supabase mantém timers de
  // refresh de token em segundo plano que podem nunca deixar a rede "idle";
  // o DOM pronto basta, a hidratação é tratada pelo retry abaixo.
  // Se já existir uma sessão válida no contexto, o guard global
  // (auth.global.ts) redireciona /login -> / antes do form aparecer — limpa
  // cookies primeiro pra garantir sempre uma sessão nova.
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

test.describe("RBAC", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test("socio: lê tudo, sem botões de escrita, POST direto → 403", async ({ page }) => {
    test.skip(!hasSocio, "defina E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD");

    await login(page, socio.email, socio.password);

    // Prestações — vê a listagem, sem form nem botões de editar/excluir.
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/prestacao$/);
    await expect(page.locator("#patient-form")).toHaveCount(0);
    await expect(page.locator("[id^='btn-edit-patient-']")).toHaveCount(0);
    await expect(page.locator("[id^='btn-delete-patient-']")).toHaveCount(0);
    // Gerar Word continua disponível.
    await expect(page.locator("[id^='btn-generate-word-']").first()).toBeVisible();

    // Processos — agrupamento normal, sem "novo processo" nem excluir.
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-processo")).toHaveCount(0);
    await expect(page.locator("#processo-group-list")).toBeVisible();

    // Pagamentos — sem botões de novo lançamento / novo pagamento / editar realizado.
    await page.goto("/pagamentos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-lote-banco")).toHaveCount(0);
    await expect(page.locator("[id^='btn-editar-realizado-']")).toHaveCount(0);

    // API: leitura de pagamentos ok, escrita bloqueada em todas as seções.
    const getPag = await page.request.get("/api/pagamentos/banco");
    expect(getPag.ok()).toBeTruthy();
    const post = await page.request.post("/api/patients", { data: { paciente: "x" } });
    expect(post.status()).toBe(403);
    const postProc = await page.request.post("/api/processos", { data: { paciente: "x" } });
    expect(postProc.status()).toBe(403);
    const postPag = await page.request.post("/api/pagamentos/banco", { data: {} });
    expect(postPag.status()).toBe(403);
  });

  test("consultor: só Follow-up, só os próprios processos, /prestacao redireciona", async ({ page }) => {
    test.skip(!hasConsultor, "defina E2E_CONSULTOR_EMAIL / _PASSWORD / _NOME");

    await login(page, consultor.email, consultor.password);

    // Cai direto em /processos.
    await expect(page).toHaveURL(/\/processos$/);

    // Menu lateral só tem Follow-up.
    await expect(page.locator("#sidebar-nav a[href='/prestacao']")).toHaveCount(0);
    await expect(page.locator("#sidebar-nav a[href='/pagamentos']")).toHaveCount(0);

    // /prestacao e /pagamentos redirecionam de volta.
    await page.goto("/prestacao");
    await expect(page).toHaveURL(/\/processos$/);
    await page.goto("/pagamentos");
    await expect(page).toHaveURL(/\/processos$/);

    // Lista achatada, sem criar/editar.
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-processo")).toHaveCount(0);
    await expect(page.locator("[id^='btn-delete-processo-']")).toHaveCount(0);

    // API: só devolve processos do próprio consultor.
    const res = await page.request.get("/api/processos");
    expect(res.ok()).toBeTruthy();
    const processos = (await res.json()) as Array<{ consultor: string }>;
    for (const p of processos) {
      expect(p.consultor).toBe(consultor.nome);
    }
  });

  test("operacional: Follow-up e Pagamentos com escrita, /prestacao redireciona", async ({ page }) => {
    test.skip(!hasOperacional, "defina E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD");

    await login(page, operacional.email, operacional.password);
    await expect(page).toHaveURL(/\/processos$/);

    // Vê todos os consultores (agrupamento) e pode criar.
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-processo")).toBeVisible();
    await expect(page.locator("#processo-group-list")).toBeVisible();

    // Pagamentos: link visível, página acessível e com controles de escrita (não readonly).
    await expect(page.locator("#sidebar-nav a[href='/pagamentos']")).toBeVisible();
    await page.goto("/pagamentos", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/pagamentos$/);
    await expect(page.locator("#btn-novo-lote-banco")).toBeVisible();

    // Sem acesso a Patients.
    await page.goto("/prestacao");
    await expect(page).toHaveURL(/\/processos$/);

    // API: escreve em processos e em pagamentos; patients segue 403.
    const okProc = await page.request.get("/api/processos");
    expect(okProc.ok()).toBeTruthy();

    const okPag = await page.request.get("/api/pagamentos/banco");
    expect(okPag.ok()).toBeTruthy();
    // escrita autorizada: body inválido de propósito → 400 (validação), nunca 403.
    const writePag = await page.request.post("/api/pagamentos/banco", { data: {} });
    expect(writePag.status()).not.toBe(403);
    expect(writePag.status()).not.toBe(401);

    const patients = await page.request.get("/api/patients");
    expect(patients.status()).toBe(403);
  });

  test("administrador: acesso total, sem restrição", async ({ page }) => {
    test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

    await login(page, admin.email, admin.password);

    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await expect(page.locator("#patient-form")).toBeVisible();

    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-processo")).toBeVisible();

    await page.goto("/pagamentos", { waitUntil: "networkidle" });
    await expect(page.locator("#btn-novo-lote-banco")).toBeVisible();

    for (const path of ["/api/patients", "/api/processos", "/api/pagamentos/banco"]) {
      const res = await page.request.get(path);
      expect(res.ok(), path).toBeTruthy();
    }
  });

  test("não dá pra se auto-promover mexendo em localStorage/cookie", async ({ page }) => {
    test.skip(!hasConsultor, "defina E2E_CONSULTOR_EMAIL / _PASSWORD / _NOME");

    await login(page, consultor.email, consultor.password);

    // Injeta um role falso em qualquer storage do client.
    await page.evaluate(() => {
      try {
        localStorage.setItem("auth-user", JSON.stringify({ role: "administrador", isAdmin: true }));
        localStorage.setItem("role", "administrador");
        document.cookie = "role=administrador; path=/";
      } catch {
        /* ignore */
      }
    });

    // O servidor continua resolvendo o cargo real pelo JWT assinado.
    const me = await page.request.get("/api/auth/me");
    expect(me.ok()).toBeTruthy();
    const body = (await me.json()) as { role: string; isAdmin: boolean };
    expect(body.role).toBe("consultor");
    expect(body.isAdmin).toBe(false);

    // E a API protegida segue bloqueada.
    const patients = await page.request.get("/api/patients");
    expect(patients.status()).toBe(403);
  });
});
