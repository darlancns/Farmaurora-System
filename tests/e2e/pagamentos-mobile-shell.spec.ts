import { test, expect, type ElementHandle, type Locator, type Page } from "@playwright/test";

// /pagamentos abaixo de lg (mobile e tablet) — refino de responsividade: abas
// centralizadas (rótulo "Câmbio"), "+" flutuante único (FloatingAddButton) no lugar de
// "+ Novo pagamento"/"+ Adicionar pagamento", cabeçalhos de lote sem texto espremido, cards
// pagos com editar/excluir na linha do nome e filtros de "Pagamentos realizados" num
// bottom sheet. Em lg+ nada disso aparece: botões com texto, filtros em linha.
//
// As asserções são explícitas sobre posição (boundingBox) e estilo computado — não só
// "sem overflow". Os dados (nome longo, PIX longo, valores grandes) vêm de GETs de
// /api/pagamentos/* interceptados no browser: o teste não depende dos dados da conta,
// não cria nem apaga nada, e qualquer escrita em /api/pagamentos/* é abortada.
//
// "Somente leitura" não é alcançável pela UI: todo cargo que lê Pagamentos (socio, operacional,
// administrador) também escreve, então o ramo `!canWrite("pagamentos")` não existe em produção — a
// ausência do "+" nesse ramo é garantida pelo `v-if="showFab"` (inclui `!readonly`). O ramo (sem
// coluna de ações nem divisória nos cards) é coberto por um bloco que só roda com
// PAGAMENTOS_FORCE_READONLY=1, numa CÓPIA do app com `readonly` forçado (harness local, nunca no repo).
//
// Abaixo de lg os cards de item e os cabeçalhos têm um bloco próprio (lg:hidden), com os ids dos botões
// de ação prefixados com `mobile-`; em lg+ vale o bloco de sempre (hidden lg:block), com os ids originais.
//
// Cabeçalhos (lote do Banco e grupos de Despachante/Transporte) abaixo de lg: esquerda = 2 linhas de texto juntas
// (<= 4px entre elas), o bloco centralizado na vertical (altura mínima fixa: lote 69px com a borda, grupo 68px,
// igual com ou sem banco/"Pago"); direita = coluna de 49px (48 de toque + a divisória),
// a MESMA largura dos itens (divisória vertical no mesmo x em todos os blocos), com "Pago" (célula azul suave, linha
// fina embaixo) na metade de cima e a câmera na de baixo (toque >= 48x34), ou só a câmera centralizada. Cards de item
// em aberto do Despachante/Transporte: 2 linhas de conteúdo alinhadas às 2 células de ação (~69px, toque 48x34).
// Cards de 3 linhas (Banco e "Pagamentos realizados"): coluna centralizada, toque >= 44px, sem alinhar linha a linha.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

// --color-accent-dark (#0b3956), --color-ink-soft (#4c6069) e --color-farm-blue (#1c6fa5), em rgb().
const ACCENT_DARK_RGB = "rgb(11, 57, 86)";
// --color-farm-blue-soft (#e3eef6): fundo da célula "Pago" abaixo de lg.
const FARM_BLUE_SOFT_RGB = "rgb(227, 238, 246)";
const INK_SOFT_RGB = "rgb(76, 96, 105)";
const FARM_BLUE_RGB = "rgb(28, 111, 165)";

const MOBILE_VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768", width: 1023, height: 768 },
];

const NOME_LONGO = "Maria das Graças Albuquerque de Vasconcelos Santos Pereira Filha";
const PIX_LONGO = "andreza.faconi.despachante.aduaneira.logistica@exemplo-empresa-comercio-exterior.com.br";

// ── Dados adversariais (100% fictícios) ──────────────────────────────────────
const opcoes = (taxaXP: number | null) => [
  { banco: "XP", taxaCorretagem: 0, taxa: taxaXP },
  { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null },
  { banco: "INTEX", taxaCorretagem: 0, taxa: null },
];
const lote = (id: string, extra: Record<string, unknown>) => ({
  id, data: "2026-10-20", empresa: "FARMAURORA", moeda: "USD", numeroLote: 1, opcoes: opcoes(null),
  bancoEscolhido: null, taxaEscolhida: null, realizado: false, pagoEm: null, createdAt: "2026-10-20T10:00:00Z", ...extra,
});
const lanc = (id: string, loteId: string, cliente: string, valorMoeda: number, valorReais: number | null, extra: Record<string, unknown> = {}) => ({
  id, loteId, data: "2026-10-20", empresa: "FARMAURORA", fornecedor: "Poros - Turquia", invoice: `INV-${id}`,
  cliente, valorMoeda, moeda: "USD", valorReais, taxa: null, createdAt: "2026-10-20T10:00:00Z", ...extra,
});
const grupo = (id: string, tipo: string, nomeGrupo: string, chavePix: string, itens: unknown[], extra: Record<string, unknown> = {}) => ({
  id, tipo, data: "2026-10-20", empresa: "FARMAURORA", nomeGrupo, chavePix, itens, realizado: false, pagoEm: null,
  createdAt: "2026-10-20T10:00:00Z", ...extra,
});

const FIXTURES: Record<string, unknown> = {
  banco: {
    lotes: [
      // US$ 122.220,00 num lote só (total do lote grande) com banco escolhido -> botão "Pago".
      lote("lote-a", { bancoEscolhido: "XP", taxaEscolhida: 5.4, opcoes: opcoes(5.4) }),
      // EUR com total R$ 1.234.567,89 e cliente de nome longo.
      lote("lote-b", { moeda: "EUR", bancoEscolhido: "XP", taxaEscolhida: 6, opcoes: opcoes(6) }),
      // Sem banco ainda (sem botão "Pago").
      lote("lote-c", { numeroLote: 2 }),
      lote("lote-r1", { realizado: true, pagoEm: "2026-10-15T14:00:00Z", data: "2026-10-15", bancoEscolhido: "RENDIMENTO" }),
      lote("lote-r2", { realizado: true, pagoEm: "2026-10-10T14:00:00Z", data: "2026-10-10", bancoEscolhido: "INTEX", taxaEscolhida: 5.5 }),
    ],
    lancamentos: [
      lanc("a1", "lote-a", "Ana Souza", 122220, 659988),
      lanc("b1", "lote-b", NOME_LONGO, 205761.31, 1234567.89, { moeda: "EUR", fornecedor: "Speciality - Índia", invoice: "INV-2026-000123456-ABC" }),
      lanc("c1", "lote-c", "Diego Rocha", 1500, null),
      lanc("r1a", "lote-r1", NOME_LONGO, 122220, 659988, { fornecedor: "Speciality - Índia", invoice: "INV-2026-000123456-ABC" }),
      lanc("r1b", "lote-r1", "Elisa Prado", 3000, 16200),
      lanc("r2a", "lote-r2", "Fábio Nunes", 2500, 13750, { fornecedor: "Beldimed - Bélgica" }),
    ],
  },
  despachante: [
    grupo("gd-1", "DESPACHANTE", "Andreza Faconi", PIX_LONGO, [
      { paciente: "Gisele Melo", valor: 1850.5, status: "NAO_PAGO" },
      { paciente: NOME_LONGO, valor: 1234567.89, status: "COMPLEMENTO" },
    ]),
    grupo("gd-np", "DESPACHANTE", "Paulo Sem Pix", "", [{ paciente: "Rita Sales", valor: 320, status: "NAO_PAGO" }]),
    // Adversarial: nome de grupo longo, PIX de 90 caracteres e total de 9 dígitos (R$ 123.456.790,01).
    grupo("gd-big", "DESPACHANTE", "Despachante Aduaneiro Internacional e Associados", PIX_LONGO, [
      { paciente: "Zé", valor: 98765432.1, status: "NAO_PAGO" },
      { paciente: "Ana Beatriz Cavalcanti de Albuquerque Lima", valor: 24691357.91, status: "NAO_PAGO" },
    ]),
    grupo("gd-r1", "DESPACHANTE", "Marcelo Lima", "marcelo@exemplo.com", [
      { paciente: NOME_LONGO, valor: 1234567.89, status: "PAGO" },
      { paciente: "Carla Dias", valor: 450, status: "COMPLEMENTO" },
    ], { realizado: true, pagoEm: "2026-10-12T14:00:00Z", data: "2026-10-12" }),
    grupo("gd-r2", "DESPACHANTE", "Bruno Lopes", "12.345.678/0001-90", [{ paciente: "Bruno Lima", valor: 780, status: "PAGO" }],
      { realizado: true, pagoEm: "2026-10-05T14:00:00Z", data: "2026-10-05" }),
  ],
  transportadora: [
    grupo("gt-1", "TRANSPORTADORA", "AJC", "ajc.transportes.expressos.do.brasil.ltda@exemplo-logistica.com.br", [
      { paciente: "Diego Rocha", valor: 600, status: "NAO_PAGO" },
      { paciente: NOME_LONGO, valor: 98765.43, status: "NAO_PAGO" },
    ]),
    grupo("gt-np", "TRANSPORTADORA", "Rápido Sem Pix", "", [{ paciente: "Rita Sales", valor: 320, status: "NAO_PAGO" }]),
    grupo("gt-big", "TRANSPORTADORA", "Transportadora Rodoviária Internacional de Cargas Ltda", PIX_LONGO, [
      { paciente: "Zé", valor: 98765432.1, status: "NAO_PAGO" },
      { paciente: "Ana Beatriz Cavalcanti de Albuquerque Lima", valor: 24691357.91, status: "NAO_PAGO" },
    ]),
    grupo("gt-r1", "TRANSPORTADORA", "Doctor", "00.111.222/0001-33", [
      { paciente: NOME_LONGO, valor: 1234567.89, status: "PAGO" },
      { paciente: "Elisa Prado", valor: 410, status: "PAGO" },
    ], { realizado: true, pagoEm: "2026-10-14T14:00:00Z", data: "2026-10-14" }),
    grupo("gt-r2", "TRANSPORTADORA", "AJC", "ajc@exemplo.com", [{ paciente: "Hugo Alves", valor: 220, status: "COMPLEMENTO" }],
      { realizado: true, pagoEm: "2026-10-03T14:00:00Z", data: "2026-10-03" }),
  ],
  "despachante-pix": { "Andreza Faconi": PIX_LONGO },
  "transportadora-pix": { AJC: "ajc.transportes.expressos.do.brasil.ltda@exemplo-logistica.com.br" },
};

type TabKey = "banco" | "cotacao" | "despachante" | "transportadora";

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

// Só GET de /api/pagamentos/{banco,despachante,transportadora,*-pix} é respondido com os dados
// acima; qualquer outro método nessas rotas é abortado (nada é gravado).
async function mockPagamentos(page: Page): Promise<void> {
  await page.route(/\/api\/pagamentos\/(banco|despachante|transportadora|despachante-pix|transportadora-pix)(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.abort();
      return;
    }
    const key = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES[key]) });
  });
}

async function gotoPagamentos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await mockPagamentos(page);
  await login(page);
  await page.goto("/pagamentos", { waitUntil: "networkidle" });
  await expect(page.locator("#tab-banco")).toBeVisible();
  await expect(page.locator("#lote-banco-lote-a")).toBeVisible();
}

