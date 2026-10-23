import { test, expect, type CDPSession, type Locator, type Page } from "@playwright/test";

// Trava de scroll dos painéis (useLockBodyScroll): abaixo de lg quem rola a página é o
// #app-main-content, não o body — então, com um sheet/modal aberto, roda, toque e teclado NÃO
// podem alterar o scrollTop dele; ao fechar, a rolagem volta e o scrollTop é preservado. Em lg+ a
// trava continua só a do body (a barra de rolagem de 9px do <main> não pode sumir nem deslocar o
// conteúdo ao abrir um modal).
//
// Cada gesto tem CONTROLE (mesmo gesto, painel fechado, precisa rolar) — sem isso "não rolou"
// não prova nada. Os dados vêm de GETs interceptados no browser (página longa o bastante pra
// rolar em qualquer viewport); nada é criado, editado ou apagado (excluir só abre o ConfirmDialog
// e cancela; escritas em /api/pagamentos e /api/processos são abortadas).
//
// NavMoreSheet só existe quando algum cargo tem mais de 5 itens de navegação (nenhum hoje):
// sem o botão "Mais" na tela, o caso é pulado.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const MOBILE_VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768", width: 1023, height: 768 },
];

// ── Dados fictícios (página longa) ───────────────────────────────────────────
const NOMES = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado", "Fábio Nunes", "Gisele Melo", "Hugo Alves"];
const opcoes = (taxa: number | null) => [
  { banco: "XP", taxaCorretagem: 0, taxa },
  { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null },
  { banco: "INTEX", taxaCorretagem: 0, taxa: null },
];
const lote = (id: string, extra: Record<string, unknown>) => ({
  id, data: "2026-10-20", empresa: "FARMAURORA", moeda: "USD", numeroLote: 1, opcoes: opcoes(null),
  bancoEscolhido: null, taxaEscolhida: null, realizado: false, pagoEm: null, createdAt: "2026-10-20T10:00:00Z", ...extra,
});
const lanc = (i: number, loteId: string, valorReais: number | null) => ({
  id: `lanc-${i}`, loteId, data: "2026-10-20", empresa: "FARMAURORA", fornecedor: "Poros - Turquia", invoice: `INV-${i}`,
  cliente: `${NOMES[i % NOMES.length]} ${i}`, valorMoeda: 1000 + i, moeda: "USD", valorReais, taxa: null, createdAt: "2026-10-20T10:00:00Z",
});
const BANCO = {
  lotes: [
    lote("lote-a", { bancoEscolhido: "XP", taxaEscolhida: 5.4, opcoes: opcoes(5.4) }),
    lote("lote-r1", { realizado: true, pagoEm: "2026-10-15T14:00:00Z", data: "2026-10-15", bancoEscolhido: "XP", taxaEscolhida: 5.4 }),
  ],
  lancamentos: [
    ...[0, 1, 2].map((i) => lanc(i, "lote-a", 5400 + i)),
    ...Array.from({ length: 24 }, (_, i) => lanc(10 + i, "lote-r1", 5400 + i)),
  ],
};
const PROCESSOS = Array.from({ length: 36 }, (_, n) => ({
  id: `proc-${n}`, paciente: `${NOMES[n % NOMES.length]} ${n}`, pasta: `2026 - ${200 + n}`, empresa: n % 2 ? "MAINZFARMA" : "FARMAURORA",
  consultor: ["Alessandra", "Bolívar", "Dani", "Paulinho"][n % 4], responsavelOperacional: "Bruno", despachante: "Bruno Lopes",
  fornecedor: "Poros - Turquia", modalEnvio: "Air Cargo", medicamentos: [{ nome: "Medicamento X", dosagem: "10mg", quantidade: "2" }],
  status: ["elaboracao_fornecedores", "aguardando_inicio", "em_transito", "desembaraco", "liberado"][n % 5],
  datas: { dataCompraPO: "2026-09-01", previsaoEntrega: "2026-11-10" }, pendencias: [], statusPagamento: "pendente",
  alertaFornecedorResolvido: true, atualizacoes: [{ data: "10/10", texto: "Em andamento." }],
  createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-10-10T10:00:00Z",
}));

