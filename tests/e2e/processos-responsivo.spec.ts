import { test, expect, type Page } from "@playwright/test";

// Responsividade de /processos (Rodada 3 do plano de responsividade — só
// CSS/layout, nenhuma lógica de dados/extração tocada). Roda contra dados
// reais já existentes na conta de teste (não cria nem apaga nada).
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — mesmo padrão
//   de tests/e2e/pagamentos-fluxo.spec.ts e pagamentos-responsivo.spec.ts)
//
// Mesma lição da Rodada 2: 768px é o próprio breakpoint `md` (usado pelas linhas
// de processo, ex.: toque ≥44px no botão excluir só abaixo de 768px). Já o shell
// e a toolbar de filtros trocam em `lg` (1024px) no refino do breakpoint lg — ver
// processos-mobile-shell.spec.ts e processos-desktop-shell.spec.ts.

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

      test("paciente, pasta e responsável não vazam na primeira linha visível (card mobile)", async ({ page }) => {
        const row = page.locator("[id^='processo-row-']").first();
        const id = (await row.getAttribute("id"))!.replace("processo-row-", "");

        // Nome: até 2 linhas (line-clamp), nunca com rolagem horizontal.
        const nome = row.locator(`#mobile-paciente-${id}`);
        expect(await nome.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);

        // Ordem · Pasta: texto corrido, sem overflow.
        const ordemPasta = row.locator(`#mobile-ordem-pasta-${id}`);
        expect(await ordemPasta.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);

        // Responsável: truncate com reticências, mas cabendo na linha do card.
        const responsavel = row.locator(`#mobile-responsavel-${id}`);
        const respBox = await responsavel.boundingBox();
        const rowBox = await row.boundingBox();
        expect(respBox!.x + respBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
      });
    });
  }

  // No refino do breakpoint lg os 3 selects não ficam mais empilhados na tela abaixo de lg:
  // moram no bottom sheet aberto pelo ícone ao lado da busca (cobertura detalhada
  // em processos-mobile-shell.spec.ts).
  test("abaixo de lg (375px): linha de filtros em coluna única; busca larga com o ícone dentro dela, selects fora da tela", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    const filtros = page.locator("#processo-filtros");
    expect(await filtros.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");

    const busca = await page.locator("#processo-search").boundingBox();
    const icone = await page.locator("#btn-filtros-processo").boundingBox();
    expect(busca).not.toBeNull();
    expect(icone).not.toBeNull();
    // Botão de filtros DENTRO da barra de busca (processos-mobile-shell.spec.ts mede em detalhe).
    expect(icone!.x).toBeGreaterThanOrEqual(busca!.x - 1);
    expect(icone!.x + icone!.width).toBeLessThanOrEqual(busca!.x + busca!.width + 1);
    expect(busca!.width).toBeGreaterThan(375 * 0.7);
    for (const id of ["#filtro-status", "#filtro-empresa", "#filtro-responsavel"]) {
      expect(await page.locator(id).boundingBox(), id).toBeNull();
    }
  });

  test("abaixo de lg (375px): no card de processo o selo de status fica na MESMA linha do nome (à direita)", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    const row = page.locator("[id^='processo-row-']").first();
    const nomeBox = await row.locator("[id^='mobile-paciente-']").boundingBox();
    const badgeBox = await row.locator("[id^='mobile-badge-status-']").boundingBox();
    expect(nomeBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(badgeBox!.x).toBeGreaterThanOrEqual(nomeBox!.x + nomeBox!.width - 1);
    expect(Math.abs(badgeBox!.y - nomeBox!.y)).toBeLessThanOrEqual(8);
  });

  test("abaixo de lg (375px): a lixeira saiu do cabeçalho do card e vive no rodapé do detalhe, com toque de pelo menos 44px", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 375, height: 800 });

    // Antes de abrir o detalhe, nenhuma lixeira ocupa espaço no card.
    expect(await page.locator("[id^='btn-delete-processo-']:visible").count()).toBe(0);

    const row = page.locator("[id^='processo-row-']").first();
    await row.locator("> button").click();
    const excluir = row.locator("[id^='btn-delete-processo-footer-']");
    if ((await excluir.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de excluir processo");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("lg+ (1440px): filtros na linha e botão excluir no tamanho compacto de sempre (28px)", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 1440, height: 900 });

    const filtros = page.locator("#processo-filtros");
    expect(await filtros.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");

    const excluir = page.locator("[id^='btn-delete-processo-']:visible").first();
    if ((await excluir.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de excluir processo");
    }
    const box = await excluir.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(28);
    expect(Math.round(box!.height)).toBe(28);
  });
});
