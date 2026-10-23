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
// O formulário não fica mais numa coluna lateral: abre num modal, como em
// Recados/Pagamentos/Processos. 1024px (lg) é o breakpoint do gatilho — a
// partir dele o botão "+ Nova prestação"; abaixo, o "+" flutuante (FAB). O
// modal é tela cheia abaixo de lg e cartão centralizado a partir dele.

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

async function abrirForm(page: Page, viewport: { width: number }): Promise<void> {
  await page.locator(viewport.width >= 1024 ? "#btn-nova-prestacao" : "#fab-nova-prestacao").click();
  await expect(page.locator("#patient-form")).toBeVisible();
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

      test("formulário abre fechado e, ao abrir, fica dentro da viewport", async ({ page }) => {
        await expect(page.locator("#patient-form")).toHaveCount(0);
        await abrirForm(page, viewport);
        const box = await page.locator("#patient-form").boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("campos-chave do formulário (data, paciente, medicamento) não ficam espremidos", async ({ page }) => {
        await abrirForm(page, viewport);
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

      test("seção de anexos expande dentro do formulário sem estourar a largura", async ({ page }) => {
        await abrirForm(page, viewport);
        await page.locator("#f-custo").fill("10000");
        await page.locator("#btn-open-attachments").click();
        const panel = page.locator("#attachments-panel");
        await expect(panel).toBeVisible();
        const formBox = await page.locator("#patient-form").boundingBox();
        const panelBox = await panel.boundingBox();
        expect(panelBox!.x).toBeGreaterThanOrEqual(formBox!.x - 1);
        expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("dropdown de consultor abre dentro da viewport, sem cortar", async ({ page }) => {
        await abrirForm(page, viewport);
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

  test("abaixo de lg (375px e 768px): só o FAB aparece; a lista ocupa a largura toda", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");

    for (const viewport of [
      { width: 375, height: 900 },
      { width: 768, height: 1024 },
    ]) {
      await gotoPrestacao(page, viewport);
      await expect(page.locator("#fab-nova-prestacao")).toBeVisible();
      await expect(page.locator("#btn-nova-prestacao")).toBeHidden();
      await expect(page.locator("#patient-form")).toHaveCount(0);

      const searchBox = await page.locator("#patient-search").boundingBox();
      expect(searchBox!.width).toBeGreaterThan(viewport.width - 64);
    }
  });

  test("lg+ (1024px e 1440px): botão com texto à direita da busca, FAB oculto, lista em largura total", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await gotoPrestacao(page, viewport);
      await expect(page.locator("#btn-nova-prestacao")).toBeVisible();
      await expect(page.locator("#fab-nova-prestacao")).toBeHidden();
      await expect(page.locator("#patient-form")).toHaveCount(0);

      const searchBox = await page.locator("#patient-search").boundingBox();
      const buttonBox = await page.locator("#btn-nova-prestacao").boundingBox();
      // Mesma linha: botão à direita da busca, e a busca ocupa o resto da largura.
      expect(buttonBox!.x).toBeGreaterThanOrEqual(searchBox!.x + searchBox!.width - 1);
      expect(searchBox!.width).toBeGreaterThan(viewport.width * 0.5);
    }
  });
});