async function abrirAba(page: Page, tab: TabKey): Promise<void> {
  await page.locator(`#tab-${tab}`).click();
  await page.waitForTimeout(200);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const right = (r: Rect): number => r.x + r.width;
const bottom = (r: Rect): number => r.y + r.height;
const centerY = (r: Rect): number => r.y + r.height / 2;
const sobrepoe = (a: Rect, b: Rect): boolean =>
  a.x < right(b) - 1 && right(a) - 1 > b.x && a.y < bottom(b) - 1 && bottom(a) - 1 > b.y;

async function rect(loc: Locator, what: string): Promise<Rect> {
  const b = await loc.first().boundingBox();
  expect(b, `${what} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}

function semSobreposicao(itens: Array<[string, Rect]>): void {
  for (let i = 0; i < itens.length; i++) {
    for (let j = i + 1; j < itens.length; j++) {
      expect(sobrepoe(itens[i]![1], itens[j]![1]), `${itens[i]![0]} sobrepõe ${itens[j]![0]}`).toBe(false);
    }
  }
}

// Respiro das abas: da linha do cabeçalho (fim do elemento que precede a barra) até o texto, e do texto até a
// linha da barra (borda inferior). O texto é o retângulo do conteúdo do botão.
async function respiroAbas(page: Page): Promise<{ acima: number; abaixo: number }> {
  return page.locator("#tab-banco").evaluate((btn) => {
    const barra = btn.parentElement as HTMLElement;
    const linhaCabecalho = (barra.previousElementSibling as HTMLElement).getBoundingClientRect().bottom;
    const range = document.createRange();
    range.selectNodeContents(btn);
    const texto = range.getBoundingClientRect();
    const linhaBarra = barra.getBoundingClientRect().bottom - parseFloat(getComputedStyle(barra).borderBottomWidth);
    return { acima: texto.top - linhaCabecalho, abaixo: linhaBarra - texto.bottom };
  });
}

const css = (loc: Locator, prop: string): Promise<string> =>
  loc.first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

// --color-hairline (#c9d3d1), em rgb().
const HAIRLINE_RGB = "rgb(201, 211, 209)";
const centerX = (r: Rect): number => r.x + r.width / 2;

// Quantas linhas de texto o elemento ocupa (retângulos de linha distintos do conteúdo).
const linhasDeTexto = (loc: Locator): Promise<number> =>
  loc.first().evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  });

const arred = (n: number): number => Math.round(n * 10) / 10;

// Respiro do bloco de texto de um cabeçalho (título/nome + selo + data/"Valor total") abaixo de lg, pelos retângulos de
// conteúdo do texto (Range, como o respiro das abas): distância entre as duas linhas, espaço acima do bloco e abaixo
// dele (até a base útil do cabeçalho, sem a borda inferior) e distância vertical entre o centro do selo e o do título.
async function respiroTexto(
  header: Locator,
  titulo: Locator,
  selo: Locator,
  linha2: Locator,
): Promise<{ gap: number; acima: number; abaixo: number; seloDelta: number }> {
  const [tEl, sEl, lEl] = await Promise.all([titulo.first().elementHandle(), selo.first().elementHandle(), linha2.first().elementHandle()]);
  expect(tEl && sEl && lEl, "título, selo e segunda linha do cabeçalho devem existir").toBeTruthy();
  return header.evaluate(
    (hdr, [t, s, l]) => {
      const texto = (el: Element): DOMRect => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      };
      const h = hdr.getBoundingClientRect();
      const base = h.bottom - parseFloat(getComputedStyle(hdr).borderBottomWidth);
      const tt = texto(t);
      const ll = texto(l);
      const ss = s.getBoundingClientRect();
      return {
        gap: ll.top - tt.bottom,
        acima: Math.min(tt.top, ss.top) - h.top,
        abaixo: base - ll.bottom,
        seloDelta: Math.abs((ss.top + ss.bottom) / 2 - (tt.top + tt.bottom) / 2),
      };
    },
    [tEl!, sEl!, lEl!] as [ElementHandle<HTMLElement | SVGElement>, ElementHandle<HTMLElement | SVGElement>, ElementHandle<HTMLElement | SVGElement>],
  );
}

// Duas linhas de texto juntas (<= 4px) e o bloco centralizado na vertical (acima = abaixo, +-1px), com o selo no
// centro do título (+-1px).
function verificarRespiro(r: { gap: number; acima: number; abaixo: number; seloDelta: number }, what: string): void {
  expect(r.gap, `${what}: distância entre as duas linhas de texto`).toBeLessThanOrEqual(4);
  expect(Math.abs(r.acima - r.abaixo), `${what}: bloco de texto centralizado (acima ${arred(r.acima)}px, abaixo ${arred(r.abaixo)}px)`).toBeLessThanOrEqual(1);
  expect(r.seloDelta, `${what}: centro do selo x centro do título`).toBeLessThanOrEqual(1);
  medida(`${what}: título→segunda linha ${arred(r.gap)}px, acima ${arred(r.acima)}px, abaixo ${arred(r.abaixo)}px, selo a ${arred(r.seloDelta)}px do centro do título`);
}

// Contraste WCAG entre duas cores "rgb(r, g, b)".
function luminancia(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}
function medida(texto: string): void {
  console.log(`[medida] ${texto}`);
}

// Coluna de ações dos CABEÇALHOS (lote do Banco e grupos) abaixo de lg: 49px (48 de toque + a divisória à esquerda,
// a mesma largura da coluna dos itens) na altura toda do cabeçalho. Com "Pago": ele na metade de cima e a câmera na
// de baixo, cada um com metade da altura e a largura toda da coluna (toque >= 48x34), com uma linha fina
// (hairline) entre os dois; o "Pago" é uma célula clara (azul suave), nunca o azul-marinho sólido, com texto de
// contraste >= 4,5:1. Sem "Pago": a câmera ocupa a coluna inteira, com o centro no centro do cabeçalho (1px).
async function verificarColunaCabecalho(
  header: Locator,
  camera: Locator,
  pago: Locator | null,
  what: string,
): Promise<{ h: Rect; coluna: Rect; camera: Rect; pago: Rect | null }> {
  const h = await rect(header, `${what}: cabeçalho`);
  const colunaLoc = camera.locator("xpath=..");
  const k = await rect(colunaLoc, `${what}: coluna`);
  const c = await rect(camera, `${what}: câmera`);
  expect(await css(colunaLoc, "border-left-width"), `${what}: divisória à esquerda`).toBe("1px");
  expect(await css(colunaLoc, "border-left-color"), `${what}: cor da divisória`).toBe(HAIRLINE_RGB);
  expect(Math.abs(k.width - 49), `${what}: coluna de 49px (48 + divisória)`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(k.y - h.y), `${what}: coluna começa no topo do cabeçalho`).toBeLessThanOrEqual(1);
  expect(Math.abs(right(k) - right(h)), `${what}: coluna encostada na borda direita`).toBeLessThanOrEqual(1);
  expect(Math.abs(bottom(k) - bottom(h)), `${what}: coluna com a altura toda do cabeçalho`).toBeLessThanOrEqual(1.5);
  expect(c.width, `${what}: câmera largura`).toBeGreaterThanOrEqual(47.99);
  expect(c.height, `${what}: câmera altura`).toBeGreaterThanOrEqual(33.99);
  expect(c.x, `${what}: câmera dentro da coluna`).toBeGreaterThanOrEqual(k.x - 0.5);
  expect(right(c), `${what}: câmera dentro da coluna`).toBeLessThanOrEqual(right(k) + 0.5);

  if (!pago) {
    expect(Math.abs(centerY(c) - centerY(h)), `${what}: câmera centralizada no cabeçalho`).toBeLessThanOrEqual(1);
    medida(`${what}: sem Pago, câmera ${arred(c.width)}x${arred(c.height)}, centro a ${arred(Math.abs(centerY(c) - centerY(h)))}px do centro do cabeçalho (${h.height}px)`);
    return { h, coluna: k, camera: c, pago: null };
  }
  const p = await rect(pago, `${what}: Pago`);
  expect(p.width, `${what}: Pago largura`).toBeGreaterThanOrEqual(47.99);
  expect(p.height, `${what}: Pago altura`).toBeGreaterThanOrEqual(33.99);
  expect(Math.abs(p.height - c.height), `${what}: Pago e câmera com a mesma altura`).toBeLessThanOrEqual(1);
  expect(Math.abs(p.height - k.height / 2), `${what}: Pago com metade da altura da coluna`).toBeLessThanOrEqual(1);
  expect(Math.abs(p.x - c.x) + Math.abs(p.width - c.width), `${what}: Pago e câmera na mesma coluna`).toBeLessThanOrEqual(1);
  expect(Math.abs(p.y - k.y), `${what}: Pago no topo da coluna`).toBeLessThanOrEqual(1);
  expect(bottom(p), `${what}: Pago acima da câmera`).toBeLessThanOrEqual(c.y + 1);
  expect(Math.abs(bottom(c) - bottom(k)), `${what}: câmera no fim da coluna`).toBeLessThanOrEqual(1.5);
  // Linha fina entre os dois (borda inferior do "Pago", igual à que separa lápis e lixeira nos itens).
  expect(await css(pago, "border-bottom-width"), `${what}: linha entre Pago e câmera`).toBe("1px");
  expect(await css(pago, "border-bottom-color"), `${what}: cor da linha entre Pago e câmera`).toBe(HAIRLINE_RGB);
  expect(await css(camera, "border-top-width"), `${what}: uma linha só entre Pago e câmera`).toBe("0px");
  expect(await css(pago, "box-shadow"), `${what}: Pago sem sombra`).toBe("none");
  expect(await css(pago, "border-top-left-radius"), `${what}: Pago sem canto arredondado`).toBe("0px");
  // Célula clara: nada do azul-marinho sólido; texto em accent-dark com contraste >= 4,5:1.
  const fundo = await css(pago, "background-color");
  const texto = await css(pago, "color");
  expect(fundo, `${what}: Pago não é o azul-marinho sólido`).not.toBe(ACCENT_DARK_RGB);
  expect(fundo, `${what}: fundo do Pago`).toBe(FARM_BLUE_SOFT_RGB);
  expect(texto, `${what}: texto do Pago`).toBe(ACCENT_DARK_RGB);
  expect(await css(pago, "font-weight"), `${what}: Pago em semibold`).toBe("600");
  const razao = contraste(fundo, texto);
  expect(razao, `${what}: contraste do texto do Pago`).toBeGreaterThanOrEqual(4.5);
  medida(`${what}: Pago ${arred(p.width)}x${arred(p.height)} (fundo ${fundo}, contraste ${arred(razao)}:1), câmera ${arred(c.width)}x${arred(c.height)}, cabeçalho ${h.height}px`);
  return { h, coluna: k, camera: c, pago: p };
}

// Card de item de 2 linhas (Despachante/Transporte em aberto) abaixo de lg: coluna de ações com divisória, lápis na
// linha 1 e lixeira na linha 2 (toque >= 48x34), o nome centralizado na linha do lápis e valor + status centralizados
// na linha da lixeira (2px). Com o nome numa linha só o card tem ~69px (2x34 + 1px de separador); com o nome em 2
// linhas ele só cresce o necessário e o bloco do nome segue centralizado na célula do lápis.
async function verificarItemDuasLinhas(card: Locator, editar: Locator, excluir: Locator, what: string): Promise<void> {
  const c = await rect(card, `${what}: card`);
  const e = await rect(editar, `${what}: lápis`);
  const x = await rect(excluir, `${what}: lixeira`);
  for (const [nome, b] of [["lápis", e], ["lixeira", x]] as const) {
    expect(b.width, `${what}: ${nome} largura`).toBeGreaterThanOrEqual(47.99);
    expect(b.height, `${what}: ${nome} altura`).toBeGreaterThanOrEqual(33.99);
  }
  expect(Math.abs(e.x - x.x), `${what}: lápis e lixeira no mesmo x`).toBeLessThanOrEqual(1);
  expect(x.y, `${what}: lixeira abaixo do lápis`).toBeGreaterThanOrEqual(bottom(e) - 1);

  const colunaLoc = editar.locator("xpath=..");
  const k = await rect(colunaLoc, `${what}: coluna`);
  expect(await css(colunaLoc, "border-left-width"), `${what}: divisória à esquerda`).toBe("1px");
  expect(await css(colunaLoc, "border-left-color"), `${what}: cor da divisória`).toBe(HAIRLINE_RGB);
  expect(Math.abs(k.y - c.y), `${what}: coluna começa no topo do card`).toBeLessThanOrEqual(1);
  expect(Math.abs(right(k) - right(c)), `${what}: coluna encostada na borda direita`).toBeLessThanOrEqual(1);
  // A linha horizontal entre lápis e lixeira existe só dentro da coluna (a lixeira leva a borda superior).
  expect(await css(excluir, "border-top-width"), `${what}: linha entre lápis e lixeira`).toBe("1px");

  const bloco = card.locator("> div:visible");
  await expect(bloco, `${what}: um único bloco visível`).toHaveCount(1);
  const celulaNome = bloco.locator("> div").nth(0);
  const celulaValor = bloco.locator("> div").nth(1);
  const nomeSpan = celulaNome.locator("> span");
  const nome = await rect(nomeSpan, `${what}: nome`);
  expect(right(nome), `${what}: nome sob a coluna de ações`).toBeLessThanOrEqual(k.x + 0.5);
  expect(await css(nomeSpan, "text-overflow"), `${what}: nome com reticências`).not.toBe("ellipsis");
  expect(await nomeSpan.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${what}: nome cortado`).toBe(true);
  const linhasNome = await linhasDeTexto(nomeSpan);

  // Linha 1: o bloco do nome centralizado na célula do lápis; a 1ª linha do texto dentro da altura da célula.
  expect(Math.abs(centerY(nome) - centerY(e)), `${what}: nome centralizado na linha do lápis`).toBeLessThanOrEqual(2);
  const primeiraLinhaTop = await nomeSpan.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects()[0]!.top;
  });
  expect(primeiraLinhaTop, `${what}: 1ª linha do nome acima da célula do lápis`).toBeGreaterThanOrEqual(e.y - 0.5);
  expect(primeiraLinhaTop, `${what}: 1ª linha do nome abaixo da célula do lápis`).toBeLessThanOrEqual(bottom(e));

  // Linha 2: valor + status (o conjunto) centralizados na célula da lixeira.
  const valores = await rect(celulaValor.locator("> *").first(), `${what}: valor`);
  const status = await rect(celulaValor.locator("> button"), `${what}: status`);
  const topoConjunto = Math.min(valores.y, status.y);
  const conjunto: Rect = {
    x: valores.x,
    y: topoConjunto,
    width: right(status) - valores.x,
    height: Math.max(bottom(valores), bottom(status)) - topoConjunto,
  };
  expect(Math.abs(centerY(conjunto) - centerY(x)), `${what}: valor + status centralizados na linha da lixeira`).toBeLessThanOrEqual(2);
  expect(Math.abs(centerY(valores) - centerY(status)), `${what}: valor e status na mesma linha`).toBeLessThanOrEqual(2);
  expect(right(status), `${what}: status sob a coluna de ações`).toBeLessThanOrEqual(k.x + 0.5);
  expect(valores.y, `${what}: valor abaixo do nome`).toBeGreaterThanOrEqual(bottom(nome) - 1);
  semSobreposicao([["nome", nome], ["valor", valores], ["status", status]]);

  if (linhasNome === 1) expect(c.height, `${what}: altura do card`).toBeLessThanOrEqual(69.5);
  else expect(c.height, `${what}: o card só cresce o necessário`).toBeLessThanOrEqual(69.5 + (linhasNome - 1) * 21);
  medida(
    `${what}: card ${c.height}px, nome em ${linhasNome} linha(s), lápis ${Math.round(e.width)}x${arred(e.height)}, lixeira ${Math.round(x.width)}x${arred(x.height)}, nome↔lápis ${arred(Math.abs(centerY(nome) - centerY(e)))}px, valor+status↔lixeira ${arred(Math.abs(centerY(conjunto) - centerY(x)))}px`,
  );
}

