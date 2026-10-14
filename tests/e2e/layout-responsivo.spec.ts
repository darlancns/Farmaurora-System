import { test, expect, type Page } from "@playwright/test";

// Shell de navegação responsivo (sidebar <-> BottomNav). Depende de uma conta
// de teste já logável no Supabase, passada por env pro processo do
// Playwright — mesma E2E_USER_EMAIL/E2E_USER_PASSWORD usada em auth.spec.ts
// (qualquer cargo serve: este teste checa o shell, não RBAC por cargo).
//
//   E2E_USER_EMAIL / E2E_USER_PASSWORD

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const hasUser = Boolean(USER_EMAIL && USER_PASSWORD);

async function login(page: Page): Promise<void> {
  // Mesmo motivo do retry em auth.spec.ts/rbac.spec.ts: o Nuxt pode ainda
  // estar hidratando quando o Playwright interage, e sem hidratação o
  // @submit.prevent não roda (o form faz um GET nativo pra /login?, que
  // recarrega a página e limpa os campos preenchidos).
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(USER_EMAIL);
    await page.locator("#login-password").fill(USER_PASSWORD);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

test.describe("Shell de navegação — sidebar (desktop) vs BottomNav (mobile)", () => {
  test.describe.configure({ retries: 2 });

  test("mobile (375px): sidebar oculta, BottomNav visível, sem scroll horizontal na página", async ({
    page,
  }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await page.setViewportSize({ width: 375, height: 667 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    await expect(page.locator("#sidebar-nav")).toBeHidden();
    await expect(page.locator("#bottom-nav")).toBeVisible();

    const overflowsX = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowsX).toBe(false);
  });

  test("desktop (1440px): sidebar visível, BottomNav oculta", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    await expect(page.locator("#sidebar-nav")).toBeVisible();
    await expect(page.locator("#bottom-nav")).toBeHidden();
  });

  test("BottomNav mostra só as seções que o cargo logado pode acessar", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await page.setViewportSize({ width: 375, height: 667 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const bottomNavHrefs = await page.locator("#bottom-nav a").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    );
    const sidebarHrefs = await page
      .locator("#sidebar-nav a")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));

    // A sidebar continua no DOM (só oculta via CSS) — os dois consomem a mesma
    // fonte de itens (useNavLinks.ts), então a lista de rotas visíveis bate.
    expect(new Set(bottomNavHrefs.filter((h) => h !== null))).toEqual(
      new Set(sidebarHrefs.filter((h) => h !== null)),
    );
  });

  test("navegar pelo BottomNav funciona e destaca o item ativo", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await page.setViewportSize({ width: 375, height: 667 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const recadosLink = page.locator('#bottom-nav a[href="/recados"]');
    await recadosLink.click();
    await expect(page).toHaveURL(/\/recados$/);
    await expect(recadosLink).toHaveClass(/text-accent-dark/);
  });
});