async function mockDados(page: Page): Promise<void> {
  await page.route(/\/api\/(pagamentos\/(banco|despachante|transportadora|despachante-pix|transportadora-pix)|processos)(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.abort();
      return;
    }
    const caminho = new URL(route.request().url()).pathname;
    const corpo =
      caminho === "/api/pagamentos/banco" ? BANCO
      : caminho === "/api/processos" ? PROCESSOS
      : caminho.endsWith("-pix") ? {}
      : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(corpo) });
  });
}

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

async function irPara(page: Page, viewport: { width: number; height: number }, rota: "/pagamentos" | "/processos"): Promise<void> {
  await page.setViewportSize(viewport);
  await mockDados(page);
  await login(page);
  await page.goto(rota, { waitUntil: "networkidle" });
  if (rota === "/pagamentos") {
    await expect(page.locator("#lote-banco-lote-a")).toBeVisible();
  } else {
    await expect(page.locator("#processo-group-list")).toBeVisible();
    // Expande os grupos: página longa o bastante pra rolar em qualquer viewport.
    for (const grupo of await page.locator("[id^='processo-group-']:not(#processo-group-list)").all()) {
      await grupo.locator("button").first().click();
    }
  }
}

// ── Medidas e gestos ─────────────────────────────────────────────────────────
const scrollTop = (page: Page): Promise<number> =>
  page.evaluate(() => Math.round(document.querySelector("#app-main-content")!.scrollTop));

async function irParaOMeio(page: Page): Promise<number> {
  await page.evaluate(() => {
    const m = document.querySelector("#app-main-content")!;
    m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) / 2);
  });
  await page.waitForTimeout(120);
  return scrollTop(page);
}

// Swipe real por eventos de toque (o Chromium converte em gesto de rolagem). dy > 0: o dedo sobe.
async function deslizar(cdp: CDPSession, x: number, y: number, dy: number): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - (dy * i) / 12 }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

interface Pontos {
  fundo: { x: number; y: number; dy: number };
  painel: { x: number; y: number; dy: number };
}

type Gesto = { nome: string; fazer: () => Promise<void> };

// O teclado rola o contêiner do elemento focado: o foco "na página" é um botão DENTRO do <main> (os gatilhos
// FAB e "Mais" são `fixed` e não rolam o <main> nem com o painel fechado, o que invalidaria o controle).
function gestos(page: Page, cdp: CDPSession, p: Pontos, focoNoPainel: Locator | null): Gesto[] {
  const focoNaPagina = page.locator("#app-main-content button").first();
  const lista: Gesto[] = [
    { nome: "roda no fundo", fazer: async () => { await page.mouse.move(p.fundo.x, p.fundo.y); await page.mouse.wheel(0, 250); } },
    { nome: "roda no painel", fazer: async () => { await page.mouse.move(p.painel.x, p.painel.y); await page.mouse.wheel(0, 250); } },
    { nome: "toque no fundo", fazer: () => deslizar(cdp, p.fundo.x, p.fundo.y, p.fundo.dy) },
    { nome: "toque no painel", fazer: () => deslizar(cdp, p.painel.x, p.painel.y, p.painel.dy) },
    { nome: "teclado (foco na página)", fazer: async () => { await focarSemRolar(focoNaPagina); await page.keyboard.press("PageDown"); } },
  ];
  if (focoNoPainel) {
    lista.push({ nome: "teclado (foco no painel)", fazer: async () => { await focarSemRolar(focoNoPainel); await page.keyboard.press("PageDown"); } });
  }
  return lista;
}

// `focus()` num elemento fora da tela rola o contêiner sozinho (até com overflow:hidden); `preventScroll`
// isola o que o TECLADO faz (PageDown), que é o que se mede.
const focarSemRolar = (loc: Locator): Promise<void> => loc.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));