// Coluna de ações dos cards de item de 3 linhas abaixo de lg: lápis ACIMA da lixeira (mesmo x, y crescente), as duas
// com >= 44x44 e centralizadas numa coluna com divisória vertical à esquerda, na altura total do card.
// Devolve o retângulo da coluna (o conteúdo à esquerda nunca passa dele).
async function verificarColunaDeAcoes(card: Locator, editar: Locator, excluir: Locator, what: string): Promise<Rect> {
  const c = await rect(card, `${what}: card`);
  const e = await rect(editar, `${what}: lápis`);
  const x = await rect(excluir, `${what}: lixeira`);
  for (const [nome, b] of [["lápis", e], ["lixeira", x]] as const) {
    expect(b.width, `${what}: ${nome} largura`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${what}: ${nome} altura`).toBeGreaterThanOrEqual(44);
  }
  expect(Math.abs(e.x - x.x), `${what}: lápis e lixeira no mesmo x`).toBeLessThanOrEqual(1);
  expect(x.y, `${what}: lixeira abaixo do lápis`).toBeGreaterThanOrEqual(bottom(e) - 1);

  const coluna = editar.locator("xpath=..");
  const k = await rect(coluna, `${what}: coluna de ações`);
  expect(await css(coluna, "border-left-width"), `${what}: divisória à esquerda`).toBe("1px");
  expect(await css(coluna, "border-left-color"), `${what}: cor da divisória`).toBe(HAIRLINE_RGB);
  expect(Math.abs(k.y - c.y), `${what}: coluna começa no topo do card`).toBeLessThanOrEqual(1);
  expect(Math.abs(bottom(k) - bottom(c)), `${what}: coluna com a altura total do card`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(right(k) - right(c)), `${what}: coluna encostada na borda direita`).toBeLessThanOrEqual(1);
  expect(c.height, `${what}: altura mínima de ~88px`).toBeGreaterThanOrEqual(87);
  expect(Math.abs(centerX(e) - centerX(k)), `${what}: lápis centralizado na coluna`).toBeLessThanOrEqual(1);
  expect(Math.abs(centerX(x) - centerX(k)), `${what}: lixeira centralizada na coluna`).toBeLessThanOrEqual(1);
  expect(e.x).toBeGreaterThanOrEqual(k.x - 0.5);
  expect(right(e)).toBeLessThanOrEqual(right(k) + 0.5);
  return k;
}

// Conteúdo à esquerda da coluna: nome inteiro (quebra, sem reticências), nada sob a coluna, valores em wrap.
// Sem coluna (somente leitura) o conteúdo ocupa a largura toda do card.
async function verificarConteudo(conteudo: Locator, coluna: Rect | null, card: Rect, what: string): Promise<void> {
  const caixa = await rect(conteudo, `${what}: conteúdo`);
  if (coluna) expect(right(caixa), `${what}: conteúdo sob a coluna de ações`).toBeLessThanOrEqual(coluna.x + 0.5);
  else expect(Math.abs(right(card) - right(caixa)), `${what}: sem coluna, o conteúdo ocupa a largura toda`).toBeLessThanOrEqual(1);

  const filhos = conteudo.locator("> *");
  const nome = filhos.first();
  expect(await css(nome, "text-overflow"), `${what}: nome com reticências`).not.toBe("ellipsis");
  expect(await css(nome, "white-space"), `${what}: nome em linha única`).not.toBe("nowrap");
  expect(await nome.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${what}: nome cortado`).toBe(true);
  const n = await rect(nome, `${what}: nome`);
  expect(right(n)).toBeLessThanOrEqual(right(caixa) + 0.5);

  const valores = filhos.last();
  expect(await css(valores, "flex-wrap"), `${what}: valores sem wrap`).toBe("wrap");
  expect(await valores.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${what}: valores estouram`).toBe(true);
  const v = await rect(valores, `${what}: valores`);
  expect(v.y, `${what}: valores abaixo do nome`).toBeGreaterThanOrEqual(bottom(n) - 1);
  for (const filho of await valores.locator("> *").all()) {
    const f = await rect(filho, `${what}: filho dos valores`);
    expect(right(f), `${what}: valor estoura o card`).toBeLessThanOrEqual(right(card) + 0.5);
  }
}

function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const main = document.querySelector("#app-main-content");
    const mainOverflow = main ? main.scrollWidth > main.clientWidth + 1 : false;
    return mainOverflow || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

const bodyOverflow = (page: Page) => page.evaluate(() => document.body.style.overflow);

test.describe("/pagamentos abaixo de lg — abas", () => {
  test.describe.configure({ retries: 2 });

  for (const width of [360, 375, 390, 430, 768, 820, 1023]) {
    test(`${width}px: 4 abas centralizadas, visíveis, sem corte/scroll, toque >= 44px, rótulo "Câmbio"`, async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await gotoPagamentos(page, { width, height: 800 });

      const ids = ["#tab-banco", "#tab-cotacao", "#tab-despachante", "#tab-transportadora"];
      const labels = ["Banco", "Câmbio", "Despachante", "Transporte"];
      const bar = page.locator("#tab-banco").locator("xpath=..");
      const barBox = await rect(bar, "barra de abas");

      const scroll = await bar.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(scroll.sw, "barra de abas com scroll horizontal").toBeLessThanOrEqual(scroll.cw + 1);
      expect(await css(bar, "justify-content")).toBe("center");

      const boxes: Rect[] = [];
      for (const [i, id] of ids.entries()) {
        const tab = page.locator(id);
        expect((await tab.innerText()).trim()).toBe(labels[i]);
        const r = await rect(tab, id);
        expect(r.height, `${id} altura`).toBeGreaterThanOrEqual(44);
        expect(r.width, `${id} largura`).toBeGreaterThanOrEqual(44);
        expect(r.x, `${id} cortada à esquerda`).toBeGreaterThanOrEqual(barBox.x - 0.5);
        expect(right(r), `${id} cortada à direita`).toBeLessThanOrEqual(right(barBox) + 0.5);
        // Rótulo nunca quebra no meio: uma única linha de texto.
        const linhas = await tab.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        });
        expect(linhas, `${id} quebrou o rótulo`).toBe(1);
        boxes.push(r);
      }
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThanOrEqual(right(boxes[i - 1]!) - 0.5);

      // Centralizadas: sobra igual dos dois lados.
      const esq = boxes[0]!.x - barBox.x;
      const dir = right(barBox) - right(boxes[3]!);
      expect(Math.abs(esq - dir), `sobras ${esq} x ${dir}`).toBeLessThanOrEqual(2);

      // Respiro igual acima (linha do cabeçalho) e abaixo (linha da barra) do texto das abas: diferença <= 1px.
      const respiro = await respiroAbas(page);
      expect(Math.abs(respiro.acima - respiro.abaixo), `respiro acima ${respiro.acima} x abaixo ${respiro.abaixo}`).toBeLessThanOrEqual(1);
      medida(`${width}px: respiro das abas acima ${Math.round(respiro.acima * 100) / 100} x abaixo ${Math.round(respiro.abaixo * 100) / 100}`);

      // Indicador da aba ativa mantido (2px accent-dark); as demais transparentes.
      for (const [i, id] of ids.entries()) {
        await page.locator(id).click();
        for (const [j, outro] of ids.entries()) {
          // A cor transita (transition-colors): espera assentar antes de comparar.
          const esperada = i === j ? ACCENT_DARK_RGB : "rgba(0, 0, 0, 0)";
          await expect
            .poll(() => css(page.locator(outro), "border-bottom-color"), { message: `${outro} ${i === j ? "ativa" : "inativa"}` })
            .toBe(esperada);
          if (i === j) expect(await css(page.locator(outro), "border-bottom-width")).toBe("2px");
        }
      }
    });
  }
});

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`/pagamentos abaixo de lg — ${viewport.name}`, () => {
    test.describe.configure({ retries: 2 });

    test.beforeEach(async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await gotoPagamentos(page, viewport);
    });

    test('"+" flutuante: 56x56, mesmo canto/offset, ação e rótulo por aba, ausente em Câmbio', async ({ page }) => {
      const fab = page.locator("#fab-pagamentos");
      const porAba: Array<{ tab: TabKey; label: string; heading: RegExp }> = [
        { tab: "banco", label: "Novo pagamento", heading: /^Novo pagamento$/ },
        { tab: "despachante", label: "Adicionar pagamento", heading: /Adicionar pagamento — Despachante/ },
        { tab: "transportadora", label: "Adicionar pagamento", heading: /Adicionar pagamento — Transportadora/ },
      ];

      for (const { tab, label, heading } of porAba) {
        await abrirAba(page, tab);
        await expect(fab, `${tab}: "+" visível`).toBeVisible();
        const f = await rect(fab, "fab");
        expect(Math.round(f.width)).toBe(56);
        expect(Math.round(f.height)).toBe(56);
        expect(Math.round(viewport.width - right(f)), "offset à direita").toBe(16);
        // 60px do BottomNav + 16px (safe-area é 0 no Chromium desktop).
        expect(Math.round(viewport.height - bottom(f)), "offset acima do BottomNav").toBe(76);
        expect(await css(fab, "background-color")).toBe(ACCENT_DARK_RGB);
        expect(await css(fab, "z-index")).toBe("30");

        // Rótulo descritivo, sem texto visível; o botão acessível é o "+" (não o de texto).
        await expect(fab).toHaveAttribute("aria-label", label);
        await expect(fab).toHaveAttribute("title", label);
        expect((await fab.innerText()).trim()).toBe("");
        await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: `+ ${tab === "banco" ? "Novo pagamento" : "Adicionar pagamento"}` })).toBeHidden();

        // Os botões de texto do cabeçalho da seção saem da tela abaixo de lg.
        await expect(page.locator(tab === "banco" ? "#btn-novo-pagamento-banco" : `#btn-novo-pagamento-${tab.toUpperCase()}`)).toBeHidden();

        // Ação: mesmo modal do botão de texto de sempre; por cima do "+" (z-index do overlay).
        await fab.click();
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        const coberto = await page.evaluate(
          ({ x, y }) => !document.elementFromPoint(x, y)?.closest("#fab-pagamentos"),
          { x: f.x + f.width / 2, y: f.y + f.height / 2 },
        );
        expect(coberto, "modal deve ficar acima do '+'").toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("heading", { name: heading })).toBeHidden();
      }

      // Câmbio: não renderiza (nem o "+" nem botão de adicionar).
      await abrirAba(page, "cotacao");
      await expect(fab).toHaveCount(0);
      await expect(page.locator("#btn-novo-pagamento-banco")).toHaveCount(0);

      // z-index: abaixo do BottomNav (a barra cobre o "+" se ele descesse até ela).
      await abrirAba(page, "banco");
      const zNav = await css(page.locator("#bottom-nav"), "z-index");
      expect(Number(zNav)).toBeGreaterThan(30);
    });

    test("folga inferior: o '+' nunca cobre o último card de cada aba", async ({ page }) => {
      for (const tab of ["banco", "despachante", "transportadora"] as const) {
        await abrirAba(page, tab);
        await page.evaluate(() => {
          const main = document.querySelector("#app-main-content");
          if (main) main.scrollTop = main.scrollHeight;
        });
        await page.waitForTimeout(150);
        const f = await rect(page.locator("#fab-pagamentos"), "fab");
        const ultimo = page
          .locator(tab === "banco" ? "#banco-realizados-lista > div" : `#grupo-realizados-lista-${tab.toUpperCase()} > div`)
          .last();
        const u = await rect(ultimo, `${tab}: último card`);
        expect(bottom(u), `${tab}: último card coberto pelo '+'`).toBeLessThanOrEqual(f.y);
      }
    });

    test("cabeçalho do lote do Banco: título + selo na linha 1, data DD/MM/AAAA na linha 2, altura idêntica com ou sem banco, Pago acima da câmera na coluna com divisória", async ({ page }) => {
      const alturas: Record<string, number> = {};
      for (const id of ["lote-a", "lote-b", "lote-c"]) {
        const card = page.locator(`#lote-banco-${id}`);
        await card.scrollIntoViewIfNeeded();
        const c = await rect(card, id);
        const header = card.locator("> div").first();
        expect(await css(header, "display"), `${id}: cabeçalho em grid`).toBe("grid");

        // O "+ Lançamento" de cada lote não existe mais: a moeda do "Novo pagamento" define o lote.
        await expect(page.locator(`#btn-novo-lancamento-lote-${id}`)).toHaveCount(0);
        await expect(header).not.toContainText("+ Lançamento");

        // Só a variante curta aparece: o título sem a data longa e a data em DD/MM/AAAA (a outra é display:none).
        const tituloLoc = header.locator("span.font-display").filter({ visible: true });
        await expect(tituloLoc).toHaveCount(1);
        await expect(tituloLoc).toHaveText(id === "lote-c" ? "Aguardando banco" : "Banco XP");
        const dataLoc = header.getByText(/^\d{2}\/\d{2}\/\d{4}$/);
        await expect(dataLoc).toBeVisible();
        await expect(dataLoc).toHaveText("20/10/2026");
        expect(await header.innerText(), `${id}: data longa visível`).not.toContain("de outubro de");

        const titulo = await rect(tituloLoc, `${id}: título`);
        const selo = await rect(header.locator("span.rounded-full"), `${id}: selo`);
        const data = await rect(dataLoc, `${id}: data`);

        // Linha 1: título em UMA linha (sem truncar) e o selo logo ao lado dele, não na borda direita.
        expect(await linhasDeTexto(tituloLoc), `${id}: título deve caber em uma linha`).toBe(1);
        expect(await css(tituloLoc, "text-overflow")).not.toBe("ellipsis");
        expect(await tituloLoc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${id}: título cortado`).toBe(true);
        expect(Math.abs(centerY(selo) - centerY(titulo)), `${id}: selo na linha do título`).toBeLessThanOrEqual(1);
        expect(selo.x - right(titulo), `${id}: selo colado ao título`).toBeGreaterThanOrEqual(-0.5);
        expect(selo.x - right(titulo), `${id}: selo longe do título`).toBeLessThanOrEqual(12);

        // Linha 2: data curta alinhada à esquerda do título, logo abaixo (sem folga além do line-height).
        expect(data.y, `${id}: data abaixo do título`).toBeGreaterThanOrEqual(bottom(titulo) - 1);
        expect(data.y - bottom(titulo), `${id}: folga entre as duas linhas de texto`).toBeLessThanOrEqual(4);
        expect(Math.abs(data.x - titulo.x), `${id}: data alinhada ao título`).toBeLessThanOrEqual(1);
        verificarRespiro(await respiroTexto(header, tituloLoc, header.locator("span.rounded-full"), dataLoc), `${id}: lote`);

        // Coluna de ações: com banco, Pago na metade de cima e câmera na de baixo; sem banco, só a câmera centralizada.
        const pagoLoc = page.locator(`#btn-pagar-lote-${id}`);
        const temPago = (await pagoLoc.count()) > 0;
        expect(temPago, "só o lote sem banco escolhido não tem Pago").toBe(id !== "lote-c");
        const col = await verificarColunaCabecalho(header, page.locator(`#btn-exportar-lote-${id}`), temPago ? pagoLoc : null, id);
        alturas[id] = col.h.height;

        const itens: Array<[string, Rect]> = [["título", titulo], ["selo", selo], ["data", data], ["câmera", col.camera]];
        if (col.pago) itens.push(["Pago", col.pago]);
        semSobreposicao(itens);
        for (const [nome, r] of itens) {
          expect(r.x, `${id}: ${nome} fora do card`).toBeGreaterThanOrEqual(c.x - 0.5);
          expect(right(r), `${id}: ${nome} fora do card`).toBeLessThanOrEqual(right(c) + 0.5);
        }
        for (const [nome, r] of [["título", titulo], ["selo", selo], ["data", data]] as const) {
          expect(right(r), `${id}: ${nome} sob a coluna de ações`).toBeLessThanOrEqual(col.coluna.x + 0.5);
        }

        // Rodapé (Taxa / Total / Total R$): nada passa da borda do card, mesmo com valores grandes.
        const rodape = card.locator("> div").last();
        const overflow = await rodape.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const filhos = [...el.querySelectorAll("span, strong")].map((n) => n.getBoundingClientRect().right);
          return { sobra: el.scrollWidth - el.clientWidth, maxRight: Math.max(...filhos), right: r.right };
        });
        expect(overflow.sobra, `${id}: rodapé com scroll interno`).toBeLessThanOrEqual(1);
        expect(overflow.maxRight, `${id}: rodapé estoura o card`).toBeLessThanOrEqual(overflow.right + 0.5);
      }
      // Altura mínima fixa (68px + 1px da borda inferior = 69px) e IDÊNTICA com ou sem banco definido.
      for (const id of ["lote-a", "lote-b", "lote-c"]) {
        expect(Math.abs(alturas[id]! - 69), `${id}: altura do cabeçalho`).toBeLessThanOrEqual(0.5);
      }
      expect(Math.abs(alturas["lote-a"]! - alturas["lote-c"]!), "cabeçalho com banco x aguardando banco").toBeLessThanOrEqual(1);
      expect(Math.abs(alturas["lote-b"]! - alturas["lote-c"]!), "cabeçalho com banco x aguardando banco").toBeLessThanOrEqual(1);
      medida(`lote do Banco: cabeçalho ${alturas["lote-a"]}px (com banco) x ${alturas["lote-c"]}px (aguardando banco)`);
      await expect(page.locator("#lote-banco-lote-a")).toContainText("US$ 122.220,00");
      await expect(page.locator("#lote-banco-lote-b")).toContainText("R$ 1.234.567,86");
    });

    for (const [tab, grupoId, bigId, semPixId] of [
      ["despachante", "gd-1", "gd-big", "gd-np"],
      ["transportadora", "gt-1", "gt-big", "gt-np"],
    ] as const) {
      test(`cabeçalho do grupo do ${tab}: nome + selo na linha 1, Valor total na linha 2, PIX oculto, Pago acima da câmera na coluna com divisória`, async ({ page }) => {
        await abrirAba(page, tab);
        const alturas: Record<string, number> = {};
        for (const id of [grupoId, bigId, semPixId]) {
          const card = page.locator(`#grupo-pagamento-${id}`);
          await card.scrollIntoViewIfNeeded();
          const c = await rect(card, id);
          const header = card.locator("> div").first();
          const toggle = header.locator("> button").first();
          expect(await css(header, "display"), `${id}: cabeçalho em grid`).toBe("grid");

          // O PIX só aparece em lg+: abaixo de lg nem é visível nem ocupa espaço (sem texto visível duplicado).
          await expect(toggle.locator("span", { hasText: "PIX:" }), `${id}: PIX oculto`).toBeHidden();
          expect(await header.innerText(), `${id}: PIX visível`).not.toContain("PIX:");

          const nomeLoc = toggle.locator("span.font-display").first();
          const totalLoc = toggle.locator("span.font-display").last();
          const nome = await rect(nomeLoc, `${id}: nome`);
          const selo = await rect(toggle.locator("span.font-mono").first(), `${id}: selo`);
          const total = await rect(totalLoc, `${id}: valor total`);

          // Linha 1 = nome + selo (selo logo ao lado do nome); linha 2 = "Valor total", sem truncar.
          expect(Math.abs(centerY(selo) - centerY(nome)), `${id}: selo na linha do nome`).toBeLessThanOrEqual(2);
          expect(selo.x - right(nome), `${id}: selo colado ao nome`).toBeGreaterThanOrEqual(-0.5);
          expect(selo.x - right(nome), `${id}: selo longe do nome`).toBeLessThanOrEqual(12);
          expect(total.y, `${id}: valor total abaixo do nome`).toBeGreaterThanOrEqual(bottom(nome) - 1);
          expect(total.y - bottom(nome), `${id}: folga entre o nome e o valor total`).toBeLessThanOrEqual(4);
          verificarRespiro(await respiroTexto(header, nomeLoc, toggle.locator("span.font-mono").first(), totalLoc), `${tab} ${id}`);
          expect(await css(totalLoc, "text-overflow"), `${id}: valor total com reticências`).not.toBe("ellipsis");
          expect(await totalLoc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${id}: valor total cortado`).toBe(true);
          expect(await linhasDeTexto(totalLoc), `${id}: valor total deve caber em uma linha`).toBe(1);
          await expect(card).toContainText("Valor total: R$ ");

          // Coluna de ações: Pago na metade de cima, câmera na de baixo, divisória à esquerda.
          const col = await verificarColunaCabecalho(
            header,
            page.locator(`#btn-exportar-grupo-${id}`),
            page.locator(`#btn-pagar-grupo-${id}`),
            `${tab} ${id}`,
          );
          alturas[id] = col.h.height;
          for (const [nomeItem, r] of [["nome", nome], ["selo", selo], ["valor total", total]] as const) {
            expect(right(r), `${id}: ${nomeItem} sob a coluna de ações`).toBeLessThanOrEqual(col.coluna.x + 0.5);
          }
          const itens: Array<[string, Rect]> = [["nome", nome], ["selo", selo], ["valor total", total], ["câmera", col.camera], ["Pago", col.pago!]];
          semSobreposicao(itens);
          for (const [nomeItem, r] of itens) {
            expect(r.x, `${id}: ${nomeItem} fora do card`).toBeGreaterThanOrEqual(c.x - 0.5);
            expect(right(r), `${id}: ${nomeItem} fora do card`).toBeLessThanOrEqual(right(c) + 0.5);
          }
        }
        // Altura mínima fixa (68px) e igual com e sem PIX; o grupo adversarial (nome longo) só cresce quebrando o nome.
        expect(Math.abs(alturas[grupoId]! - 68), `${grupoId}: altura do cabeçalho`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(alturas[grupoId]! - alturas[semPixId]!), "cabeçalho com x sem chave PIX").toBeLessThanOrEqual(1);
        expect(alturas[bigId]!, `${bigId}: só cresce quebrando o nome`).toBeGreaterThanOrEqual(alturas[grupoId]! - 1);
        medida(`grupo do ${tab}: cabeçalho ${alturas[grupoId]}px (com PIX) x ${alturas[semPixId]}px (sem PIX) x ${alturas[bigId]}px (nome longo + total de 9 dígitos)`);
      });
    }

    test("cards de item (Banco em aberto e pagos, Despachante e Transporte): coluna de ações com divisória, lápis acima da lixeira, 44px, nada truncado", async ({ page }) => {
      interface Alvo {
        nome: string;
        tab: TabKey;
        card: Locator;
        editar: Locator;
        excluir: Locator;
        duasLinhas?: boolean; // item em aberto do Despachante/Transporte: 2 linhas alinhadas às células de ação
      }
      const linhaPaga = (tab: "despachante" | "transportadora"): Locator =>
        page.locator(`#grupo-realizados-lista-${tab.toUpperCase()} > div`, { hasText: NOME_LONGO }).first();
      const itemAberto = (grupoId: string, index: number): Locator =>
        page.locator(`#mobile-btn-status-item-${grupoId}-${index}`).locator("xpath=ancestor::div[contains(@class,'@container')][1]");
      const alvos: Alvo[] = [
        ...["a1", "b1", "c1"].map((id): Alvo => ({
          nome: `banco em aberto ${id}`,
          tab: "banco",
          card: page.locator(`#lancamento-banco-${id}`),
          editar: page.locator(`#mobile-btn-editar-lancamento-${id}`),
          excluir: page.locator(`#mobile-btn-excluir-lancamento-${id}`),
        })),
        ...["r1a", "r2a"].map((id): Alvo => ({
          nome: `banco pago ${id}`,
          tab: "banco",
          card: page.locator(`#lancamento-banco-${id}`),
          editar: page.locator(`#mobile-btn-editar-realizado-${id}`),
          excluir: page.locator(`#mobile-btn-excluir-lancamento-${id}`),
        })),
        ...(["despachante", "transportadora"] as const).flatMap((tab): Alvo[] => {
          const grupoId = tab === "despachante" ? "gd-1" : "gt-1";
          return [
            ...[0, 1].map((i): Alvo => ({
              nome: `${tab} em aberto #${i}`,
              tab,
              duasLinhas: true,
              card: itemAberto(grupoId, i),
              editar: page.locator(`#mobile-btn-editar-item-${grupoId}-${i}`),
              excluir: page.locator(`#mobile-btn-excluir-item-${grupoId}-${i}`),
            })),
            {
              nome: `${tab} pago`,
              tab,
              card: linhaPaga(tab),
              editar: linhaPaga(tab).locator("[id^='mobile-btn-editar-realizado-']"),
              excluir: linhaPaga(tab).locator("[id^='mobile-btn-excluir-item-realizado-']"),
            },
          ];
        }),
      ];

      for (const alvo of alvos) {
        await abrirAba(page, alvo.tab);
        await alvo.card.scrollIntoViewIfNeeded();
        const c = await rect(alvo.card, `${alvo.nome}: card`);
        // Só o bloco de abaixo de lg está visível; o de lg+ (container query) fica display:none.
        const bloco = alvo.card.locator("> div:visible");
        await expect(bloco, `${alvo.nome}: um único bloco visível`).toHaveCount(1);
        const conteudo = bloco.locator("> div").first();

        // Divisória vertical à esquerda da coluna, que não se sobrepõe ao conteúdo.
        if (alvo.duasLinhas) {
          await verificarItemDuasLinhas(alvo.card, alvo.editar, alvo.excluir, alvo.nome);
        } else {
          const coluna = await verificarColunaDeAcoes(alvo.card, alvo.editar, alvo.excluir, alvo.nome);
          await verificarConteudo(conteudo, coluna, c, alvo.nome);
          medida(`${alvo.nome}: card ${c.height}px (3 linhas), toque ${Math.round((await rect(alvo.editar, "lápis")).width)}x${arred((await rect(alvo.editar, "lápis")).height)}`);
        }

        // Ids de lg+ continuam existindo, mas ocultos (sem duplicar ids: os daqui têm o prefixo mobile-).
        const idMobile = (await alvo.editar.getAttribute("id")) ?? "";
        expect(idMobile.startsWith("mobile-")).toBe(true);
        await expect(page.locator(`#${idMobile.replace("mobile-", "")}`), `${alvo.nome}: botão de lg+ oculto`).toBeHidden();

        // Subtítulo cinza (só nos cards que têm: banco e pagos).
        const sub = conteudo.locator("> span").nth(1);
        if (await sub.count()) {
          expect(await css(sub, "color")).toBe(INK_SOFT_RGB);
          const n = await rect(conteudo.locator("> span").first(), `${alvo.nome}: nome`);
          expect((await rect(sub, `${alvo.nome}: subtítulo`)).y).toBeGreaterThanOrEqual(bottom(n) - 1);
        }
      }

      // Selo "Pago" presente nas linhas pagas do Despachante e do Transporte.
      await abrirAba(page, "despachante");
      await expect(linhaPaga("despachante")).toContainText("Pago");
    });

    test("itens do lote em aberto (Despachante/Transporte): nome na linha do lápis e valor + status na linha da lixeira, card de ~69px", async ({ page }) => {
      for (const [tab, grupoIds] of [["despachante", ["gd-1", "gd-big"]], ["transportadora", ["gt-1", "gt-big"]]] as const) {
        await abrirAba(page, tab);
        for (const grupoId of grupoIds) {
          for (const i of [0, 1]) {
            const statusBtn = page.locator(`#mobile-btn-status-item-${grupoId}-${i}`);
            await statusBtn.scrollIntoViewIfNeeded();
            const card = statusBtn.locator("xpath=ancestor::div[contains(@class,'@container')][1]");
            await verificarItemDuasLinhas(
              card,
              page.locator(`#mobile-btn-editar-item-${grupoId}-${i}`),
              page.locator(`#mobile-btn-excluir-item-${grupoId}-${i}`),
              `${tab} ${grupoId} #${i}`,
            );
            await expect(statusBtn).toBeEnabled();
          }
        }
      }
    });

    test("divisória vertical no MESMO x no cabeçalho e nos itens (largura de coluna 48px +-1) em Banco, Despachante e Transporte", async ({ page }) => {
      interface Coluna {
        x: number;
        width: number;
      }
      const coluna = async (loc: Locator, what: string): Promise<Coluna> => {
        const k = await rect(loc.locator("xpath=.."), what);
        return { x: k.x, width: k.width };
      };
      const conferir = (cabecalho: Coluna, outras: Array<[string, Coluna]>, what: string): void => {
        expect(Math.abs(cabecalho.width - 48), `${what}: largura da coluna do cabeçalho`).toBeLessThanOrEqual(1);
        for (const [nome, k] of outras) {
          expect(Math.abs(k.x - cabecalho.x), `${what}: divisória de ${nome} x ${cabecalho.x} (cabeçalho) vs ${k.x}`).toBeLessThanOrEqual(1);
          expect(Math.abs(k.width - 48), `${what}: largura da coluna de ${nome}`).toBeLessThanOrEqual(1);
        }
        medida(`${what}: divisória em x=${arred(cabecalho.x)} (cabeçalho ${arred(cabecalho.width)}px), ${outras.map(([n, k]) => `${n} x=${arred(k.x)} ${arred(k.width)}px`).join("; ")}`);
      };

      await abrirAba(page, "banco");
      for (const [id, itens] of [["lote-a", ["a1"]], ["lote-b", ["b1"]], ["lote-c", ["c1"]]] as const) {
        const cab = await coluna(page.locator(`#btn-exportar-lote-${id}`), `${id}: cabeçalho`);
        const outras: Array<[string, Coluna]> = [];
        for (const l of itens) outras.push([`lançamento ${l}`, await coluna(page.locator(`#mobile-btn-editar-lancamento-${l}`), `${id}: ${l}`)]);
        conferir(cab, outras, `Banco ${id}`);
      }
      // Realizados (3 linhas) ficam no mesmo x do cabeçalho do lote em aberto.
      const cabBanco = await coluna(page.locator("#btn-exportar-lote-lote-a"), "lote-a: cabeçalho");
      conferir(cabBanco, [["pago r1a", await coluna(page.locator("#mobile-btn-editar-realizado-r1a"), "r1a")], ["pago r2a", await coluna(page.locator("#mobile-btn-editar-realizado-r2a"), "r2a")]], "Banco realizados");

      for (const [tab, grupos] of [["despachante", ["gd-1", "gd-big", "gd-np"]], ["transportadora", ["gt-1", "gt-big", "gt-np"]]] as const) {
        await abrirAba(page, tab);
        for (const g of grupos) {
          const cab = await coluna(page.locator(`#btn-exportar-grupo-${g}`), `${g}: cabeçalho`);
          const itensLoc = page.locator(`[id^='mobile-btn-editar-item-${g}-']`);
          const outras: Array<[string, Coluna]> = [];
          for (let i = 0; i < (await itensLoc.count()); i++) outras.push([`item #${i}`, await coluna(itensLoc.nth(i), `${g}: item ${i}`)]);
          conferir(cab, outras, `${tab} ${g}`);
        }
        const cab = await coluna(page.locator(`#btn-exportar-grupo-${grupos[0]}`), "cabeçalho");
        const pagos = page.locator("[id^='mobile-btn-editar-realizado-']");
        const outras: Array<[string, Coluna]> = [];
        for (let i = 0; i < (await pagos.count()); i++) outras.push([`pago #${i}`, await coluna(pagos.nth(i), `pago ${i}`)]);
        conferir(cab, outras, `${tab} realizados`);
      }
    });

    test("teclado: lápis antes da lixeira nos itens; nos cabeçalhos a ordem real é câmera -> Pago; foco visível", async ({ page }) => {
      const idAtivo = (): Promise<string | undefined> => page.evaluate(() => document.activeElement?.id);
      const outline = (loc: Locator): Promise<string> => css(loc, "outline-style");

      await abrirAba(page, "despachante");
      const editar = page.locator("#mobile-btn-editar-item-gd-1-0");
      await editar.scrollIntoViewIfNeeded();
      await page.locator("#mobile-btn-status-item-gd-1-0").focus();
      await page.keyboard.press("Tab");
      expect(await idAtivo(), "Tab do status vai para o lápis").toBe("mobile-btn-editar-item-gd-1-0");
      expect(await outline(editar), "foco visível no lápis").not.toBe("none");
      await page.keyboard.press("Tab");
      expect(await idAtivo(), "lápis antes da lixeira").toBe("mobile-btn-excluir-item-gd-1-0");
      expect(await outline(page.locator("#mobile-btn-excluir-item-gd-1-0")), "foco visível na lixeira").not.toBe("none");

      // Cabeçalho do grupo: o botão que expande, depois a câmera e por último o Pago (ordem do DOM; o Pago aparece
      // ACIMA da câmera abaixo de lg, mas segue depois dela no teclado, como em lg+).
      const toggle = page.locator("#grupo-pagamento-gd-1 > div").first().locator("> button").first();
      await toggle.scrollIntoViewIfNeeded();
      await toggle.focus();
      await page.keyboard.press("Tab");
      expect(await idAtivo()).toBe("btn-exportar-grupo-gd-1");
      expect(await outline(page.locator("#btn-exportar-grupo-gd-1")), "foco visível na câmera").not.toBe("none");
      await page.keyboard.press("Tab");
      expect(await idAtivo()).toBe("btn-pagar-grupo-gd-1");
      expect(await outline(page.locator("#btn-pagar-grupo-gd-1")), "foco visível no Pago").not.toBe("none");

      await abrirAba(page, "banco");
      await page.locator("#btn-exportar-lote-lote-a").scrollIntoViewIfNeeded();
      await page.locator("#btn-exportar-lote-lote-a").focus();
      await page.keyboard.press("Tab");
      expect(await idAtivo(), "no lote: câmera e depois Pago").toBe("btn-pagar-lote-lote-a");
      expect(await outline(page.locator("#btn-pagar-lote-lote-a")), "foco visível no Pago do lote").not.toBe("none");
      await page.keyboard.press("Tab");
      expect(await idAtivo(), "depois do Pago vem o primeiro lápis do lote").toBe("mobile-btn-editar-lancamento-a1");
    });

    test("filtros de 'Pagamentos realizados' (Banco): ícone dentro da busca, painel, contagem, Limpar, Aplicar, Esc", async ({ page }) => {
      const busca = page.locator("#banco-realizado-busca");
      await busca.scrollIntoViewIfNeeded();
      const b = await rect(busca, "busca");
      await expect(busca).toHaveAttribute("placeholder", "Buscar por cliente...");

      // Selects em linha somem; sobra só a busca, em coluna, com o ícone dentro dela à direita (44x44).
      for (const id of ["#filtro-banco-realizado", "#filtro-fornecedor-realizado", "#ordem-banco-realizado"]) {
        await expect(page.locator(id), `${id} deve sair da tela`).toBeHidden();
      }
      expect(await css(busca.locator("xpath=../.."), "flex-direction")).toBe("column");
      const icone = page.locator("#btn-filtros-banco-realizado");
      const i = await rect(icone, "ícone de filtros");
      expect(Math.round(i.width)).toBe(44);
      expect(Math.round(i.height)).toBe(44);
      expect(i.x).toBeGreaterThanOrEqual(b.x);
      expect(right(i)).toBeLessThanOrEqual(right(b) + 0.5);
      expect(right(i)).toBeGreaterThanOrEqual(right(b) - 2);
      expect(i.y).toBeGreaterThanOrEqual(b.y - 0.5);
      expect(bottom(i)).toBeLessThanOrEqual(bottom(b) + 0.5);
      expect(await css(icone, "border-top-width"), "ícone sem borda").toBe("0px");
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveCount(0);

      const linhas = page.locator("#banco-realizados-lista > div");
      await expect(linhas).toHaveCount(3);

      await icone.click();
      const sheet = page.locator("#banco-filtros-sheet");
      await expect(sheet).toBeVisible();
      expect(await bodyOverflow(page), "scroll do body travado").toBe("hidden");
      await expect(sheet.getByRole("combobox")).toHaveCount(3);

      // Filtragem imediata (sem "Aplicar"); bolinha conta filtros, não a ordenação.
      await selectOption(page, "sheet-filtro-banco-realizado", "Intex");
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveText("1");
      expect(await css(page.locator("#badge-filtros-banco-realizado"), "background-color")).toBe(FARM_BLUE_RGB);
      await expect(linhas).toHaveCount(1);
      await selectOption(page, "sheet-filtro-fornecedor-realizado", "Beldimed - Bélgica");
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveText("2");
      await selectOption(page, "sheet-ordem-banco-realizado", "Mais antigos primeiro");
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveText("2");

      // "Aplicar" só fecha, sem alterar nada.
      await page.locator("#banco-filtros-sheet-aplicar").click();
      await expect(sheet).toHaveCount(0);
      expect(await bodyOverflow(page)).not.toBe("hidden");
      await expect(linhas).toHaveCount(1);
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveText("2");

      // Reabrir mantém os valores (mesmos v-model); Esc fecha.
      await icone.click();
      await expect(sheet).toBeVisible();
      await expect(page.locator("#sheet-filtro-banco-realizado")).toContainText("Intex");
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);

      // "Limpar" restaura filtros E ordenação padrão.
      await icone.click();
      await page.locator("#banco-filtros-sheet-limpar").click();
      await expect(page.locator("#badge-filtros-banco-realizado")).toHaveCount(0);
      await expect(linhas).toHaveCount(3);
      await expect(page.locator("#sheet-filtro-banco-realizado")).toContainText("Todos os bancos");
      await expect(page.locator("#sheet-filtro-fornecedor-realizado")).toContainText("Todos os fornecedores");
      await expect(page.locator("#sheet-ordem-banco-realizado")).toContainText("Mais recentes primeiro");

      // Toque fora (no overlay) também fecha.
      await page.mouse.click(viewport.width / 2, 8);
      await expect(sheet).toHaveCount(0);
      expect(await bodyOverflow(page)).not.toBe("hidden");

      // Dropdown dentro do painel abre para cima e cabe na viewport.
      await icone.click();
      await page.locator("#sheet-filtro-fornecedor-realizado").click();
      const lista = await rect(page.locator("#sheet-filtro-fornecedor-realizado-listbox"), "listbox");
      expect(lista.x).toBeGreaterThanOrEqual(0);
      expect(right(lista)).toBeLessThanOrEqual(viewport.width + 1);
      expect(lista.y).toBeGreaterThanOrEqual(0);
      await page.keyboard.press("Escape");
    });

    for (const tab of ["despachante", "transportadora"] as const) {
      test(`filtros de 'Pagamentos realizados' (${tab}): ícone na busca, painel, contagem e Limpar`, async ({ page }) => {
        const T = tab.toUpperCase();
        await abrirAba(page, tab);
        const busca = page.locator(`#busca-grupo-realizado-${T}`);
        await busca.scrollIntoViewIfNeeded();
        await expect(busca).toHaveAttribute("placeholder", "Buscar por paciente...");
        for (const id of [`#filtro-grupo-realizado-${T}`, `#filtro-status-realizado-${T}`, `#ordem-grupo-realizado-${T}`]) {
          await expect(page.locator(id), `${id} deve sair da tela`).toBeHidden();
        }
        const icone = page.locator(`#btn-filtros-grupo-realizado-${T}`);
        const i = await rect(icone, "ícone");
        expect(Math.round(i.width)).toBe(44);
        expect(Math.round(i.height)).toBe(44);
        const b = await rect(busca, "busca");
        expect(right(i)).toBeLessThanOrEqual(right(b) + 0.5);

        const linhas = page.locator(`#grupo-realizados-lista-${T} > div`);
        const total = await linhas.count();
        expect(total).toBeGreaterThanOrEqual(3);

        await icone.click();
        const sheet = page.locator(`#grupo-filtros-sheet-${T}`);
        await expect(sheet).toBeVisible();
        expect(await bodyOverflow(page)).toBe("hidden");
        await expect(sheet.getByRole("combobox")).toHaveCount(3);

        await selectOption(page, `sheet-filtro-status-realizado-${T}`, "Pago / Complemento");
        const badge = page.locator(`#badge-filtros-grupo-realizado-${T}`);
        await expect(badge).toHaveText("1");
        await expect(linhas).toHaveCount(1);
        await selectOption(page, `sheet-ordem-grupo-realizado-${T}`, "Mais antigos primeiro");
        await expect(badge).toHaveText("1");
        await page.locator(`#grupo-filtros-sheet-${T}-aplicar`).click();
        await expect(sheet).toHaveCount(0);
        await expect(linhas).toHaveCount(1);

        await icone.click();
        await page.locator(`#grupo-filtros-sheet-${T}-limpar`).click();
        await expect(badge).toHaveCount(0);
        await expect(linhas).toHaveCount(total);
        await expect(page.locator(`#sheet-ordem-grupo-realizado-${T}`)).toContainText("Mais recentes primeiro");
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
      });
    }

    test("sem overflow horizontal em nenhuma aba (nem com o painel de filtros aberto)", async ({ page }) => {
      for (const tab of ["banco", "cotacao", "despachante", "transportadora"] as const) {
        await abrirAba(page, tab);
        expect(await hasHorizontalOverflow(page), `overflow em ${tab}`).toBe(false);
      }
      await abrirAba(page, "banco");
      await page.locator("#btn-filtros-banco-realizado").scrollIntoViewIfNeeded();
      await page.locator("#btn-filtros-banco-realizado").click();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test("modal 'Novo pagamento': segmented de moeda (padrão USD, 44px, 16px, largura total, setas/Home/End), campos e botões >= 44px, sem overflow", async ({ page }) => {
      await page.locator("#fab-pagamentos").click();
      const modal = page.locator("#novo-lancamento-banco-overlay");
      await expect(modal.getByRole("heading", { name: "Novo pagamento" })).toBeVisible();
      await expect(modal).not.toContainText("Novo lote");
      await expect(modal).not.toContainText("abre um lote novo");

      const grupo = page.getByRole("radiogroup", { name: "Moeda" });
      const usd = page.locator("#nl-moeda-USD");
      const eur = page.locator("#nl-moeda-EUR");
      await expect(grupo.getByRole("radio")).toHaveCount(2);
      await expect(usd).toHaveText("Dólar · USD");
      await expect(eur).toHaveText("Euro · EUR");
      await expect(usd).toHaveAttribute("aria-checked", "true"); // padrão
      await expect(modal).toContainText("Valor (USD)");

      // Largura total do campo, 44px de altura, 16px de fonte (sem zoom no iOS), fundo azul-marinho no marcado.
      const form = await rect(page.locator("#form-novo-lancamento-banco"), "form");
      const g = await rect(grupo, "radiogroup");
      expect(Math.abs(g.width - form.width), "segmented em largura total").toBeLessThanOrEqual(1);
      for (const r of [usd, eur]) {
        const b = await rect(r, "radio");
        expect(b.height, "radio >= 44px").toBeGreaterThanOrEqual(43.99);
        expect(await css(r, "font-size")).toBe("16px");
      }
      expect(await css(usd, "background-color")).toBe(ACCENT_DARK_RGB);

      // Teclado: só o marcado entra no Tab; setas/Home/End movem e marcam.
      await usd.focus();
      await page.keyboard.press("ArrowRight");
      await expect(eur).toHaveAttribute("aria-checked", "true");
      await expect(eur).toBeFocused();
      await expect(modal).toContainText("Valor (EUR)");
      await page.keyboard.press("ArrowLeft");
      await expect(usd).toBeFocused();
      await page.keyboard.press("End");
      await expect(eur).toBeFocused();
      await page.keyboard.press("Home");
      await expect(usd).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(eur).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("ArrowUp");
      await expect(usd).toHaveAttribute("aria-checked", "true");
      await expect(usd).toHaveAttribute("tabindex", "0");
      await expect(eur).toHaveAttribute("tabindex", "-1");
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.id), "Tab sai do grupo").not.toMatch(/^nl-moeda-/);

      // Foco visível (outline) no radio ao navegar por teclado.
      await usd.focus();
      await page.keyboard.press("ArrowRight");
      expect(await css(eur, "outline-style")).not.toBe("none");

      // Campos a 16px e >= 44px; botões >= 44px.
      for (const id of ["#nl-cliente", "#nl-invoice", "#nl-valor-moeda"]) {
        expect((await rect(page.locator(id), id)).height, `${id} altura`).toBeGreaterThanOrEqual(43.99);
        expect(await css(page.locator(id), "font-size"), `${id} fonte`).toBe("16px");
      }
      const forn = page.locator("#nl-fornecedor");
      expect((await rect(forn, "fornecedor")).height).toBeGreaterThanOrEqual(43.99);
      expect(await css(forn, "font-size")).toBe("16px");
      for (const id of ["#btn-cancel-novo-lancamento", "#btn-save-novo-lancamento"]) {
        expect((await rect(page.locator(id), id)).height, `${id} altura`).toBeGreaterThanOrEqual(43.99);
      }

      // Avisos (fixtures: 2 lotes USD abertos, o mais recente cotado; 1 lote EUR cotado).
      await usd.click();
      const avisos = page.locator("#nl-avisos-destino");
      await expect(avisos).toContainText("Há 2 lotes em USD em aberto. Este entra no mais recente (20 de outubro de 2026).");
      await expect(avisos).toContainText("Este lote já foi cotado. Adicionar o pagamento reabre a cotação.");
      await expect(avisos).not.toContainText(/Lote \d/);
      await eur.click();
      await expect(avisos).not.toContainText("Há 2 lotes");
      await expect(avisos).toContainText("Este lote já foi cotado");

      // Cabe na tela, sem overflow horizontal, com avisos visíveis.
      const card = await rect(modal.locator("> div").first(), "card do modal");
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(right(card)).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(bottom(card)).toBeLessThanOrEqual(viewport.height + 0.5);
      expect(await hasHorizontalOverflow(page), "overflow com o modal aberto").toBe(false);

      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    });

    test("modal em edição: moeda marcada e desabilitada, sem aviso de cotação, texto de reabertura mantido", async ({ page }) => {
      // b1 é o lançamento EUR do lote-b (cotado): é o caso em que um aviso apareceria na criação.
      await page.locator("#mobile-btn-editar-lancamento-b1").scrollIntoViewIfNeeded();
      await page.locator("#mobile-btn-editar-lancamento-b1").click();
      const modal = page.locator("#novo-lancamento-banco-overlay");
      await expect(modal.getByRole("heading", { name: "Editar lançamento — Banco" })).toBeVisible();
      await expect(modal).toContainText("alterar o valor reabre a cotação do lote.");
      await expect(page.getByRole("radiogroup", { name: "Moeda" })).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator("#nl-moeda-EUR")).toHaveAttribute("aria-checked", "true");
      await expect(page.locator("#nl-moeda-EUR")).toBeDisabled();
      await expect(page.locator("#nl-moeda-USD")).toBeDisabled();
      await expect(page.locator("#nl-avisos-destino")).toBeHidden();
      expect((await rect(page.locator("#nl-moeda-EUR"), "radio")).height).toBeGreaterThanOrEqual(43.99);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test("'+ Lançamento' não existe nos lotes em aberto", async ({ page }) => {
      await expect(page.locator('[id^="btn-novo-lancamento-lote-"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /\+ Lançamento/ })).toHaveCount(0);
    });
  });
}

