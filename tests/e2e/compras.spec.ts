import { test, expect, type Page } from "@playwright/test";

// Página Compras e a barreira de acesso: ESCRITO, NÃO EXECUTADO (a e2e só roda no Supabase local; ver a guarda em tests/e2e/_guards).
// Quem entra: administrador, operacional (leem e escrevem) e sócio (só lê). O consultor não vê o menu, é redirecionado da página e leva
// 403 na API. O que a tela faz está em compras-pagina.spec.ts; aqui ficam o menu, a barreira da página e a barreira da API.
//
// Credenciais por env (os mesmos nomes de rbac.spec.ts); cada teste é pulado sem elas. Nenhuma conta é criada aqui.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const socio = cred("SOCIO");
const operacional = cred("OPERACIONAL");
const consultor = cred("CONSULTOR");
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

for (const [rotulo, conta] of [
  ["administrador", admin],
  ["operacional", operacional],
  ["sócio", socio],
] as const) {
  test.describe(`Compras — ${rotulo}: vê o menu e abre a página`, () => {
    test.describe.configure({ retries: 2 });
    test.skip(!tem(conta), `defina E2E_${rotulo === "sócio" ? "SOCIO" : rotulo.toUpperCase()}_EMAIL / _PASSWORD`);

    test("o item Compras é o 3º da navegação (depois de DIR e Follow-Up) e a página abre com o título e as três colunas", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await login(page, conta.email, conta.password);
      await page.goto("/processos", { waitUntil: "networkidle" });
      const hrefs = await page.locator("#sidebar-nav a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      expect(hrefs.at(-1)).toBe("/configuracoes");
      expect(hrefs.indexOf("/compras")).toBe(hrefs.indexOf("/processos") + 1); // logo depois do Follow-Up

      await page.locator("#sidebar-nav a[href='/compras']").click();
      await expect(page).toHaveURL(/\/compras$/);
      await expect(page.locator("h1")).toHaveText("Compras");
      for (const id of ["#compras-coluna-esquerda", "#compras-coluna-central", "#compras-coluna-direita"]) await expect(page.locator(id)).toBeVisible();
      await expect(page.locator("#compras-sem-selecao")).toHaveText("Escolha uma compra ou crie uma nova.");
      // Só quem escreve vê "+ Nova compra" (o sócio só lê).
      await expect(page.locator("#btn-nova-compra")).toHaveCount(rotulo === "sócio" ? 0 : 1);
    });

    test("no celular, Compras fica entre os 4 itens fixos e Recados e Configurações atrás do botão 'Mais' (6 itens passam do limite de 5)", async ({ page }) => {
      test.skip(rotulo === "administrador", "o administrador tem 7 itens: o 'Mais' também leva Prestações (ver dir-responsivo.spec.ts)");
      await page.setViewportSize({ width: 375, height: 667 });
      await login(page, conta.email, conta.password);
      await page.goto("/processos", { waitUntil: "networkidle" });
      const fixos = await page.locator("#bottom-nav a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      expect(fixos).toContain("/compras");
      await page.locator("#btn-bottom-nav-more").click();
      const noMais = await page.locator("#nav-more-sheet a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      expect(noMais).toEqual(["/recados", "/configuracoes"]);
    });
  });
}

test.describe("Compras — consultor: sem menu, sem página, sem API", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!tem(consultor), "defina E2E_CONSULTOR_EMAIL / _PASSWORD");

  test("não há item Compras; abrir /compras redireciona para o Follow-Up", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, consultor.email, consultor.password);
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#sidebar-nav a[href='/compras']")).toHaveCount(0);
    await page.goto("/compras", { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/compras/);
    await expect(page.locator("#compras-page")).toHaveCount(0);
  });

  test("a API devolve 403 em leitura e em escrita", async ({ page }) => {
    await login(page, consultor.email, consultor.password);
    expect((await page.request.get("/api/compras")).status()).toBe(403);
    expect((await page.request.post("/api/compras", { data: {} })).status()).toBe(403);
  });
});

test.describe("Compras — a barreira da API", () => {
  test.describe.configure({ retries: 2 });

  test("sócio: escrever é 403 (a regra vale antes de qualquer rota); ler é permitido", async ({ page }) => {
    test.skip(!tem(socio), "defina E2E_SOCIO_EMAIL / _PASSWORD");
    await login(page, socio.email, socio.password);
    for (const metodo of ["post", "put", "patch", "delete"] as const) {
      expect((await page.request[metodo]("/api/compras/1", { data: {} })).status(), metodo).toBe(403);
    }
    for (const rota of ["/api/compras/temperaturas", "/api/compras/pre-cadastro-medicamentos"]) {
      expect((await page.request.post(rota, { data: {} })).status(), rota).toBe(403);
    }
    expect((await page.request.get("/api/compras")).status()).toBe(200);
    expect((await page.request.get("/api/compras/opcoes")).status()).toBe(200);
  });

  test("administrador: a lista do mês e as opções respondem 200 (só leitura; nenhuma compra é criada aqui)", async ({ page }) => {
    test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / _PASSWORD");
    await login(page, admin.email, admin.password);
    const lista = await page.request.get("/api/compras");
    expect(lista.status()).toBe(200);
    expect(await lista.json()).toMatchObject({ compras: expect.any(Array), totais: expect.any(Object) });
    const opcoes = await page.request.get("/api/compras/opcoes");
    expect(opcoes.status()).toBe(200);
    expect(JSON.stringify(await opcoes.json()).toLowerCase()).not.toMatch(/chave_?pix/);
    expect((await page.request.get("/api/compras/id_que_nao_existe")).status()).toBe(404);
  });

  test("sem sessão: 401", async ({ request }) => {
    expect((await request.get("/api/compras")).status()).toBe(401);
  });
});
