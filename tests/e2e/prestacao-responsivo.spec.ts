import { test, expect, type Page } from "@playwright/test";

// Responsividade de /prestacao (Rodada 4 do plano de responsividade — só
// CSS/layout, nenhuma lógica de dados/cálculo tocada, SSR hydration não
// mexido). Roda contra dados reais já existentes na conta de teste.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback — só socio e administrador
//   leem/escrevem em "patients", ver shared/utils/rbac.ts; operacional e
//   consultor são redirecionados pra fora de /prestacao)
//
// 1024px é o breakpoint escolhido (lg) pra colapsar formulário+tabela em
// coluna única — abaixo dele o layout empilha (formulário primeiro), a
// partir dele fica lado a lado, idêntico ao layout anterior à Rodada 4.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SOCIO_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SOCIO_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(writer.email);
    await page.locator("#login-password").fill(writer.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function gotoPrestacao(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/prestacao", { waitUntil: "networkidle" });
}

test.describe("Responsividade de /prestacao", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 900 },
    { name: "768px", width: 768, height: 1024 },
    { name: "1024px", width: 1024, height: 900 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport);
      });

      test("sem overflow horizontal", async ({ page }) => {
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("formulário de lançamento visível e dentro da viewport (não escondido atrás de scroll)", async ({
        page,
      }) => {
        const form = page.locator("#patient-form");
        await expect(form).toBeVisible();
        const box = await form.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      });

      test("campos-chave do formulário (data, paciente, medicamento) não ficam espremidos", async ({ page }) => {
        // "Espremido" = largura menor que o necessário pro conteúdo real sem
        // rolagem interna. Data (dd/mm/aaaa, 10 caracteres monoespaçados) e
        // Medicamento (nomes reais chegam a 25+ caracteres) são os campos que
        // a medição real apontou como apertados nos 400px fixos de antes.
        const dataBox = await page.locator("#f-data").boundingBox();
        const medicamentoBox = await page.locator("#f-medicamento-0").boundingBox();
        expect(dataBox).not.toBeNull();
        expect(medicamentoBox).not.toBeNull();
        expect(dataBox!.width).toBeGreaterThanOrEqual(100);
        expect(medicamentoBox!.width).toBeGreaterThanOrEqual(150);
      });

      test("dropdown de consultor abre dentro da viewport, sem cortar", async ({ page }) => {
        await page.locator("#f-consultor").click();
        const listbox = page.locator("#f-consultor-listbox");
        await expect(listbox).toBeVisible();
        const box = await listbox.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      });
    });
  }

  test("abaixo de lg (375px e 768px): formulário empilha acima da tabela", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");

    for (const viewport of [
      { width: 375, height: 900 },
      { width: 768, height: 1024 },
    ]) {
      await gotoPrestacao(page, viewport);
      const container = page.locator("#patient-form").locator("xpath=../..");
      expect(await container.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");

      const formBox = await page.locator("#patient-form").boundingBox();
      const searchBox = await page.locator("#patient-search").boundingBox();
      expect(formBox).not.toBeNull();
      expect(searchBox).not.toBeNull();
      // Formulário primeiro: a busca (topo da tabela) começa abaixo dele.
      expect(searchBox!.y).toBeGreaterThanOrEqual(formBox!.y + formBox!.height - 1);
    }
  });

  test("lg+ (1024px e 1440px): formulário e tabela lado a lado, igual ao layout anterior", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await gotoPrestacao(page, viewport);
      const container = page.locator("#patient-form").locator("xpath=../..");
      expect(await container.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");

      const formBox = await page.locator("#patient-form").boundingBox();
      const searchBox = await page.locator("#patient-search").boundingBox();
      expect(formBox).not.toBeNull();
      expect(searchBox).not.toBeNull();
      // Lado a lado: a busca fica à direita do formulário, na mesma altura aproximada.
      expect(searchBox!.x).toBeGreaterThanOrEqual(formBox!.x + formBox!.width - 1);
    }
  });
});