test.describe("/pagamentos mobile — '+' com o mesmo canto/offset de /processos", () => {
  test.describe.configure({ retries: 2 });

  test("tamanho, posição, cor e z-index idênticos ao '+' de Novo processo", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    await gotoPagamentos(page, { width: 390, height: 844 });
    const fabPag = await rect(page.locator("#fab-pagamentos"), "fab de pagamentos");
    const estiloPag = await page.locator("#fab-pagamentos").evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.right, s.bottom, s.width, s.height, s.backgroundColor, s.borderRadius, s.zIndex].join("|");
    });

    await page.goto("/processos", { waitUntil: "networkidle" });
    const fabProc = page.locator("#fab-novo-processo");
    await expect(fabProc).toBeVisible();
    const fp = await rect(fabProc, "fab de processos");
    const estiloProc = await fabProc.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.right, s.bottom, s.width, s.height, s.backgroundColor, s.borderRadius, s.zIndex].join("|");
    });
    expect({ x: fabPag.x, y: fabPag.y, w: fabPag.width, h: fabPag.height }).toEqual({ x: fp.x, y: fp.y, w: fp.width, h: fp.height });
    expect(estiloPag).toBe(estiloProc);
  });
});

// Somente leitura: nenhum cargo que lê Pagamentos deixa de escrever, então a UI nunca chega nesse ramo. O
// teste só roda numa CÓPIA do app com `readonly` forçado em app/pages/pagamentos.vue (harness local, nunca
// no repo): PAGAMENTOS_FORCE_READONLY=1. Sem editar/excluir não há coluna de ações nem divisória, e o
// conteúdo do card ocupa a largura toda; o "Pago" também some (mesma condição de sempre).
for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`/pagamentos abaixo de lg, somente leitura (harness) — ${viewport.name}`, () => {
    test.describe.configure({ retries: 2 });

    test.beforeEach(async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      test.skip(process.env.PAGAMENTOS_FORCE_READONLY !== "1", "só numa cópia do harness com `readonly` forçado");
      await gotoPagamentos(page, viewport);
    });

    test("sem coluna de ações nem divisória; conteúdo na largura toda; sem Pago; câmera mantida", async ({ page }) => {
      expect(await page.locator("[id^='mobile-btn-editar-'], [id^='mobile-btn-excluir-']").count(), "botões de ação renderizados").toBe(0);

      const cards: Array<[TabKey, Locator]> = [
        ["banco", page.locator("#lancamento-banco-a1")],
        ["banco", page.locator("#lancamento-banco-r1a")],
        ["despachante", page.locator("#grupo-realizados-lista-DESPACHANTE > div").first()],
        ["transportadora", page.locator("#grupo-realizados-lista-TRANSPORTADORA > div").first()],
      ];
      for (const [tab, card] of cards) {
        await abrirAba(page, tab);
        await card.scrollIntoViewIfNeeded();
        const c = await rect(card, `${tab}: card`);
        const bloco = card.locator("> div:visible");
        await expect(bloco).toHaveCount(1);
        // Nenhum elemento com divisória vertical (border-left) dentro do bloco.
        const divisorias = await bloco.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).borderLeftWidth !== "0px").length);
        expect(divisorias, `${tab}: divisória sem ações`).toBe(0);
        await verificarConteudo(bloco.locator("> div").first(), null, c, `${tab} (somente leitura)`);
      }

      // Itens do lote em aberto do Despachante: sem coluna nem divisória, status desabilitado e as 2 linhas de
      // conteúdo na largura toda do card.
      await abrirAba(page, "despachante");
      const item = page.locator("#mobile-btn-status-item-gd-1-0").locator("xpath=ancestor::div[contains(@class,'@container')][1]");
      await item.scrollIntoViewIfNeeded();
      await expect(page.locator("#mobile-btn-status-item-gd-1-0")).toBeDisabled();
      const i = await rect(item, "item");
      const blocoItem = item.locator("> div:visible");
      await expect(blocoItem.locator("> div")).toHaveCount(2);
      for (const n of [0, 1]) {
        const celula = await rect(blocoItem.locator("> div").nth(n), `despachante em aberto (somente leitura): linha ${n + 1}`);
        expect(Math.abs(right(i) - right(celula)), `linha ${n + 1} deve ocupar a largura toda`).toBeLessThanOrEqual(1);
      }
      const divisoriasItem = await blocoItem.evaluate((el) => [...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).borderLeftWidth !== "0px").length);
      expect(divisoriasItem, "despachante em aberto: divisória sem ações").toBe(0);

      // Cabeçalhos: sem "Pago"; a câmera ocupa a coluna inteira, centralizada, e a altura segue a mesma (68px / 69px).
      await expect(page.locator("[id^='btn-pagar-lote-'], [id^='btn-pagar-grupo-']")).toHaveCount(0);
      const grupoCab = await verificarColunaCabecalho(
        page.locator("#grupo-pagamento-gd-1 > div").first(),
        page.locator("#btn-exportar-grupo-gd-1"),
        null,
        "grupo gd-1 (somente leitura)",
      );
      expect(Math.abs(grupoCab.h.height - 68), "cabeçalho do grupo sem Pago: mesma altura de com Pago").toBeLessThanOrEqual(0.5);
      await abrirAba(page, "banco");
      const loteCab = await verificarColunaCabecalho(
        page.locator("#lote-banco-lote-a > div").first(),
        page.locator("#btn-exportar-lote-lote-a"),
        null,
        "lote-a (somente leitura)",
      );
      expect(Math.abs(loteCab.h.height - 69), "cabeçalho do lote sem Pago: mesma altura de com Pago").toBeLessThanOrEqual(0.5);
    });
  });
}

