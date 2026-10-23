import { test, expect, type Page } from "@playwright/test";

// Shell de navegação responsivo (sidebar <-> BottomNav). O ponto de troca é lg
// (1024px): abaixo dele (mobile e tablet) vale o BottomNav; de 1024px pra cima,
// a sidebar. Depende de uma conta
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

// Cor do token --color-accent-dark (#0b3956), a mesma da sidebar.
const ACCENT_DARK_RGB = "rgb(11, 57, 86)";

test.describe("Shell de navegação — sidebar (desktop) vs BottomNav (mobile/tablet)", () => {
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

  // Tablet entra no BottomNav (refino do breakpoint lg): 1023px é o último pixel antes de lg.
  for (const viewport of [
    { name: "tablet retrato (768px)", width: 768, height: 1024 },
    { name: "tablet (820px)", width: 820, height: 1180 },
    { name: "tablet paisagem (1023px)", width: 1023, height: 768 },
  ]) {
    test(`${viewport.name}: sidebar oculta, BottomNav visível, sem scroll horizontal`, async ({ page }) => {
      test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);
      await page.goto("/processos", { waitUntil: "networkidle" });

      await expect(page.locator("#sidebar-nav")).toBeHidden();
      await expect(page.locator("#bottom-nav")).toBeVisible();

      const overflowsX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflowsX).toBe(false);
    });
  }

  // Desktop não muda (regra crítica do refino do breakpoint lg): de 1024px pra cima a sidebar
  // continua sendo a navegação e o BottomNav não renderiza espaço nenhum.
  for (const viewport of [
    { name: "1024px (limite inferior de lg)", width: 1024, height: 768 },
    { name: "1280px", width: 1280, height: 800 },
    { name: "1440px", width: 1440, height: 900 },
    { name: "1920px", width: 1920, height: 1080 },
  ]) {
    test(`desktop (${viewport.name}): sidebar visível, BottomNav oculta`, async ({ page }) => {
      test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);
      await page.goto("/processos", { waitUntil: "networkidle" });

      await expect(page.locator("#sidebar-nav")).toBeVisible();
      await expect(page.locator("#bottom-nav")).toBeHidden();
      // O padding-bottom que reserva espaço pro BottomNav não vale em lg+.
      const paddingBottom = await page
        .locator("#app-main-content")
        .evaluate((el) => getComputedStyle(el).paddingBottom);
      expect(paddingBottom).toBe("40px");
    });
  }

  test("abaixo de lg o conteúdo reserva espaço pro BottomNav (padding-bottom ≥ altura da barra)", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    for (const width of [375, 1023]) {
      await page.setViewportSize({ width, height: 800 });
      await login(page);
      await page.goto("/processos", { waitUntil: "networkidle" });

      const paddingBottom = await page
        .locator("#app-main-content")
        .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
      const navHeight = (await page.locator("#bottom-nav").boundingBox())!.height;
      expect(paddingBottom, `${width}px`).toBeGreaterThanOrEqual(navHeight);
    }
  });

  test("BottomNav: fundo azul-marinho da sidebar, rótulos brancos e toque ≥52px por item", async ({ page }) => {
    test.skip(!hasUser, "defina E2E_USER_EMAIL / E2E_USER_PASSWORD");

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const nav = page.locator("#bottom-nav");
    expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ACCENT_DARK_RGB);
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    const items = nav.locator("a, button");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box!.height, `item ${i}`).toBeGreaterThanOrEqual(52);
      // Ativo = branco pleno; inativo = branco com opacidade (o Chromium serializa
      // `text-white/65` em oklab) — nunca o cinza/azul antigo.
      const color = await items.nth(i).evaluate((el) => getComputedStyle(el).color);
      expect(color, `item ${i}`).toMatch(/^(rgba?\(255, 255, 255|color\(srgb 1 1 1|oklab\(0\.99)/);
    }

    // Fica colada no rodapé da viewport.
    const navBox = await nav.boundingBox();
    expect(Math.round(navBox!.y + navBox!.height)).toBe(844);
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
    // Item ativo: aria-current + fundo translúcido; o de antes (processos) perde o destaque.
    await expect(recadosLink).toHaveAttribute("aria-current", "page");
    await expect(recadosLink).toHaveClass(/bg-white\/12/);
    await expect(page.locator('#bottom-nav a[href="/processos"]')).not.toHaveAttribute("aria-current", "page");
  });
});
