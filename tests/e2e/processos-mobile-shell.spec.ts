import { test, expect, type Page } from "@playwright/test";

// /processos abaixo de lg (mobile e tablet) — refino de
// responsividade: header de uma linha, busca + ícone de filtros (bottom sheet),
// abas 50/50 e botão flutuante "+ Novo processo" acima do BottomNav.
//
// As asserções são explícitas sobre posição/direção/estilo computado (não só
// "sem overflow") — o gap de cobertura da Rodada 2. Roda contra dados já
// existentes na conta de teste (não cria nem apaga nada) e só mexe em filtros,
// que são estado local da página.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — precisa de
//   escrita em processos pra o botão "+ Novo processo" existir)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

// --color-accent-dark (#0b3956) e --color-hairline (#c9d3d1), já em rgb().
const ACCENT_DARK_RGB = "rgb(11, 57, 86)";
const HAIRLINE_RGB = "rgb(201, 211, 209)";

const VIEWPORTS = [
  { name: "375x812 (celular pequeno)", width: 375, height: 812 },
  { name: "390x844 (celular)", width: 390, height: 844 },
  { name: "768x1024 (tablet retrato)", width: 768, height: 1024 },
  { name: "820x1180 (tablet)", width: 820, height: 1180 },
  { name: "1023x768 (último pixel antes de lg)", width: 1023, height: 768 },
];

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

async function gotoProcessos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/processos", { waitUntil: "networkidle" });
  await expect(page.locator("#tab-andamento")).toBeVisible();
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}

const centerY = (b: { y: number; height: number }): number => b.y + b.height / 2;

// Respiro das abas: da base do elemento que precede a barra (o cabeçalho, ou a busca em /processos) até o topo do texto
// e da base do texto até a linha da barra (borda inferior). O texto é o dos nós de texto visíveis do botão (a variante
// display:none não conta); `desvio` = distância do centro do texto ao centro do botão sem o sublinhado.
async function respiroAba(page: Page, id: string): Promise<{ acima: number; abaixo: number; altura: number; linhas: number; desvio: number }> {
  return page.locator(id).evaluate((btn) => {
    const barra = btn.parentElement as HTMLElement;
    const anterior = (barra.previousElementSibling as HTMLElement).getBoundingClientRect().bottom;
    const retangulos: DOMRect[] = [];
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement?.offsetParent) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      retangulos.push(...Array.from(range.getClientRects()));
    }
    const topo = Math.min(...retangulos.map((r) => r.top));
    const base = Math.max(...retangulos.map((r) => r.bottom));
    const linhaBarra = barra.getBoundingClientRect().bottom - parseFloat(getComputedStyle(barra).borderBottomWidth);
    const b = btn.getBoundingClientRect();
    const sublinhado = parseFloat(getComputedStyle(btn).borderBottomWidth);
    return {
      acima: topo - anterior,
      abaixo: linhaBarra - base,
      altura: b.height,
      linhas: new Set(retangulos.map((r) => Math.round(r.top))).size,
      desvio: Math.abs((topo + base) / 2 - (b.top + (b.height - sublinhado) / 2)),
    };
  });
}

// Abaixo de lg, cada aba: toque >= 44px, texto numa linha só, centrado e com o mesmo respiro acima e abaixo (<= 1px).
async function verificarRespiroAba(page: Page, id: string): Promise<void> {
  const r = await respiroAba(page, id);
  expect(r.altura, `${id}: altura da aba`).toBeGreaterThanOrEqual(43.99);
  expect(r.linhas, `${id}: texto numa linha só`).toBe(1);
  expect(Math.abs(r.acima - r.abaixo), `${id}: respiro acima ${r.acima.toFixed(2)}px x abaixo ${r.abaixo.toFixed(2)}px`).toBeLessThanOrEqual(1);
  expect(r.desvio, `${id}: texto centralizado na vertical`).toBeLessThanOrEqual(1);
  console.log(`[medida] ${id}: acima ${r.acima.toFixed(2)}px, abaixo ${r.abaixo.toFixed(2)}px, aba ${r.altura}px`);
}

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

async function countNaAba(page: Page, tabId: "#tab-andamento" | "#tab-entregues"): Promise<number> {
  const texto = (await page.locator(tabId).innerText()).trim();
  const match = /\((\d+)\)/.exec(texto);
  expect(match, `rótulo da aba sem contagem: "${texto}"`).not.toBeNull();
  return Number(match![1]);
}