// "A rolagem voltou" depois de destravar: por TOQUE e por TECLADO. A roda não entra aqui de propósito: no
// Chromium headless, depois de swipes sintéticos (CDP) contra um <main> com overflow:hidden, a roda fica sem
// efeito mesmo com o overflow restaurado — reproduzido sem nenhum componente do app, só alternando
// `overflow-y` no <main> — e toque e teclado seguem normais. A roda segue sendo exigida (travada) com o painel aberto.
async function rolagemVoltou(page: Page, cdp: CDPSession, viewport: { width: number; height: number }, s0: number, rotulo: string): Promise<void> {
  await deslizar(cdp, viewport.width / 2, Math.round(viewport.height * 0.6), 150);
  await page.waitForTimeout(600);
  const depoisDoToque = await scrollTop(page);
  expect(depoisDoToque, `${rotulo}: o toque não rola de novo`).not.toBe(s0);
  await focarSemRolar(page.locator("#app-main-content button").first());
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(500);
  expect(await scrollTop(page), `${rotulo}: o teclado não rola de novo`).not.toBe(depoisDoToque);
}

// ── Casos: o que abre, onde tocar, como fechar ───────────────────────────────
interface Caso {
  nome: string;
  rota: "/pagamentos" | "/processos";
  gatilho: string;
  painel: string;
  foco: string;
  fechar: (page: Page) => Promise<void>;
  pontos: (w: number, h: number) => Pontos;
}

const pontosSheet = (w: number, h: number): Pontos => ({
  fundo: { x: w / 2, y: Math.round(h * 0.28), dy: 150 },
  painel: { x: w / 2, y: Math.round(h * 0.8), dy: 150 },
});

const CASOS: Caso[] = [
  {
    nome: "PagamentosFiltrosSheet", rota: "/pagamentos", gatilho: "#btn-filtros-banco-realizado", painel: "#banco-filtros-sheet",
    foco: "#banco-filtros-sheet-aplicar", fechar: (p) => p.locator("#banco-filtros-sheet-aplicar").click(), pontos: pontosSheet,
  },
  {
    nome: "ProcessoFiltrosSheet", rota: "/processos", gatilho: "#btn-filtros-processo", painel: "#processo-filtros-sheet",
    foco: "#btn-filtros-aplicar", fechar: (p) => p.locator("#btn-filtros-aplicar").click(), pontos: pontosSheet,
  },
  {
    nome: "NavMoreSheet", rota: "/pagamentos", gatilho: "#btn-bottom-nav-more", painel: "#nav-more-sheet",
    foco: "#nav-more-sheet a", fechar: async (p) => { await p.keyboard.press("Escape"); }, pontos: pontosSheet,
  },
  {
    nome: "BaseModal (novo pagamento)", rota: "/pagamentos", gatilho: "#fab-pagamentos", painel: "#novo-lancamento-banco-overlay > div",
    foco: "#btn-cancel-novo-lancamento", fechar: (p) => p.locator("#btn-cancel-novo-lancamento").click(),
    pontos: (w, h) => ({ fundo: { x: w / 2, y: 8, dy: -150 }, painel: { x: w / 2, y: Math.round(h * 0.5), dy: 150 } }),
  },
];