for (const viewport of [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
]) {
  test.describe(`/pagamentos desktop (${viewport.name}) — como sempre, sem '+' nem ícone de filtros`, () => {
    test.describe.configure({ retries: 2 });

    test.beforeEach(async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
      await gotoPagamentos(page, viewport);
    });

    test("abas à esquerda com o rótulo 'Câmbio' e botões de texto nas seções", async ({ page }) => {
      expect((await page.locator("#tab-cotacao").innerText()).trim()).toBe("Câmbio");
      const bar = page.locator("#tab-banco").locator("xpath=..");
      expect(await css(bar, "justify-content")).toBe("flex-start");
      const tabBox = await rect(page.locator("#tab-banco"), "aba Banco");
      // Altura de sempre: py-2 + linha de 13.5px + borda de 2px (~38px), não os 44px do toque.
      expect(tabBox.height).toBeLessThan(40);
      // Sem a margem negativa de abaixo de lg.
      expect(await css(bar, "margin-top")).toBe("0px");

      await expect(page.locator("#fab-pagamentos")).toBeHidden();
      await expect(page.getByRole("button", { name: "+ Novo pagamento" })).toBeVisible();
      expect(await css(page.getByRole("button", { name: "+ Novo pagamento" }), "display")).toBe("block");

      // O "+ Lançamento" de cada lote saiu; a câmera segue com a divisória à esquerda, como sempre foi.
      await expect(page.locator("#btn-novo-lancamento-lote-lote-a")).toHaveCount(0);
      const camera = page.locator("#btn-exportar-lote-lote-a");
      expect(await css(camera, "border-left-width")).toBe("1px");
      expect(await css(camera, "border-top-left-radius")).toBe("0px");
      // Cabeçalho do lote numa linha só.
      const header = page.locator("#lote-banco-lote-a > div").first();
      expect(await css(header, "flex-wrap")).toBe("nowrap");

      for (const tab of ["despachante", "transportadora"] as const) {
        await abrirAba(page, tab);
        await expect(page.getByRole("button", { name: "+ Adicionar pagamento" })).toBeVisible();
        await expect(page.locator("#fab-pagamentos")).toBeHidden();
      }
      await abrirAba(page, "cotacao");
      await expect(page.locator("#fab-pagamentos")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "+ Novo pagamento" })).toHaveCount(0);
    });

    test("filtros de 'Pagamentos realizados' em linha, sem ícone nem painel", async ({ page }) => {
      for (const [tab, buscaId, selects] of [
        ["banco", "#banco-realizado-busca", ["#filtro-banco-realizado", "#filtro-fornecedor-realizado", "#ordem-banco-realizado"]],
        ["despachante", "#busca-grupo-realizado-DESPACHANTE", ["#filtro-grupo-realizado-DESPACHANTE", "#filtro-status-realizado-DESPACHANTE", "#ordem-grupo-realizado-DESPACHANTE"]],
        ["transportadora", "#busca-grupo-realizado-TRANSPORTADORA", ["#filtro-grupo-realizado-TRANSPORTADORA", "#filtro-status-realizado-TRANSPORTADORA", "#ordem-grupo-realizado-TRANSPORTADORA"]],
      ] as const) {
        await abrirAba(page, tab);
        const busca = page.locator(buscaId);
        await busca.scrollIntoViewIfNeeded();
        expect(await css(busca.locator("xpath=../.."), "flex-direction")).toBe("row");
        const b = await rect(busca, `${tab}: busca`);
        let ultimoX = right(b);
        for (const id of selects) {
          const s = await rect(page.locator(id), id);
          expect(Math.abs(centerY(s) - centerY(b)), `${id} fora da linha`).toBeLessThanOrEqual(4);
          expect(s.x, `${id} deve ficar à direita do anterior`).toBeGreaterThanOrEqual(ultimoX);
          ultimoX = right(s);
        }
        await expect(page.locator("[id^='btn-filtros-']")).toBeHidden();
        await expect(page.locator("[id$='-filtros-sheet-overlay'], [id^='grupo-filtros-sheet-'], #banco-filtros-sheet")).toHaveCount(0);
        // Padding do campo de busca de sempre (sem a folga do ícone).
        expect(await css(busca, "padding-right")).toBe("32px");
        expect(await css(busca, "min-height")).toBe("0px");
      }
    });

    test("modal 'Novo pagamento' (lg+): segmented ~38px como os campos, sem 'Novo lote'; campos como sempre", async ({ page }) => {
      await page.getByRole("button", { name: "+ Novo pagamento" }).click();
      const modal = page.locator("#novo-lancamento-banco-overlay");
      await expect(modal.getByRole("heading", { name: "Novo pagamento" })).toBeVisible();
      await expect(modal).not.toContainText("Novo lote");

      const usd = page.locator("#nl-moeda-USD");
      await expect(usd).toHaveAttribute("aria-checked", "true");
      const seg = await rect(page.getByRole("radiogroup", { name: "Moeda" }), "segmented");
      const forn = await rect(page.locator("#nl-fornecedor"), "fornecedor");
      expect(Math.abs(seg.height - forn.height), "segmented com a altura do select").toBeLessThanOrEqual(1);
      expect(seg.height).toBeGreaterThan(36);
      expect(seg.height).toBeLessThan(41);
      expect(await css(usd, "font-size")).toBe("13.5px");

      // Campos e botões voltam ao tamanho de sempre em lg+.
      for (const id of ["#nl-cliente", "#nl-invoice", "#nl-valor-moeda"]) {
        expect(await css(page.locator(id), "font-size"), `${id} fonte`).toBe("13.5px");
        expect((await rect(page.locator(id), id)).height, `${id} altura de sempre (sem os 44px do toque)`).toBeLessThan(40);
      }
      expect((await rect(page.locator("#btn-save-novo-lancamento"), "Adicionar")).height).toBeLessThan(40);
      await page.keyboard.press("Escape");
    });

    test("'+ Lançamento' não existe nos lotes em aberto", async ({ page }) => {
      await expect(page.locator('[id^="btn-novo-lancamento-lote-"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /\+ Lançamento/ })).toHaveCount(0);
    });

    test("cabeçalho do lote do Despachante: uma linha com PIX centralizado (como sempre)", async ({ page }) => {
      await abrirAba(page, "despachante");
      const card = page.locator("#grupo-pagamento-gd-1");
      const header = card.locator("> div").first();
      expect(await css(header, "display")).toBe("flex");
      const pix = card.locator("span", { hasText: "PIX:" }).first();
      expect(await css(pix, "position")).toBe("absolute");
      await expect(pix, "PIX visível em lg+").toBeVisible();
      await expect(pix).toContainText("andreza.faconi");
      // A coluna de ações (câmera + Pago) não gera caixa em lg+: os botões são itens do flex do cabeçalho.
      expect(await css(page.locator("#btn-exportar-grupo-gd-1").locator("xpath=.."), "display")).toBe("contents");
      const nome = await rect(card.locator("span.font-display").first(), "nome");
      const total = await rect(card.locator("span.font-display").last(), "total");
      expect(Math.abs(centerY(nome) - centerY(total)), "nome e total na mesma linha").toBeLessThanOrEqual(2);
      const camera = await rect(page.locator("#btn-exportar-grupo-gd-1"), "câmera");
      expect(camera.width, "câmera compacta de sempre").toBeLessThan(44);
      const pago = await rect(page.locator("#btn-pagar-grupo-gd-1"), "Pago");
      expect(pago.x).toBeGreaterThanOrEqual(right(camera) - 0.5);
    });

    test("lote do Banco (lg+): data longa no título, sem data curta, ações na posição de sempre e sem coluna/divisória", async ({ page }) => {
      for (const id of ["lote-a", "lote-c"]) {
        const header = page.locator(`#lote-banco-${id} > div`).first();
        expect(await css(header, "display")).toBe("flex");
        // Título com a data longa; a data curta (DD/MM/AAAA) e o título sem data ficam display:none.
        const titulo = header.locator("span.font-display").filter({ visible: true });
        await expect(titulo).toHaveCount(1);
        await expect(titulo).toHaveText(id === "lote-a" ? "Banco XP · 20 de outubro de 2026" : "Aguardando banco · 20 de outubro de 2026");
        await expect(header.getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeHidden();
        expect(await header.innerText()).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
        // Câmera à esquerda do "Pago", na mesma linha, ambos com divisória (como sempre).
        const camera = await rect(page.locator(`#btn-exportar-lote-${id}`), "câmera");
        if (id === "lote-a") {
          const pago = await rect(page.locator(`#btn-pagar-lote-${id}`), "Pago");
          expect(pago.x).toBeGreaterThanOrEqual(right(camera) - 0.5);
          expect(Math.abs(centerY(pago) - centerY(camera))).toBeLessThanOrEqual(1);
        }
      }

      // Nenhum botão/coluna do layout de abaixo de lg aparece.
      expect(await page.locator("[id^='mobile-btn-']:visible").count()).toBe(0);

      // Ações dos cards na posição de hoje: compactas (28px), lado a lado na linha do nome, sem divisória.
      const editar = await rect(page.locator("#btn-editar-lancamento-a1"), "lápis");
      const excluir = await rect(page.locator("#btn-excluir-lancamento-a1"), "lixeira");
      const card = await rect(page.locator("#lancamento-banco-a1"), "card");
      expect(Math.round(editar.width)).toBe(28);
      expect(Math.round(excluir.height)).toBe(28);
      expect(Math.abs(centerY(editar) - centerY(excluir)), "lápis e lixeira na mesma linha").toBeLessThanOrEqual(1);
      expect(editar.x).toBeLessThan(excluir.x);
      expect(right(excluir)).toBeLessThanOrEqual(right(card) - 8);
      const acoes = page.locator("#btn-editar-lancamento-a1").locator("xpath=..");
      expect(await css(acoes, "border-left-width"), "sem divisória").toBe("0px");
      expect(card.height, "card sem a altura mínima de abaixo de lg").toBeLessThan(80);
    });

    for (const [tab, grupoId] of [["despachante", "gd-1"], ["transportadora", "gt-1"]] as const) {
      test(`${tab} (lg+): itens e pagos com ações compactas na linha, sem coluna/divisória`, async ({ page }) => {
        await abrirAba(page, tab);
        expect(await page.locator("[id^='mobile-btn-']:visible").count()).toBe(0);
        const editar = await rect(page.locator(`#btn-editar-item-${grupoId}-0`), "lápis");
        const excluir = await rect(page.locator(`#btn-excluir-item-${grupoId}-0`), "lixeira");
        expect(Math.round(editar.width)).toBe(28);
        expect(Math.abs(centerY(editar) - centerY(excluir))).toBeLessThanOrEqual(1);
        expect(editar.x).toBeLessThan(excluir.x);
        expect(await css(page.locator(`#btn-editar-item-${grupoId}-0`).locator("xpath=.."), "border-left-width")).toBe("0px");

        const pagoEditar = page.locator("[id^='btn-editar-realizado-']:visible").first();
        const pagoExcluir = page.locator("[id^='btn-excluir-item-realizado-']:visible").first();
        const e = await rect(pagoEditar, "lápis (pago)");
        const x = await rect(pagoExcluir, "lixeira (pago)");
        expect(Math.round(e.width)).toBe(28);
        expect(Math.abs(centerY(e) - centerY(x))).toBeLessThanOrEqual(1);
        expect(await css(pagoEditar.locator("xpath=.."), "border-left-width")).toBe("0px");
      });
    }
  });
}