const bodyOverflow = (page: Page) => page.evaluate(() => document.body.style.overflow);

test.describe("/processos abaixo de lg — shell mobile/tablet", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await gotoProcessos(page, viewport);
      });

      test("header: título em uma linha à esquerda, sino + avatar à direita na mesma linha, subtítulo embaixo", async ({
        page,
      }) => {
        const h1 = page.locator("h1");
        const h1Style = await h1.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { whiteSpace: cs.whiteSpace, fontSize: parseFloat(cs.fontSize) };
        });
        expect(h1Style.whiteSpace).toBe("nowrap");

        const titulo = await box(page, "h1");
        // Uma linha só: altura menor que 2 linhas de texto ("Follow-/Up" quebrado media ~2x).
        expect(titulo.height).toBeLessThan(h1Style.fontSize * 1.6);

        const sino = await box(page, "#btn-notificacoes-fornecedor");
        const avatar = await box(page, "#header-identity");
        // Sino à direita do título, avatar à direita do sino, os três na mesma linha.
        expect(sino.x).toBeGreaterThanOrEqual(titulo.x + titulo.width - 1);
        expect(avatar.x).toBeGreaterThanOrEqual(sino.x + sino.width - 1);
        expect(Math.abs(centerY(sino) - centerY(titulo))).toBeLessThanOrEqual(2);
        expect(Math.abs(centerY(avatar) - centerY(sino))).toBeLessThanOrEqual(2);
        // Avatar encostado na margem direita da página (gutter de 24px + scrollbar fina).
        expect(avatar.x + avatar.width).toBeGreaterThanOrEqual(viewport.width - 40);

        // Avatar circular com as mesmas 44px do sino; nome e cargo escondidos.
        expect(Math.round(avatar.width)).toBe(44);
        expect(Math.round(avatar.height)).toBe(44);
        await expect(page.locator("#header-identity p").first()).toBeHidden();
        await expect(page.locator("#header-identity p").nth(1)).toBeHidden();

        // Subtítulo abaixo do título, na largura toda do header.
        const subtitulo = await box(page, "h1 + p");
        expect(subtitulo.y).toBeGreaterThanOrEqual(titulo.y + titulo.height - 1);
        expect(subtitulo.x).toBeCloseTo(titulo.x, 0);
        expect(subtitulo.width).toBeGreaterThan(viewport.width * 0.6);
        expect(subtitulo.x + subtitulo.width).toBeGreaterThanOrEqual(avatar.x + avatar.width - 1);

        // Linha divisória fina embaixo do header; sem faixa azul nem logo no topo.
        const header = h1.locator("xpath=../..");
        const divisoria = await header.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { width: cs.borderBottomWidth, color: cs.borderBottomColor, display: cs.display };
        });
        expect(divisoria).toEqual({ width: "1px", color: HAIRLINE_RGB, display: "grid" });
        await expect(page.locator('img[alt="Farmaurora"]:visible')).toHaveCount(0);
      });

      test("busca na largura toda com o botão de filtros DENTRO dela (≥44x44, sem caixa ao lado); os 3 selects saem da tela", async ({
        page,
      }) => {
        for (const id of ["#filtro-status", "#filtro-empresa", "#filtro-responsavel"]) {
          await expect(page.locator(id), id).toBeHidden();
          expect(await page.locator(id).boundingBox(), `${id} ocupando espaço`).toBeNull();
        }

        const busca = await box(page, "#processo-search");
        const icone = await box(page, "#btn-filtros-processo");
        const titulo = await box(page, "h1");
        const avatar = await box(page, "#header-identity");

        // Botão CONTIDO na caixa do input (±1px de arredondamento), colado à direita.
        expect(icone.x).toBeGreaterThanOrEqual(busca.x - 1);
        expect(icone.y).toBeGreaterThanOrEqual(busca.y - 1);
        expect(icone.x + icone.width).toBeLessThanOrEqual(busca.x + busca.width + 1);
        expect(icone.y + icone.height).toBeLessThanOrEqual(busca.y + busca.height + 1);
        expect(Math.abs(icone.x + icone.width - (busca.x + busca.width))).toBeLessThanOrEqual(2);
        expect(Math.abs(centerY(icone) - centerY(busca))).toBeLessThanOrEqual(1);
        // Área de toque ≥44x44 sem a barra crescer além dos ~44px de antes.
        expect(icone.width).toBeGreaterThanOrEqual(44);
        expect(icone.height).toBeGreaterThanOrEqual(43.5);
        expect(busca.height).toBeLessThanOrEqual(45);

        // Sem caixa própria: sem borda e sem fundo, só o ícone cinza.
        const estilo = await page.locator("#btn-filtros-processo").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { border: cs.borderTopWidth, background: cs.backgroundColor, position: cs.position };
        });
        expect(estilo).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", position: "absolute" });
        await expect(page.locator("#btn-filtros-processo")).toHaveAttribute("aria-label", "Filtros");

        // Barra na largura toda do conteúdo: do título até o fim do avatar.
        expect(Math.abs(busca.x - titulo.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(busca.x + busca.width - (avatar.x + avatar.width))).toBeLessThanOrEqual(1);
        expect(busca.width).toBeGreaterThan(viewport.width * 0.8);

        // Sem filtro ativo, sem bolinha.
        await expect(page.locator("#badge-filtros-ativos")).toHaveCount(0);
      });

      test("placeholder e texto digitado nunca ficam por baixo do botão de filtros (nem do ✕ de limpar)", async ({
        page,
      }) => {
        const input = page.locator("#processo-search");
        const icone = await box(page, "#btn-filtros-processo");

        // Placeholder: largura real do texto, medida na mesma fonte do input.
        const placeholderFim = await input.evaluate((el: HTMLInputElement) => {
          const cs = getComputedStyle(el);
          const ctx = document.createElement("canvas").getContext("2d")!;
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const b = el.getBoundingClientRect();
          return (
            b.x + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) + ctx.measureText(el.placeholder).width
          );
        });
        expect(placeholderFim).toBeLessThanOrEqual(icone.x);

        // Texto longo: a área de texto do input (borda + padding-right) termina antes do ✕ e do ícone.
        await input.fill("Paciente com um nome propositalmente muito comprido para estourar a barra de busca");
        const clear = await box(page, "#btn-clear-processo-search");
        const areaTextoFim = await input.evaluate((el: HTMLInputElement) => {
          const cs = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return b.x + b.width - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
        });
        expect(areaTextoFim).toBeLessThanOrEqual(clear.x + 0.5);
        expect(clear.x + clear.width).toBeLessThanOrEqual(icone.x + 0.5); // ✕ não encosta no ícone
        expect(areaTextoFim).toBeLessThanOrEqual(icone.x);
        expect(await hasHorizontalOverflow(page)).toBe(false);

        // Clicar no ✕ limpa; clicar no ícone abre o painel (não é engolido pelo input).
        await page.locator("#btn-clear-processo-search").click();
        await expect(input).toHaveValue("");
        await page.locator("#btn-filtros-processo").click();
        await expect(page.locator("#processo-filtros-sheet")).toBeVisible();
      });

      test("com filtro ativo, a bolinha de contagem fica visível no canto superior do ícone", async ({ page }) => {
        await page.locator("#btn-filtros-processo").click();
        await selectOption(page, "sheet-filtro-empresa", "MAINZFARMA");
        await page.locator("#btn-filtros-aplicar").click();

        const badge = page.locator("#badge-filtros-ativos");
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText("1");

        const b = await box(page, "#badge-filtros-ativos");
        const icone = await box(page, "#btn-filtros-processo");
        const busca = await box(page, "#processo-search");
        // Dentro do botão, no quadrante superior direito, e portanto dentro da barra.
        expect(b.x).toBeGreaterThanOrEqual(icone.x - 1);
        expect(b.y).toBeGreaterThanOrEqual(icone.y - 1);
        expect(b.x + b.width).toBeLessThanOrEqual(icone.x + icone.width + 1);
        expect(centerY(b)).toBeLessThan(centerY(icone));
        expect(b.x + b.width / 2).toBeGreaterThan(icone.x + icone.width / 2);
        expect(b.y).toBeGreaterThanOrEqual(busca.y - 1);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("ícone abre o painel (bottom sheet) com os 3 selects empilhados em largura total, Limpar e Aplicar", async ({
        page,
      }) => {
        await expect(page.locator("#processo-filtros-sheet")).toHaveCount(0);
        await page.locator("#btn-filtros-processo").click();

        const sheet = await box(page, "#processo-filtros-sheet");
        // Colado no rodapé e travando o scroll da página por trás.
        expect(Math.round(sheet.y + sheet.height)).toBe(viewport.height);
        expect(await bodyOverflow(page)).toBe("hidden");

        const status = await box(page, "#sheet-filtro-status");
        const empresa = await box(page, "#sheet-filtro-empresa");
        const responsavel = await box(page, "#sheet-filtro-responsavel");
        // Empilhados na vertical, mesma largura, todos dentro do painel.
        expect(empresa.y).toBeGreaterThanOrEqual(status.y + status.height - 1);
        expect(responsavel.y).toBeGreaterThanOrEqual(empresa.y + empresa.height - 1);
        expect(Math.abs(status.width - empresa.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(empresa.width - responsavel.width)).toBeLessThanOrEqual(1);
        expect(status.x).toBeGreaterThanOrEqual(sheet.x);
        expect(status.x + status.width).toBeLessThanOrEqual(sheet.x + sheet.width);
        // "Largura total": o select só perde o padding horizontal do painel (16px de cada lado).
        expect(status.width).toBeGreaterThanOrEqual(sheet.width - 34);

        const limpar = page.locator("#btn-filtros-limpar");
        const aplicar = await box(page, "#btn-filtros-aplicar");
        await expect(limpar).toBeVisible();
        expect(aplicar.y).toBeGreaterThanOrEqual(responsavel.y + responsavel.height - 1);
        expect(aplicar.width).toBeGreaterThanOrEqual(sheet.width - 34);
        expect(await page.locator("#btn-filtros-aplicar").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
          ACCENT_DARK_RGB,
        );

        // Painel por cima do BottomNav (que é z-40).
        const topoNoRodape = await page.evaluate(
          (vh) => document.elementFromPoint(10, vh - 4)?.closest("#processo-filtros-sheet-overlay") !== null,
          viewport.height,
        );
        expect(topoNoRodape).toBe(true);
      });

      test("painel fecha com Escape, toque fora e Aplicar — e devolve o scroll da página", async ({ page }) => {
        const abrir = async () => {
          await page.locator("#btn-filtros-processo").click();
          await expect(page.locator("#processo-filtros-sheet")).toBeVisible();
        };
        const fechado = async () => {
          await expect(page.locator("#processo-filtros-sheet")).toHaveCount(0);
          expect(await bodyOverflow(page)).toBe("");
        };

        await abrir();
        await page.keyboard.press("Escape");
        await fechado();

        await abrir();
        await page.mouse.click(8, 8); // overlay, bem acima do painel
        await fechado();

        await abrir();
        await page.locator("#btn-filtros-aplicar").click();
        await fechado();
      });

      test("filtros aplicam na hora, a bolinha conta os ativos e Limpar volta tudo a 'todos'", async ({ page }) => {
        const totalAntes = await countNaAba(page, "#tab-andamento");

        await page.locator("#btn-filtros-processo").click();
        await selectOption(page, "sheet-filtro-empresa", "MAINZFARMA");

        // Aplica na hora (painel ainda aberto): a contagem da aba já reflete o filtro.
        const comEmpresa = await countNaAba(page, "#tab-andamento");
        expect(comEmpresa).toBeLessThanOrEqual(totalAntes);
        await expect(page.locator("#badge-filtros-ativos")).toHaveText("1");

        await selectOption(page, "sheet-filtro-responsavel", "Rebeca");
        await expect(page.locator("#badge-filtros-ativos")).toHaveText("2");
        expect(await countNaAba(page, "#tab-andamento")).toBeLessThanOrEqual(comEmpresa);

        // "Aplicar" só fecha: filtros e bolinha continuam.
        await page.locator("#btn-filtros-aplicar").click();
        await expect(page.locator("#processo-filtros-sheet")).toHaveCount(0);
        await expect(page.locator("#badge-filtros-ativos")).toHaveText("2");

        // Reabrir mostra os valores escolhidos (mesmo estado, sem cópia).
        await page.locator("#btn-filtros-processo").click();
        await expect(page.locator("#sheet-filtro-empresa")).toContainText("MAINZFARMA");
        await expect(page.locator("#sheet-filtro-responsavel")).toContainText("Rebeca");

        // Status entra na conta também (aba "Em andamento").
        await selectOption(page, "sheet-filtro-status", "Em trânsito");
        await expect(page.locator("#badge-filtros-ativos")).toHaveText("3");

        // "Limpar" restaura os 3 pra "todos" sem fechar o painel; a contagem volta ao total.
        await page.locator("#btn-filtros-limpar").click();
        await expect(page.locator("#processo-filtros-sheet")).toBeVisible();
        await expect(page.locator("#sheet-filtro-status")).toContainText("Todos os status");
        await expect(page.locator("#sheet-filtro-empresa")).toContainText("Todas as empresas");
        await expect(page.locator("#sheet-filtro-responsavel")).toContainText("Todos os responsáveis");
        await expect(page.locator("#badge-filtros-ativos")).toHaveCount(0);
        expect(await countNaAba(page, "#tab-andamento")).toBe(totalAntes);
      });

      test("na aba Entregues o painel não mostra o select de status (mesma regra da toolbar de antes)", async ({
        page,
      }) => {
        await page.locator("#tab-entregues").click();
        await page.locator("#btn-filtros-processo").click();
        await expect(page.locator("#sheet-filtro-empresa")).toBeVisible();
        await expect(page.locator("#sheet-filtro-status")).toHaveCount(0);
      });

      test("lista suspensa de um select abre pra cima e fica dentro da viewport; Esc fecha só a lista", async ({
        page,
      }) => {
        await page.locator("#btn-filtros-processo").click();
        const trigger = await box(page, "#sheet-filtro-responsavel");
        await page.locator("#sheet-filtro-responsavel").click();

        const lista = await box(page, "#sheet-filtro-responsavel-listbox");
        expect(lista.y + lista.height).toBeLessThanOrEqual(trigger.y + 1); // acima do botão
        expect(lista.y).toBeGreaterThanOrEqual(0);

        await page.keyboard.press("Escape");
        await expect(page.locator("#sheet-filtro-responsavel-listbox")).toHaveCount(0);
        await expect(page.locator("#processo-filtros-sheet")).toBeVisible(); // painel segue aberto
      });

      test("abas ocupam 50% cada, texto centralizado, aba ativa com linha grossa azul-marinho", async ({ page }) => {
        const andamento = await box(page, "#tab-andamento");
        const entregues = await box(page, "#tab-entregues");
        const container = await box(page, "#tab-andamento >> xpath=..");
        const titulo = await box(page, "h1");

        expect(Math.abs(andamento.width - entregues.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(andamento.width - container.width / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(andamento.x - container.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(entregues.x - (andamento.x + andamento.width))).toBeLessThanOrEqual(1);
        // A linha das abas acompanha a largura toda do conteúdo.
        expect(Math.abs(container.x - titulo.x)).toBeLessThanOrEqual(1);

        // Toque >= 44px, texto centrado na vertical e o mesmo respiro acima (a partir da busca) e abaixo (até a linha).
        for (const id of ["#tab-andamento", "#tab-entregues"]) await verificarRespiroAba(page, id);

        for (const id of ["#tab-andamento", "#tab-entregues"]) {
          const centrado = await page.locator(id).evaluate((el) => {
            const cs = getComputedStyle(el);
            const range = document.createRange();
            range.selectNodeContents(el);
            const texto = range.getBoundingClientRect();
            const b = el.getBoundingClientRect();
            return { textAlign: cs.textAlign, desvio: Math.abs(texto.x + texto.width / 2 - (b.x + b.width / 2)) };
          });
          expect(centrado.textAlign, id).toBe("center");
          expect(centrado.desvio, id).toBeLessThanOrEqual(2);
        }

        const sublinhado = (id: string) =>
          page.locator(id).evaluate((el) => {
            const cs = getComputedStyle(el);
            return { width: cs.borderBottomWidth, color: cs.borderBottomColor };
          });
        expect(await sublinhado("#tab-andamento")).toEqual({ width: "3px", color: ACCENT_DARK_RGB });
        expect((await sublinhado("#tab-entregues")).color).toBe("rgba(0, 0, 0, 0)");

        // `transition-colors` (150ms): lê o estilo final com polling, não no meio da transição.
        await page.locator("#tab-entregues").click();
        await expect.poll(() => sublinhado("#tab-entregues")).toEqual({ width: "3px", color: ACCENT_DARK_RGB });
        await expect.poll(async () => (await sublinhado("#tab-andamento")).color).toBe("rgba(0, 0, 0, 0)");

        // Linha cinza fina na largura toda embaixo das abas.
        const linha = await page.locator("#tab-andamento").evaluate((el) => {
          const cs = getComputedStyle(el.parentElement!);
          return { width: cs.borderBottomWidth, color: cs.borderBottomColor };
        });
        expect(linha).toEqual({ width: "1px", color: HAIRLINE_RGB });
      });

      test("botão '+' (Novo processo) flutua no canto inferior direito, 56x56, acima do BottomNav, sem texto", async ({
        page,
      }) => {
        const novo = page.getByRole("button", { name: "Novo processo" });
        if ((await novo.count()) === 0) {
          test.skip(true, "conta de teste sem permissão de escrita em processos");
        }
        await expect(novo).toBeVisible();

        const estilo = await novo.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            position: cs.position,
            background: cs.backgroundColor,
            color: cs.color,
            radius: cs.borderTopLeftRadius,
            shadow: cs.boxShadow,
          };
        });
        expect(estilo.position).toBe("fixed");
        expect(estilo.background).toBe(ACCENT_DARK_RGB);
        expect(estilo.color).toBe("rgb(255, 255, 255)");
        expect(estilo.radius).toBe("16px");
        expect(estilo.shadow).not.toBe("none");

        const fab = await box(page, "#fab-novo-processo");
        const nav = await box(page, "#bottom-nav");
        expect(Math.round(fab.width)).toBe(56);
        expect(Math.round(fab.height)).toBe(56);
        // Só o símbolo "+": sem texto visível; o nome acessível vem do aria-label.
        await expect(novo).toHaveText("");
        await expect(novo).toHaveAttribute("aria-label", "Novo processo");
        // Canto inferior direito: 16px da margem direita, acima da barra com folga.
        expect(Math.abs(viewport.width - (fab.x + fab.width) - 16)).toBeLessThanOrEqual(1);
        expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y - 8);
        expect(nav.y - (fab.y + fab.height)).toBeLessThanOrEqual(24);
        expect(fab.x).toBeGreaterThan(viewport.width / 2);
        // Não é filho do BottomNav e não fica largura-total.
        await expect(page.locator("#bottom-nav #fab-novo-processo")).toHaveCount(0);
        expect(fab.width).toBeLessThan(viewport.width / 2);

        // Abre o modal de criação (continua funcionando como antes) — fecha sem salvar.
        await novo.click();
        await expect(page.locator("#processo-form-modal-overlay")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#processo-form-modal-overlay")).toHaveCount(0);
      });

      test("fim da lista nunca fica coberto pelo botão flutuante (padding-bottom da página)", async ({ page }) => {
        const novo = page.getByRole("button", { name: "Novo processo" });
        if ((await novo.count()) === 0) {
          test.skip(true, "conta de teste sem permissão de escrita em processos");
        }

        for (const tabId of ["#tab-andamento", "#tab-entregues"]) {
          await page.locator(tabId).click();
          const fim = await page.evaluate(() => {
            const main = document.querySelector<HTMLElement>("#app-main-content")!;
            main.scrollTop = main.scrollHeight;
            const ultimo = document.querySelector("#processos-page")!.lastElementChild!;
            return ultimo.getBoundingClientRect().bottom;
          });
          const fab = await box(page, "#fab-novo-processo");
          expect(fim, tabId).toBeLessThanOrEqual(fab.y);
        }
      });

      test("sem overflow horizontal em nenhuma aba, nem com o painel aberto", async ({ page }) => {
        for (const tabId of ["#tab-andamento", "#tab-entregues"]) {
          await page.locator(tabId).click();
          await page.waitForTimeout(200);
          expect(await hasHorizontalOverflow(page), `overflow em ${tabId}`).toBe(false);
        }
        await page.locator("#btn-filtros-processo").click();
        expect(await hasHorizontalOverflow(page), "overflow com painel aberto").toBe(false);
      });
    });
  }

  test("girar o tablet pra paisagem (>= lg) com o painel aberto fecha o painel e solta o scroll", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoProcessos(page, { width: 820, height: 1180 });

    await page.locator("#btn-filtros-processo").click();
    await expect(page.locator("#processo-filtros-sheet")).toBeVisible();

    await page.setViewportSize({ width: 1180, height: 820 });
    await expect(page.locator("#processo-filtros-sheet")).toHaveCount(0);
    expect(await bodyOverflow(page)).toBe("");
    // E os filtros inline do desktop assumem.
    await expect(page.locator("#filtro-empresa")).toBeVisible();
    await expect(page.locator("#btn-filtros-processo")).toBeHidden();
  });
});