test.use({ hasTouch: true });

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`trava de scroll abaixo de lg — ${viewport.name}`, () => {
    test.describe.configure({ retries: 2 });

    for (const caso of CASOS) {
      test(`${caso.nome}: aberto, roda/toque/teclado não rolam o <main>; fechado, a rolagem volta e o scrollTop é preservado`, async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await irPara(page, viewport, caso.rota);
        const gatilho = page.locator(caso.gatilho);
        if (caso.nome === "NavMoreSheet" && (await gatilho.count()) === 0) {
          test.skip(true, 'botão "Mais" não renderizado (nenhum cargo passa de 5 itens de navegação)');
        }
        const cdp = await page.context().newCDPSession(page);
        const pontos = caso.pontos(viewport.width, viewport.height);
        const foco = page.locator(caso.foco).first();

        // CONTROLE: com o painel fechado cada gesto precisa rolar, senão a medição não vale.
        for (const g of gestos(page, cdp, pontos, null)) {
          const antes = await irParaOMeio(page);
          await g.fazer();
          await page.waitForTimeout(450);
          expect(await scrollTop(page), `controle inválido: "${g.nome}" não rolou com o painel fechado`).not.toBe(antes);
        }

        await gatilho.click();
        await expect(page.locator(caso.painel).first()).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
        expect(
          await page.locator("#app-main-content").evaluate((m) => m.style.overflowY),
          "o <main> deve ficar travado abaixo de lg",
        ).toBe("hidden");

        const s0 = await irParaOMeio(page);
        for (const g of gestos(page, cdp, pontos, foco)) {
          await g.fazer();
          await page.waitForTimeout(450);
          expect(await scrollTop(page), `"${g.nome}" rolou o <main> com o painel aberto`).toBe(s0);
        }

        await caso.fechar(page);
        await expect(page.locator(caso.painel).first()).toHaveCount(0);
        expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
        expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY), "<main> deve ser liberado").toBe("");
        expect(await scrollTop(page), "scrollTop preservado depois de fechar").toBe(s0);

        // A rolagem volta a funcionar.
        await rolagemVoltou(page, cdp, viewport, s0, caso.nome);
      });
    }

    test("sheet + ConfirmDialog empilhados: fechar qualquer um primeiro não destrava o outro; fechando os dois, solta", async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await irPara(page, viewport, "/pagamentos");
      const cdp = await page.context().newCDPSession(page);
      const pontos = pontosSheet(viewport.width, viewport.height);
      const gatilho = page.locator("#btn-filtros-banco-realizado");
      const sheet = page.locator("#banco-filtros-sheet");
      const dialogo = page.locator("#confirm-dialog-overlay");

      const travado = async (rotulo: string, s0: number): Promise<void> => {
        expect(await page.evaluate(() => document.body.style.overflow), `${rotulo}: body`).toBe("hidden");
        expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY), `${rotulo}: <main>`).toBe("hidden");
        for (const g of gestos(page, cdp, pontos, null).slice(0, 4)) {
          await g.fazer();
          await page.waitForTimeout(400);
          expect(await scrollTop(page), `${rotulo}: "${g.nome}" rolou`).toBe(s0);
        }
      };
      const solto = async (rotulo: string, s0: number): Promise<void> => {
        expect(await page.evaluate(() => document.body.style.overflow), `${rotulo}: body`).toBe("");
        expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY), `${rotulo}: <main>`).toBe("");
        expect(await scrollTop(page), `${rotulo}: scrollTop preservado`).toBe(s0);
        await rolagemVoltou(page, cdp, viewport, s0, rotulo);
      };
      // O sheet cobre os botões da página: abre o diálogo "por baixo" com um clique programático.
      // Abaixo de lg o card renderiza dois blocos (desktop `hidden lg:block` e mobile `lg:hidden`, com ids
      // `mobile-`): `[id^='btn-excluir-lancamento-']` pegaria o botão oculto do desktop, então o seletor é o do
      // bloco mobile e se confirma que o botão é VISÍVEL antes de agir (o clique programático ignora visibilidade).
      const abrirDialogoPorBaixo = async (): Promise<void> => {
        const excluir = page.locator("[id^='mobile-btn-excluir-lancamento-']").first();
        expect(await excluir.isVisible(), "o botão de excluir do bloco mobile deve estar visível").toBe(true);
        await excluir.dispatchEvent("click");
        await expect(dialogo).toBeVisible();
      };

      // Ordem 1: fecha o sheet (de cima) primeiro; o diálogo (de baixo) continua travando.
      await gatilho.scrollIntoViewIfNeeded();
      await gatilho.click();
      await expect(sheet).toBeVisible();
      await abrirDialogoPorBaixo();
      let s0 = await irParaOMeio(page);
      await travado("sheet+diálogo", s0);
      await page.locator("#banco-filtros-sheet-aplicar").click();
      await expect(sheet).toHaveCount(0);
      await travado("só o diálogo (sheet fechado primeiro)", s0);
      await page.locator("#btn-confirm-dialog-cancel").click();
      await expect(dialogo).toHaveCount(0);
      await solto("tudo fechado (ordem 1)", s0);

      // Ordem 2: fecha o diálogo (de baixo) primeiro; o sheet continua travando.
      await gatilho.scrollIntoViewIfNeeded();
      await gatilho.click();
      await expect(sheet).toBeVisible();
      await abrirDialogoPorBaixo();
      s0 = await irParaOMeio(page);
      await page.locator("#btn-confirm-dialog-cancel").dispatchEvent("click");
      await expect(dialogo).toHaveCount(0);
      await travado("só o sheet (diálogo fechado primeiro)", s0);
      await page.locator("#banco-filtros-sheet-aplicar").click();
      await expect(sheet).toHaveCount(0);
      await solto("tudo fechado (ordem 2)", s0);
    });

    test("viewport alarga com o painel aberto: o <main> é liberado ao fechar (não fica overflow:hidden preso)", async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await irPara(page, viewport, "/pagamentos");

      // BaseModal aberto abaixo de lg e a janela passa de lg: o modal continua, o <main> segue travado
      // (foi o que se aplicou) e é restaurado ao fechar.
      await page.locator("#fab-pagamentos").click();
      await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
      expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY)).toBe("hidden");
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
      await page.locator("#btn-cancel-novo-lancamento").click();
      await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY)).toBe("");

      // Sheet aberto abaixo de lg e a janela passa de lg: o sheet se fecha sozinho e solta tudo.
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(300);
      await page.locator("#btn-filtros-banco-realizado").scrollIntoViewIfNeeded();
      await page.locator("#btn-filtros-banco-realizado").click();
      await expect(page.locator("#banco-filtros-sheet")).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.locator("#banco-filtros-sheet")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      expect(await page.locator("#app-main-content").evaluate((m) => m.style.overflowY)).toBe("");
    });
  });
}

