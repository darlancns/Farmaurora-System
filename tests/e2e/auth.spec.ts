import { test, expect, type Page } from "@playwright/test";

// Estes testes rodam contra o servidor de dev real (webServer do
// playwright.config.ts). O login de verdade depende de um projeto Supabase
// configurado no .env do servidor E de credenciais de teste passadas por env
// para o processo do Playwright:
//
//   E2E_USER_EMAIL / E2E_USER_PASSWORD    -> conta de equipe (não-admin)
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD  -> conta admin (email em NUXT_ADMIN_EMAILS)
//   E2E_SERVICE_ROLE_KEY                  -> (opcional) para o teste de vazamento
//
// Os testes que não precisam de credenciais (redirect de rota protegida e
// checagem de que a service role key não vaza) rodam sempre; o resto é
// pulado com test.skip quando as credenciais não estão presentes.

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const SERVICE_ROLE_KEY = process.env.E2E_SERVICE_ROLE_KEY ?? "";

const hasUser = Boolean(USER_EMAIL && USER_PASSWORD);
const hasAdmin = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

async function login(page: Page, email: string, password: string): Promise<void> {
  // domcontentloaded (não networkidle): logo depois de uma troca de sessão/role
  // (ex.: configuracoes.spec.ts demovendo a própria conta), o cliente Supabase
  // mantém timers de refresh de token rodando em segundo plano — isso pode
  // impedir a rede de ficar "idle" e travar o goto por muito tempo. Só
  // precisamos do DOM pronto; a hidratação em si é tratada pelo retry abaixo.
  // Se já existir uma sessão válida no contexto (ex.: um login anterior no
  // mesmo teste), o guard global (auth.global.ts) redireciona /login -> /
  // ANTES do form aparecer — login() "sucede" sem autenticar como quem foi
  // pedido. Limpa cookies primeiro pra garantir que sempre é uma sessão nova.
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // O Nuxt pode ainda estar hidratando quando o Playwright clica — sem
  // hidratação o @submit.prevent não roda e o form faz um GET nativo pra
  // /login? (sem autenticar, sem mostrar erro). Diferente dos outros specs,
  // aqui login() também precisa terminar "com sucesso" no caso de credenciais
  // INVÁLIDAS (teste 2: fica em /login com #login-error visível) — então o
  // critério de "a hidratação pegou" é sair de /login OU o erro aparecer,
  // nunca só reclicar até sair da página de login.
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();

    const saiuDoLogin = await page
      .waitForURL((url) => !/\/login(\?|$)/.test(url.pathname + url.search), { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!saiuDoLogin) {
      await expect(page.locator("#login-error")).toBeVisible({ timeout: 500 });
    }
  }).toPass({ timeout: 45000 });
}

test.describe("Autenticação", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test("1. rota protegida sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.locator("#login-page")).toBeVisible();
  });

  test("2. login com credenciais inválidas mostra erro e não navega", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD (Supabase configurado)");

    await login(page, "nao-existe@farmaurora.com.br", "senha-errada-123");

    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("3. login válido redireciona para / e a sessão persiste no reload", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await login(page, USER_EMAIL, USER_PASSWORD);

    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await expect(page.locator("#sidebar-nav")).toBeVisible();

    await page.reload();
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await expect(page.locator("#sidebar-nav")).toBeVisible();
  });

  test("4. logout limpa a sessão e volta a bloquear rota protegida", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await login(page, USER_EMAIL, USER_PASSWORD);
    await expect(page.locator("#sidebar-nav")).toBeVisible();

    await page.locator("#logout-button").click();
    await expect(page).toHaveURL(/\/login(\?|$)/);

    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("5. POST /api/admin/users como usuário não-admin retorna 403", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await login(page, USER_EMAIL, USER_PASSWORD);
    await expect(page.locator("#sidebar-nav")).toBeVisible();

    const res = await page.request.post("/api/admin/users", {
      data: { email: `equipe+${Date.now()}@farmaurora.com.br`, password: "senha-super-forte-123" },
    });
    expect(res.status()).toBe(403);
  });

  test("6. POST /api/admin/users como admin cria o usuário", async ({ page }) => {
    test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.locator("#sidebar-nav")).toBeVisible();

    const email = `equipe+${Date.now()}@farmaurora.com.br`;
    let id: string | null = null;
    try {
      // role é obrigatório desde que parseRoleInput() passou a validar o cargo
      // (server/utils/authUser.ts) — sem ele a API rejeita com 400 antes mesmo
      // de chegar no fluxo de criação que este teste quer exercitar.
      const res = await page.request.post("/api/admin/users", {
        data: { email, password: "senha-super-forte-123", role: "operacional" },
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { id: string; email: string };
      expect(body.email).toBe(email);
      expect(body.id).toBeTruthy();
      id = body.id;

      // e-mail repetido -> 409
      const dup = await page.request.post("/api/admin/users", {
        data: { email, password: "senha-super-forte-123", role: "operacional" },
      });
      expect(dup.status()).toBe(409);
    } finally {
      // limpeza — em `finally` pra não deixar a conta órfã se alguma asserção
      // acima falhar (mesmo padrão de configuracoes.spec.ts, Round 0b).
      if (id) await page.request.delete(`/api/admin/users/${id}`);
    }
  });

  test("7. a service role key nunca aparece no HTML/bundle servido ao client", async ({ page }) => {
    const html = (await (await page.request.get("/login")).text()).toLowerCase();
    expect(html).not.toContain("supabaseservicerolekey");
    expect(html).not.toContain("service_role");
    if (SERVICE_ROLE_KEY) {
      expect(html).not.toContain(SERVICE_ROLE_KEY.toLowerCase());
    }

    // Também varre o payload de estado do Nuxt renderizado numa página protegida.
    const inicioHtml = (await (await page.request.get("/inicio")).text()).toLowerCase();
    expect(inicioHtml).not.toContain("supabaseservicerolekey");
    if (SERVICE_ROLE_KEY) {
      expect(inicioHtml).not.toContain(SERVICE_ROLE_KEY.toLowerCase());
    }
  });
});
