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
// O breakpoint desta tela é `lg` (1024px): abaixo dele os filtros de "Pagamentos
// realizados" moram num bottom sheet (ícone dentro da busca), os botões de ação
// ficam com toque de 44px (`p-3.5 lg:p-1.5`) e o "+" é o botão flutuante. De lg em
// diante: filtros em linha e botões compactos de 28px, como sempre. O refino mobile
// (abas, "+", cabeçalhos de lote, cards pagos, painel) é coberto com dados
// adversariais em pagamentos-mobile-shell.spec.ts; aqui ficam as asserções que rodam
// contra os dados reais da conta (ausência de overflow, nome completo, dropdown etc.).
//
// Cards de item e cabeçalhos: abaixo de lg o card tem um bloco próprio (lg:hidden), com os ids dos
// botões de ação prefixados com `mobile-`; em lg+ vale o bloco de sempre (hidden lg:block, container
// query), com os ids originais. Por isso o layout de lg+ fica no 2º nível (`firstElementChild` do card é
// o bloco de lg+, e o seu primeiro filho é o grid/flex de sempre).

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
        // Abaixo de lg (inclusive o tablet, onde o card passa de 640px) vale o bloco mobile: o nome quebra
        // e nunca é cortado. As reticências são só do layout de lg+ (variante display:none aqui).
        if ((await page.locator("#banco-realizados-lista span.font-medium").count()) === 0) {
          test.skip(true, "sem lançamentos realizados na conta de teste");
        }
        const nomes = page.locator("#banco-realizados-lista span.font-medium").filter({ visible: true }).first();
        expect(await nomes.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
        const overflow = await nomes.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflow).toBe(false);
      });

      test("dropdown de fornecedor (no painel de filtros) abre dentro da viewport, sem cortar", async ({ page }) => {
        const icone = page.getByRole("button", { name: "Filtros", exact: true });
        if ((await icone.count()) === 0) {
          test.skip(true, "ícone de filtros não renderizado");
        }
        await icone.click();
        const select = page.locator("#sheet-filtro-fornecedor-realizado");
        await select.click();
        const listbox = page.locator("#sheet-filtro-fornecedor-realizado-listbox");
        await expect(listbox).toBeVisible();
        const box = await listbox.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      });
    });
  }

  test("abaixo de lg (375px): só a busca fica na tela, com o ícone de filtros dentro dela (selects no painel)", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 375, height: 800 });

    const filtros = page.locator("#banco-realizado-busca").locator("xpath=../..");
    const flexDirection = await filtros.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(flexDirection).toBe("column");

    const busca = await page.locator("#banco-realizado-busca").boundingBox();
    expect(busca).not.toBeNull();
    // A busca ocupa a largura cheia disponível (não uma coluna estreita fixa).
    expect(busca!.width).toBeGreaterThan(375 * 0.7);

    // Os 3 selects em linha saem da tela; o ícone (botão "Filtros") fica dentro da busca, à direita.
    await expect(page.locator("#filtro-banco-realizado")).toBeHidden();
    const icone = page.getByRole("button", { name: "Filtros", exact: true });
    const caixa = await icone.boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(busca!.x + busca!.width + 0.5);
    expect(caixa!.y).toBeGreaterThanOrEqual(busca!.y - 0.5);
  });

  test('abaixo de lg (375px): rótulo "Câmbio" e "+" flutuante acessível por role/aria-label', async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 375, height: 800 });

    await expect(page.getByRole("button", { name: "Câmbio", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cotação Câmbio" })).toHaveCount(0);
    // Banco: o "+" é o novo pagamento; o botão de texto do cabeçalho da seção fica oculto.
    await expect(page.getByRole("button", { name: "Novo pagamento", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Novo pagamento" })).toHaveCount(0);

    await page.locator("#tab-despachante").click();
    await expect(page.getByRole("button", { name: "Adicionar pagamento", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Adicionar pagamento" })).toHaveCount(0);

    // Câmbio: sem nenhum botão de adicionar.
    await page.locator("#tab-cotacao").click();
    await expect(page.getByRole("button", { name: "Novo pagamento", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Adicionar pagamento", exact: true })).toHaveCount(0);
  });

  test("lg+ (1280px): botões de texto no cabeçalho das seções e nenhum '+' flutuante", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 1280, height: 800 });

    await expect(page.getByRole("button", { name: "+ Novo pagamento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo pagamento", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Câmbio", exact: true })).toBeVisible();
    await page.locator("#tab-transportadora").click();
    await expect(page.getByRole("button", { name: "+ Adicionar pagamento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar pagamento", exact: true })).toHaveCount(0);
  });

  test("abaixo de lg (375px): botões de editar/excluir realizado têm toque de pelo menos 44px", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 375, height: 800 });

    const excluir = page.locator("[id^='mobile-btn-excluir-lancamento-']").first();
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

  // Regressão do bug de @container auto-referenciada (achado após a Rodada 2):
  // LancamentoBancoCard.vue, GrupoPagamentoCard.vue e GrupoPagamentoTab.vue
  // tinham a classe "@container" e as classes "@[Npx]:" no MESMO elemento —
  // inválido pela spec de CSS Containment (um elemento nunca é seu próprio
  // container de consulta), então a linha nunca saía do estado empilhado,
  // mesmo em monitor cheio. Os testes anteriores só verificavam ausência de
  // overflow/truncamento — nenhum deles afirmava flexDirection "row" no
  // desktop, que é justamente o que escondeu o bug. Testa em 1440 (mesma
  // resolução já usada nas Rodadas 2-7) e 1920 (o monitor real do Cris).
  for (const viewport of [
    { name: "1440x900", width: 1440, height: 900 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test(`md+ (${viewport.name}): LancamentoBancoCard, GrupoPagamentoCard e GrupoPagamentoTab ficam em linha única`, async ({
      page,
    }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await gotoPagamentos(page, viewport);

      // Banco — aba padrão já ativa.
      const lancamentoRow = page.locator("[id^='lancamento-banco-']").first();
      if (await lancamentoRow.count()) {
        const dir = await lancamentoRow.evaluate((row) => {
          const inner = row.firstElementChild?.firstElementChild as HTMLElement | null;
          return inner ? getComputedStyle(inner).flexDirection : null;
        });
        expect(dir, "LancamentoBancoCard").toBe("row");
      }

      // Despachante — GrupoPagamentoCard (itens de um grupo em aberto).
      await page.locator("#tab-despachante").click();
      await page.waitForTimeout(200);
      const grupoToggle = page.locator("[id^='grupo-pagamento-'] button").first();
      if (await grupoToggle.count()) {
        // Os grupos já nascem expandidos: não clicar no toggle (recolheria os itens e a asserção nunca rodaria).
        const itemBtn = page.locator("[id^='btn-status-item-']").first();
        if (await itemBtn.count()) {
          const dir = await itemBtn.evaluate((btn) => {
            let el: HTMLElement | null = btn as HTMLElement;
            while (el && getComputedStyle(el).containerType !== "inline-size") {
              el = el.parentElement;
            }
            const inner = el?.firstElementChild?.firstElementChild as HTMLElement | null;
            return inner ? getComputedStyle(inner).flexDirection : null;
          });
          expect(dir, "GrupoPagamentoCard").toBe("row");
        }
      }

      // GrupoPagamentoTab — lista de pagamentos realizados.
      const realizadoRow = page.locator("[id^='grupo-realizados-lista-'] > div").first();
      if (await realizadoRow.count()) {
        const dir = await realizadoRow.evaluate((row) => {
          const inner = row.firstElementChild?.firstElementChild as HTMLElement | null;
          return inner ? getComputedStyle(inner).flexDirection : null;
        });
        expect(dir, "GrupoPagamentoTab").toBe("row");
      }
    });
  }

  // Abaixo de lg o bloco do container query fica display:none e o que aparece é o bloco mobile (flex ou grid:
  // conteúdo + coluna de ações), em qualquer largura — o tablet não depende mais da container query.
  for (const width of [375, 768, 1023]) {
    test(`abaixo de lg (${width}px): LancamentoBancoCard, GrupoPagamentoCard e GrupoPagamentoTab usam o bloco mobile`, async ({
      page,
    }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await gotoPagamentos(page, { width, height: 900 });

      // Devolve [display do bloco de lg+, display do bloco mobile] de um card.
      const blocos = (card: HTMLElement): [string, string] => {
        const [lgMais, mobile] = [card.children[0] as HTMLElement, card.children[1] as HTMLElement];
        return [getComputedStyle(lgMais).display, getComputedStyle(mobile).display];
      };

      const lancamentoRow = page.locator("[id^='lancamento-banco-']").first();
      if (await lancamentoRow.count()) {
        expect(await lancamentoRow.evaluate(blocos), "LancamentoBancoCard").toEqual(["none", "flex"]);
      }

      await page.locator("#tab-despachante").click();
      await page.waitForTimeout(200);
      const grupoToggle = page.locator("[id^='grupo-pagamento-'] button").first();
      if (await grupoToggle.count()) {
        // Os grupos já nascem expandidos: não clicar no toggle (recolheria os itens e a asserção nunca rodaria).
        const itemBtn = page.locator("[id^='btn-status-item-']").first();
        if (await itemBtn.count()) {
          const dir = await itemBtn.evaluate((btn) => {
            let el: HTMLElement | null = btn as HTMLElement;
            while (el && getComputedStyle(el).containerType !== "inline-size") {
              el = el.parentElement;
            }
            if (!el) return null;
            const [lgMais, mobile] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
            return [getComputedStyle(lgMais).display, getComputedStyle(mobile).display];
          });
          // O item em aberto do grupo é um grid de 2 linhas (conteúdo alinhado às células de ação), não o flex dos demais.
          expect(dir, "GrupoPagamentoCard").toEqual(["none", "grid"]);
        }
      }

      const realizadoRow = page.locator("[id^='grupo-realizados-lista-'] > div").first();
      if (await realizadoRow.count()) {
        expect(await realizadoRow.evaluate(blocos), "GrupoPagamentoTab").toEqual(["none", "flex"]);
      }

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }
});