for (const viewport of [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
]) {
  test.describe(`trava de scroll em lg+ — ${viewport.name}: só o body, <main> e barra de rolagem intocados`, () => {
    test.describe.configure({ retries: 2 });

    for (const [rota, abrir, modal, fechar] of [
      ["/pagamentos", "#btn-novo-pagamento-banco", "#novo-lancamento-banco-overlay", "#btn-cancel-novo-lancamento"],
      ["/processos", "#btn-novo-processo", "[id$='-overlay']", null],
    ] as const) {
      test(`${rota}: abrir e fechar o modal não mexe no <main> (overflow, largura útil, scrollTop)`, async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await irPara(page, viewport, rota);
        const medir = () =>
          page.locator("#app-main-content").evaluate((m) => ({
            clientW: m.clientWidth,
            offsetW: m.offsetWidth,
            overflowY: getComputedStyle(m).overflowY,
            inline: m.style.overflowY,
            scrollTop: Math.round(m.scrollTop),
          }));
        const s0 = await irParaOMeio(page);
        const antes = await medir();
        expect(antes.inline).toBe("");

        // `dispatchEvent`: o click() do Playwright rola o botão pra vista antes de clicar e mudaria o scrollTop
        // por conta própria, mascarando o que o composable faz.
        await page.locator(abrir).dispatchEvent("click");
        await expect(page.locator(modal).first()).toBeVisible();
        const aberto = await medir();
        expect(await page.evaluate(() => document.body.style.overflow), "body travado como sempre").toBe("hidden");
        expect(aberto.inline, "o <main> NÃO pode ser travado em lg+").toBe("");
        expect(aberto.overflowY).toBe(antes.overflowY);
        expect(aberto.clientW, "a largura útil do <main> não pode mudar (barra de rolagem)").toBe(antes.clientW);
        expect(aberto.offsetW).toBe(antes.offsetW);
        expect(aberto.scrollTop).toBe(s0);

        if (fechar) await page.locator(fechar).click();
        else await page.keyboard.press("Escape");
        await expect(page.locator(modal)).toHaveCount(0);
        const depois = await medir();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
        expect(depois).toEqual({ ...antes, scrollTop: s0 });
      });
    }
  });
}
