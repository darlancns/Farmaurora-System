import { test, expect, type Page } from "@playwright/test";

// Responsividade de /pagamentos (Rodada 2 do plano de responsividade — só
// CSS/layout, nenhum cálculo/valor tocado). Roda contra dados reais já
// existentes na conta de teste (não cria nem apaga nada) — se não houver
// nenhum "pagamento realizado" na empresa da conta usada, os testes que
// dependem de uma linha existente pulam em vez de falhar.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — mesmo padrão
//   de tests/e2e/pagamentos-fluxo.spec.ts)
//
// 768px é o próprio breakpoint `md` do Tailwind (mesmo usado pela sidebar
// desde a Rodada 1) — nele os filtros já voltam ao layout "atual" (linha com
// wrap) e os botões de ação ao tamanho compacto de sempre (28px), exatamente
// como o pedido desta rodada especificou (`p-2.5 md:p-1.5`). Por isso as
// asserções de coluna única e de toque ≥44px só rodam abaixo de 768px — em
// 768px o que se garante é ausência de overflow, nome completo (sem truncar)
// e dropdown sem cortar, que é onde a auditoria original achou o problema.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
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

async function gotoPagamentos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/pagamentos", { waitUntil: "networkidle" });
}

test.describe("Responsividade de /pagamentos", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 800 },
    { name: "768px", width: 768, height: 1024 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await gotoPagamentos(page, viewport);
      });

      test("sem overflow horizontal em nenhuma aba", async ({ page }) => {
        for (const tabId of ["#tab-banco", "#tab-cotacao", "#tab-despachante", "#tab-transportadora"]) {
          await page.locator(tabId).click();
          await page.waitForTimeout(200);
          expect(await hasHorizontalOverflow(page), `overflow em ${tabId}`).toBe(false);
        }
      });

      test("nome do cliente nos lançamentos realizados não trunca", async ({ page }) => {
        const nomes = page.locator("#banco-realizados-lista span.truncate").first();
        if ((await nomes.count()) === 0) {
          test.skip(true, "sem lançamentos realizados na conta de teste");
        }
        const overflow = await nomes.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflow).toBe(false);
      });

      test("dropdown de fornecedor abre dentro da viewport, sem cortar", async ({ page }) => {
        const select = page.locator("#filtro-fornecedor-realizado");
        if ((await select.count()) === 0) {
          test.skip(true, "filtro não renderizado (sem lançamentos)");
        }
        await select.click();
        const listbox = page.locator("#filtro-fornecedor-realizado-listbox");
        await expect(listbox).toBeVisible();
        const box = await listbox.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      });
    });
  }

  test("abaixo de md (375px): filtros de 'pagamentos realizados' empilham em coluna única", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 375, height: 800 });

    const filtros = page.locator("#banco-realizado-busca").locator("xpath=../..");
    const flexDirection = await filtros.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(flexDirection).toBe("column");

    const busca = await page.locator("#banco-realizado-busca").boundingBox();
    const banco = await page.locator("#filtro-banco-realizado").boundingBox();
    expect(busca).not.toBeNull();
    expect(banco).not.toBeNull();
    // Empilhados: o segundo filtro começa abaixo do primeiro (não lado a lado).
    expect(banco!.y).toBeGreaterThanOrEqual(busca!.y + busca!.height - 1);
    // E cada um ocupa a largura cheia disponível (não uma coluna estreita fixa).
    expect(busca!.width).toBeGreaterThan(375 * 0.7);
  });

  test("abaixo de md (375px): botões de editar/excluir realizado têm toque de pelo menos 44px", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 375, height: 800 });

    const excluir = page.locator("[id^='btn-excluir-lancamento-']").first();
    if ((await excluir.count()) === 0) {
      test.skip(true, "sem lançamentos realizados na conta de teste");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("md+ (1440px): filtros na linha e botões de ação no tamanho compacto de sempre (28px)", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 1440, height: 900 });

    const filtros = page.locator("#banco-realizado-busca").locator("xpath=../..");
    expect(await filtros.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");

    const excluir = page.locator("[id^='btn-excluir-lancamento-']").first();
    if ((await excluir.count()) === 0) {
      test.skip(true, "sem lançamentos realizados na conta de teste");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(28);
    expect(Math.round(box!.height)).toBe(28);
  });
});
