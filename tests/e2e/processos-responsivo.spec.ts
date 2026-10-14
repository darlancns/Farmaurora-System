import { test, expect, type Page } from "@playwright/test";

// Responsividade de /processos (Rodada 3 do plano de responsividade — só
// CSS/layout, nenhuma lógica de dados/extração tocada). Roda contra dados
// reais já existentes na conta de teste (não cria nem apaga nada).
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — mesmo padrão
//   de tests/e2e/pagamentos-fluxo.spec.ts e pagamentos-responsivo.spec.ts)
//
// Mesma lição da Rodada 2: 768px é o próprio breakpoint `md`. As asserções de
// coluna única nos filtros e de toque ≥44px no botão excluir só rodam abaixo
// de 768px — em 768px (e acima) o layout já é o "atual" (linha, toque
// compacto), por design desta própria rodada.

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

// A lista vem agrupada por consultor (socio/operacional/administrador) ou já
// achatada (consultor, via `flat`). Garante que pelo menos uma linha de
// processo (#processo-row-*) fique visível, expandindo o primeiro grupo se
// for o caso — sem depender do nome de nenhum consultor específico.
async function garantirLinhaVisivel(page: Page): Promise<void> {
  const flat = page.locator("#processo-flat-list");
  if (await flat.count()) return;

  const primeiroGrupo = page.locator("[id^='processo-group-']").first();
  await primeiroGrupo.locator("button").first().click();
  await expect(page.locator("[id^='processo-row-']").first()).toBeVisible();
}

async function gotoProcessos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/processos", { waitUntil: "networkidle" });
  await garantirLinhaVisivel(page);
}

test.describe("Responsividade de /processos", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 800 },
    { name: "768px", width: 768, height: 1024 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await gotoProcessos(page, viewport);
      });

      test("sem overflow horizontal em nenhuma aba", async ({ page }) => {
        for (const tabId of ["#tab-andamento", "#tab-entregues"]) {
          await page.locator(tabId).click();
          await page.waitForTimeout(200);
          expect(await hasHorizontalOverflow(page), `overflow em ${tabId}`).toBe(false);
        }
      });

      test("paciente, pasta e responsável não truncam na primeira linha visível", async ({ page }) => {
        const row = page.locator("[id^='processo-row-']").first();

        // Nome do paciente: primeiro span.truncate dentro da linha.
        const nome = row.locator("span.truncate").first();
        expect(await nome.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);

        // Pasta: span font-mono ao lado do nome — nunca deve ter overflow de texto.
        const pasta = row.locator("span.font-mono.text-\\[11\\.5px\\]").first();
        if (await pasta.count()) {
          expect(await pasta.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
        }

        // Responsável: último span do grupo badge+data+responsável (só ganha
        // a classe truncate a partir de @[700px], quando o container já tem
        // largura suficiente pro layout de uma linha só).
        const responsavel = row.locator("div.flex-wrap > span").last();
        if (await responsavel.count()) {
          expect(await responsavel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
        }
      });
    });
  }

  test("abaixo de md (375px): filtros empilham em coluna única", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    const filtros = page.locator("#processo-search").locator("xpath=../..");
    expect(await filtros.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");

    const busca = await page.locator("#processo-search").boundingBox();
    const status = await page.locator("#filtro-status").boundingBox();
    expect(busca).not.toBeNull();
    expect(status).not.toBeNull();
    expect(status!.y).toBeGreaterThanOrEqual(busca!.y + busca!.height - 1);
    expect(busca!.width).toBeGreaterThan(375 * 0.7);
  });

  test("abaixo de md (375px): dados da linha de processo empilham (paciente em cima, badge/data/responsável embaixo, excluir no canto)", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    const row = page.locator("[id^='processo-row-']").first();
    const nomeBox = await row.locator("span.truncate").first().boundingBox();
    const badgeBox = await row.locator("[id^='badge-status-']").boundingBox();
    expect(nomeBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    // Badge (linha secundária) fica abaixo do nome (linha principal), não ao lado.
    expect(badgeBox!.y).toBeGreaterThanOrEqual(nomeBox!.y + nomeBox!.height - 1);
  });

  test("abaixo de md (375px): botão excluir tem toque de pelo menos 44px", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    const excluir = page.locator("[id^='btn-delete-processo-']").first();
    if ((await excluir.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de excluir processo");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("md+ (1440px): filtros na linha e botão excluir no tamanho compacto de sempre (28px)", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 1440, height: 900 });

    const filtros = page.locator("#processo-search").locator("xpath=../..");
    expect(await filtros.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");

    const excluir = page.locator("[id^='btn-delete-processo-']").first();
    if ((await excluir.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de excluir processo");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(28);
    expect(Math.round(box!.height)).toBe(28);
  });
});
