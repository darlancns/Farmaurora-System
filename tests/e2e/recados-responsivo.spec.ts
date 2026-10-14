import { test, expect, type Page } from "@playwright/test";

// Responsividade de /recados (Rodada 6, parte 1 — só CSS/layout). "recados" é
// a única seção liberada pra todos os cargos (ver shared/utils/rbac.ts), então
// qualquer conta de teste válida serve — reaproveita E2E_USER_EMAIL, mesma
// conta "genérica" usada em auth.spec.ts/layout-responsivo.spec.ts.

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const hasUser = Boolean(USER_EMAIL && USER_PASSWORD);

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(USER_EMAIL);
    await page.locator("#login-password").fill(USER_PASSWORD);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function gotoRecados(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/recados", { waitUntil: "networkidle" });
}

test.describe("Responsividade de /recados", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 900 },
    { name: "768px", width: 768, height: 1024 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");
        await gotoRecados(page, viewport);
      });

      test("sem overflow horizontal", async ({ page }) => {
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("abas 'Recebidos' e 'Enviados' visíveis e nunca cobertas pelo botão '+ Novo recado'", async ({
        page,
      }) => {
        await expect(page.locator("#tab-recebidos")).toBeVisible();
        await expect(page.locator("#tab-enviados")).toBeVisible();

        const recebidos = await page.locator("#tab-recebidos").boundingBox();
        const enviados = await page.locator("#tab-enviados").boundingBox();
        const botao = await page.locator("#btn-novo-recado").boundingBox();

        expect(boxesOverlap(recebidos, botao)).toBe(false);
        expect(boxesOverlap(enviados, botao)).toBe(false);
      });

      test("abas 'Recebidos' e 'Enviados' são clicáveis (não bloqueadas pelo botão por cima)", async ({
        page,
      }) => {
        await page.locator("#tab-recebidos").click();
        await expect(page.locator("#tab-recebidos")).toHaveClass(/border-accent-dark/);

        await page.locator("#tab-enviados").click();
        await expect(page.locator("#tab-enviados")).toHaveClass(/border-accent-dark/);
      });

      test("botão '+ Novo recado' continua visível e funcional", async ({ page }) => {
        const botao = page.locator("#btn-novo-recado");
        await expect(botao).toBeVisible();
        await botao.click();
        // Aba padrão é "todos", então "+ Novo recado" abre o modal de recado
        // (não o de lembrete, que só aparece na aba "Meus lembretes").
        await expect(page.locator("#recado-form-overlay")).toBeVisible();
      });
    });
  }

  test("md+ (1440px): botão continua posicionado à direita da barra de abas, igual ao layout anterior", async ({
    page,
  }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");
    await gotoRecados(page, { width: 1440, height: 900 });

    const enviados = await page.locator("#tab-enviados").boundingBox();
    const botao = await page.locator("#btn-novo-recado").boundingBox();
    expect(enviados).not.toBeNull();
    expect(botao).not.toBeNull();
    // Lado a lado, à direita das abas — não empilhado abaixo delas.
    expect(botao!.x).toBeGreaterThan(enviados!.x + enviados!.width);
    expect(Math.abs(botao!.y - enviados!.y)).toBeLessThan(30);
  });
});
