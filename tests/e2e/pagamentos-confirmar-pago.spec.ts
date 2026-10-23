import { test, expect, type Locator, type Page } from "@playwright/test";

// "Pago" (fechar lote do Banco; pagar grupo de Despachante/Transporte) pede confirmação antes de chamar o PATCH, em
// TODAS as larguras. Uma única janela (ConfirmDialog `reforcado`) por tela, aberta pelo mesmo botão "Pago" no
// desktop e no mobile.
//
// Os GETs de /api/pagamentos/* são respondidos com dados fictícios e os PATCH de pagamento são interceptados no
// browser (contados e respondidos aqui): o teste não depende dos dados da conta, não grava nada e qualquer outra
// escrita em /api/pagamentos/* é abortada e registrada como "INESPERADA".
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768", width: 1023, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

// ── Dados fictícios ──────────────────────────────────────────────────────────
const NOME_LONGO_GRUPO = "Despachante Aduaneiro Internacional de Cargas Pesadas e Associados Limitada";
const opcoes = (taxaXP: number | null) => [
  { banco: "XP", taxaCorretagem: 0, taxa: taxaXP },
  { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null },
  { banco: "INTEX", taxaCorretagem: 0, taxa: null },
];
const lote = (id: string, extra: Record<string, unknown>) => ({
  id, data: "2026-10-20", empresa: "FARMAURORA", moeda: "USD", numeroLote: 1, opcoes: opcoes(null),
  bancoEscolhido: null, taxaEscolhida: null, realizado: false, pagoEm: null, createdAt: "2026-10-20T10:00:00Z", ...extra,
});
const lanc = (id: string, loteId: string, cliente: string, valorMoeda: number, valorReais: number | null) => ({
  id, loteId, data: "2026-10-20", empresa: "FARMAURORA", fornecedor: "Poros - Turquia", invoice: `INV-${id}`,
  cliente, valorMoeda, moeda: "USD", valorReais, taxa: null, createdAt: "2026-10-20T10:00:00Z",
});
const grupo = (id: string, tipo: string, nomeGrupo: string, itens: unknown[]) => ({
  id, tipo, data: "2026-10-20", empresa: "FARMAURORA", nomeGrupo, chavePix: "pix@exemplo.test", itens, realizado: false, pagoEm: null,
  createdAt: "2026-10-20T10:00:00Z",
});

function dadosIniciais(): Record<string, any> {
  return {
    banco: {
      lotes: [
        lote("lote-a", { bancoEscolhido: "XP", taxaEscolhida: 5.4, opcoes: opcoes(5.4) }),
        lote("lote-c", { numeroLote: 2 }), // aguardando banco: sem "Pago"
      ],
      lancamentos: [
        lanc("a1", "lote-a", "Ana Souza", 122220, 659988),
        lanc("a2", "lote-a", "Bia Lima", 1000, 5400),
        lanc("c1", "lote-c", "Diego Rocha", 1500, null),
      ],
    },
    despachante: [
      grupo("gd-1", "DESPACHANTE", "Andreza Faconi", [
        { paciente: "Gisele Melo", valor: 1850.5, status: "NAO_PAGO" },
        { paciente: "Rita Sales", valor: 320, status: "COMPLEMENTO" },
      ]),
      grupo("gd-longo", "DESPACHANTE", NOME_LONGO_GRUPO, [{ paciente: "Zé", valor: 123456789.01, status: "NAO_PAGO" }]),
    ],
    transportadora: [
      grupo("gt-1", "TRANSPORTADORA", "AJC", [
        { paciente: "Diego Rocha", valor: 600, status: "NAO_PAGO" },
        { paciente: "Hugo Alves", valor: 98765.43, status: "NAO_PAGO" },
        { paciente: "Elisa Prado", valor: 12, status: "NAO_PAGO" },
      ]),
    ],
    "despachante-pix": {},
    "transportadora-pix": {},
  };
}

type Modo = "ok" | "lento" | "erro500" | "abortar";
interface Mock {
  dados: Record<string, any>;
  chamadas: string[]; // "PATCH /api/pagamentos/banco/lote-a", "INESPERADA POST ...", ...
  cfg: { modo: Modo };
}

async function instalarMock(page: Page): Promise<Mock> {
  const mock: Mock = { dados: dadosIniciais(), chamadas: [], cfg: { modo: "ok" } };

  // Registradas na ordem inversa da precedência (a última rota registrada é a primeira a casar).
  await page.route(/\/api\/pagamentos\/.+/, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    mock.chamadas.push(`INESPERADA ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort();
  });

  await page.route(/\/api\/pagamentos\/(banco\/[^/?]+|(despachante|transportadora)\/[^/?]+\/pagar)(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.fallback();
    const caminho = new URL(req.url()).pathname;
    mock.chamadas.push(`PATCH ${caminho}`);
    if (mock.cfg.modo === "abortar") return route.abort("failed");
    if (mock.cfg.modo === "erro500") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ statusMessage: "Falha simulada" }) });
    }
    if (mock.cfg.modo === "lento") await new Promise((r) => setTimeout(r, 1500));
    const partes = caminho.split("/");
    const id = partes[partes.indexOf("pagamentos") + 2]!;
    const alvo =
      partes[partes.indexOf("pagamentos") + 1] === "banco"
        ? mock.dados.banco.lotes.find((l: { id: string }) => l.id === id)
        : mock.dados[partes[partes.indexOf("pagamentos") + 1]!].find((g: { id: string }) => g.id === id);
    if (alvo) Object.assign(alvo, { realizado: true, pagoEm: "2026-10-22T12:00:00Z" });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/api\/pagamentos\/(banco|despachante|transportadora|despachante-pix|transportadora-pix)(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const key = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mock.dados[key]) });
  });
  return mock;
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

async function abrirPagamentos(page: Page, viewport: { width: number; height: number }): Promise<Mock> {
  await page.setViewportSize(viewport);
  const mock = await instalarMock(page);
  await login(page);
  await page.goto("/pagamentos", { waitUntil: "networkidle" });
  await expect(page.locator("#lote-banco-lote-a")).toBeVisible();
  return mock;
}

type Aba = "banco" | "despachante" | "transportadora";

interface Alvo {
  aba: Aba;
  rotulo: string;
  card: string; // seletor do card do lote/grupo
  pago: string; // seletor do botão "Pago"
  titulo: string;
  // Texto esperado, montado SÓ com o que a tela mostra (lido do card).
  mensagem: (page: Page) => Promise<string>;
  caminho: RegExp; // PATCH esperado
  realizados: string; // lista onde o item aparece depois de pago
  textoRealizado: string;
}

const textoDe = async (loc: Locator): Promise<string> => ((await loc.first().innerText()) ?? "").replace(/\s+/g, " ").trim();

async function mensagemGrupo(page: Page, card: string): Promise<string> {
  const c = page.locator(card);
  const toggle = c.locator("> div").first().locator("> button").first();
  const nome = await textoDe(toggle.locator("span.font-display").first());
  const qtd = await textoDe(toggle.locator("span.rounded-full").first());
  const total = (await textoDe(toggle.locator("span.font-display").last())).replace("Valor total: R$ ", "");
  return `${nome} · ${qtd} ${qtd === "1" ? "pagamento" : "pagamentos"} · Valor total R$ ${total}. O grupo vai para Pagamentos realizados.`;
}

const ALVOS: Alvo[] = [
  {
    aba: "banco",
    rotulo: "lote do Banco",
    card: "#lote-banco-lote-a",
    pago: "#btn-pagar-lote-lote-a",
    titulo: "Marcar este lote como pago?",
    mensagem: async (page) => {
      const card = page.locator("#lote-banco-lote-a");
      const header = card.locator("> div").first();
      const qtd = await textoDe(header.locator("span.rounded-full"));
      const totalReais = await textoDe(card.locator("> div").last().locator("strong").last()); // "R$ 665.388,00"
      // O card mostra "Banco XP" (título) e a data; em lg+ a data vem longa no título, então a DD/MM/AAAA é a do lote.
      return `Banco XP · 20/10/2026 · ${qtd} ${qtd === "1" ? "pagamento" : "pagamentos"} · Total ${totalReais}. O lote vai para Pagamentos realizados.`;
    },
    caminho: /\/api\/pagamentos\/banco\/lote-a$/,
    realizados: "#banco-realizados-lista",
    textoRealizado: "Ana Souza",
  },
  {
    aba: "despachante",
    rotulo: "grupo Despachante",
    card: "#grupo-pagamento-gd-1",
    pago: "#btn-pagar-grupo-gd-1",
    titulo: "Marcar este grupo como pago?",
    mensagem: (page) => mensagemGrupo(page, "#grupo-pagamento-gd-1"),
    caminho: /\/api\/pagamentos\/despachante\/gd-1\/pagar$/,
    realizados: "#grupo-realizados-lista-DESPACHANTE",
    textoRealizado: "Gisele Melo",
  },
  {
    aba: "transportadora",
    rotulo: "grupo Transporte",
    card: "#grupo-pagamento-gt-1",
    pago: "#btn-pagar-grupo-gt-1",
    titulo: "Marcar este grupo como pago?",
    mensagem: (page) => mensagemGrupo(page, "#grupo-pagamento-gt-1"),
    caminho: /\/api\/pagamentos\/transportadora\/gt-1\/pagar$/,
    realizados: "#grupo-realizados-lista-TRANSPORTADORA",
    textoRealizado: "Diego Rocha",
  },
];

const dialogo = (page: Page): Locator => page.locator("#confirm-dialog-overlay");
const cancelar = (page: Page): Locator => page.locator("#btn-confirm-dialog-cancel");
const confirmar = (page: Page): Locator => page.locator("#btn-confirm-dialog-confirm");
const idAtivo = (page: Page): Promise<string | undefined> => page.evaluate(() => document.activeElement?.id);

async function irParaAba(page: Page, aba: Aba): Promise<void> {
  await page.locator(`#tab-${aba}`).click();
  await page.waitForTimeout(200);
}

async function abrirDialogo(page: Page, alvo: Alvo): Promise<void> {
  await page.locator(alvo.pago).scrollIntoViewIfNeeded();
  await page.locator(alvo.pago).click();
  await expect(dialogo(page)).toBeVisible();
}

function semOverflowHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const main = document.querySelector("#app-main-content");
    return !(main && main.scrollWidth > main.clientWidth + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`confirmação do "Pago" — ${viewport.name}`, () => {
    test.describe.configure({ retries: 2 });

    test.beforeEach(() => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
    });

    test("3 abas: janela com texto da tela, foco em Cancelar, por cima do '+'/BottomNav; Cancelar/Esc/fora não chamam nada; Confirmar faz UMA chamada (duplo clique)", async ({ page }) => {
      const mock = await abrirPagamentos(page, viewport);
      const mobile = viewport.width < 1024;

      for (const alvo of ALVOS) {
        await irParaAba(page, alvo.aba);
        const esperado = await alvo.mensagem(page);

        // ── Abre: o "Pago" não chama nada; só abre a janela.
        await abrirDialogo(page, alvo);
        expect(mock.chamadas, `${alvo.rotulo}: abrir a janela não pode chamar a API`).toEqual([]);
        await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(1);

        const janela = page.getByRole("alertdialog", { name: alvo.titulo });
        await expect(janela, `${alvo.rotulo}: alertdialog com o título como nome`).toBeVisible();
        await expect(page.locator("#confirm-dialog-title")).toHaveText(alvo.titulo);
        await expect(page.locator("#confirm-dialog-message"), `${alvo.rotulo}: texto da janela`).toHaveText(esperado);
        await expect(janela).toHaveAttribute("aria-modal", "true");
        await expect(janela).toHaveAttribute("aria-describedby", "confirm-dialog-message");
        await expect(cancelar(page)).toHaveText("Cancelar");
        await expect(confirmar(page)).toHaveText("Marcar como pago");

        // Foco inicial em "Cancelar" (a ação segura) e foco preso na janela.
        await expect(cancelar(page)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(confirmar(page)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancelar(page), `${alvo.rotulo}: Tab no último botão volta ao primeiro`).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(confirmar(page), `${alvo.rotulo}: Shift+Tab no primeiro vai ao último`).toBeFocused();
        await page.keyboard.press("Tab");

        // Por cima do "+" flutuante, do BottomNav e do menu da conta (z-[900]); trava o scroll da página.
        const coberturas = await page.evaluate(() => {
          const noOverlay = (el: Element | null): boolean => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (!r.width) return true; // oculto (desktop): nada a cobrir
            // Ponto na borda esquerda: o toast do pagamento anterior (acima do overlay, de propósito) fica no centro do BottomNav.
            return !!document.elementFromPoint(r.x + Math.min(16, r.width / 2), r.y + r.height / 2)?.closest("#confirm-dialog-overlay");
          };
          return {
            fab: noOverlay(document.querySelector("#fab-pagamentos")),
            nav: noOverlay(document.querySelector("#bottom-nav")),
            avatar: noOverlay(document.querySelector("#header-identity")),
            bodyOverflow: document.body.style.overflow,
          };
        });
        expect(coberturas.fab, `${alvo.rotulo}: janela acima do '+'`).toBe(true);
        expect(coberturas.nav, `${alvo.rotulo}: janela acima do BottomNav`).toBe(true);
        expect(coberturas.avatar, `${alvo.rotulo}: janela acima do menu da conta`).toBe(true);
        expect(coberturas.bodyOverflow, `${alvo.rotulo}: scroll travado`).toBe("hidden");

        // Cabe na tela, sem overflow horizontal; botões >= 44px abaixo de lg.
        const card = await janela.boundingBox();
        expect(card!.x).toBeGreaterThanOrEqual(0);
        expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(card!.y + card!.height).toBeLessThanOrEqual(viewport.height + 0.5);
        expect(await semOverflowHorizontal(page)).toBe(true);
        if (mobile) {
          for (const b of [cancelar(page), confirmar(page)]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.99);
        }

        // ── Cancelar: fecha, nada é chamado, o lote segue em aberto e o foco volta ao "Pago".
        await cancelar(page).click();
        await expect(dialogo(page)).toHaveCount(0);
        await expect(page.locator(alvo.pago)).toBeVisible();
        await expect(page.locator(alvo.pago), `${alvo.rotulo}: foco volta ao Pago ao cancelar`).toBeFocused();
        expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

        // ── Esc.
        await abrirDialogo(page, alvo);
        await page.keyboard.press("Escape");
        await expect(dialogo(page)).toHaveCount(0);
        await expect(page.locator(alvo.pago), `${alvo.rotulo}: foco volta ao Pago com Esc`).toBeFocused();

        // ── Toque fora (no overlay, fora do cartão).
        await abrirDialogo(page, alvo);
        await page.mouse.click(2, 2);
        await expect(dialogo(page)).toHaveCount(0);
        await expect(page.locator(alvo.pago)).toBeVisible();

        expect(mock.chamadas, `${alvo.rotulo}: Cancelar, Esc e toque fora não chamam a API`).toEqual([]);

        // ── Confirmar com duplo clique (PATCH lento): UMA chamada; botão desabilitado e janela inerte enquanto roda.
        mock.cfg.modo = "lento";
        await abrirDialogo(page, alvo);
        await confirmar(page).dblclick();
        await expect(confirmar(page), `${alvo.rotulo}: confirmar desabilitado enquanto o PATCH roda`).toBeDisabled();
        await expect(cancelar(page)).toBeDisabled();
        await expect(page.getByRole("alertdialog")).toHaveAttribute("aria-busy", "true");
        await page.keyboard.press("Escape");
        await expect(dialogo(page), `${alvo.rotulo}: Esc é ignorado durante o PATCH`).toBeVisible();
        await page.mouse.click(2, 2);
        await expect(dialogo(page), `${alvo.rotulo}: toque fora é ignorado durante o PATCH`).toBeVisible();

        await expect(dialogo(page)).toHaveCount(0);
        await expect(page.locator("#toast-notice")).toContainText(alvo.aba === "banco" ? "Lote pago" : "Grupo pago");
        expect(mock.chamadas, `${alvo.rotulo}: exatamente UMA chamada`).toHaveLength(1);
        expect(mock.chamadas[0]).toMatch(/^PATCH /);
        expect(mock.chamadas[0]!.replace("PATCH ", "")).toMatch(alvo.caminho);

        // O item foi para "Pagamentos realizados" e o "Pago" sumiu.
        await expect(page.locator(alvo.pago)).toHaveCount(0);
        await expect(page.locator(alvo.realizados)).toContainText(alvo.textoRealizado);
        mock.chamadas.length = 0;
        mock.cfg.modo = "ok";
      }
    });
  });
}

test.describe("confirmação do 'Pago' — erro, 360px e condições de exibição", () => {
  test.describe.configure({ retries: 2 });

  test.beforeEach(() => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
  });

  for (const viewport of [{ name: "375x667", width: 375, height: 667 }, { name: "1280x800", width: 1280, height: 800 }]) {
    for (const modo of ["erro500", "abortar"] as const) {
      test(`${viewport.name}, ${modo === "abortar" ? "erro de rede" : "erro 500"}: a janela continua utilizável e dá pra tentar de novo`, async ({ page }) => {
        const mock = await abrirPagamentos(page, viewport);
        for (const alvo of ALVOS) {
          await irParaAba(page, alvo.aba);
          mock.cfg.modo = modo;
          await abrirDialogo(page, alvo);
          await confirmar(page).click();

          // Falhou: toast de erro, janela aberta, botões liberados e o lote segue em aberto.
          await expect(page.locator("#toast-notice")).toBeVisible();
          await expect(page.locator("#toast-notice")).not.toContainText(/pago e movido|pago\b.*realizados/i);
          await expect(dialogo(page)).toBeVisible();
          await expect(confirmar(page)).toBeEnabled();
          await expect(cancelar(page)).toBeEnabled();
          await expect(page.locator(alvo.pago)).toHaveCount(1);
          expect(mock.chamadas).toHaveLength(1);

          // Tentar de novo (agora o PATCH passa): mais uma chamada e a janela fecha.
          mock.cfg.modo = "ok";
          await confirmar(page).click();
          await expect(dialogo(page)).toHaveCount(0);
          expect(mock.chamadas, `${alvo.rotulo}: 1 falha + 1 sucesso`).toHaveLength(2);
          await expect(page.locator(alvo.pago)).toHaveCount(0);
          mock.chamadas.length = 0;
        }
      });
    }

    test(`${viewport.name}, erro: Cancelar depois da falha fecha sem nova chamada`, async ({ page }) => {
      const mock = await abrirPagamentos(page, viewport);
      mock.cfg.modo = "erro500";
      await abrirDialogo(page, ALVOS[0]!);
      await confirmar(page).click();
      await expect(dialogo(page)).toBeVisible();
      await expect(confirmar(page)).toBeEnabled();
      await cancelar(page).click();
      await expect(dialogo(page)).toHaveCount(0);
      expect(mock.chamadas).toHaveLength(1);
      await expect(page.locator("#btn-pagar-lote-lote-a")).toHaveCount(1);
    });
  }

  test("360px: nome de grupo longo e total de 9 dígitos não estouram a janela; sem overflow horizontal", async ({ page }) => {
    const mock = await abrirPagamentos(page, { width: 360, height: 640 });
    await irParaAba(page, "despachante");
    await page.locator("#btn-pagar-grupo-gd-longo").scrollIntoViewIfNeeded();
    await page.locator("#btn-pagar-grupo-gd-longo").click();
    await expect(dialogo(page)).toBeVisible();
    await expect(page.locator("#confirm-dialog-message")).toContainText(NOME_LONGO_GRUPO);
    await expect(page.locator("#confirm-dialog-message")).toContainText("Valor total R$ 123.456.789,01.");
    const janela = (await page.getByRole("alertdialog").boundingBox())!;
    expect(janela.x).toBeGreaterThanOrEqual(0);
    expect(janela.x + janela.width).toBeLessThanOrEqual(360.5);
    expect(janela.y + janela.height, "a janela cabe na altura de 640px").toBeLessThanOrEqual(640.5);
    expect(await semOverflowHorizontal(page)).toBe(true);
    const sobra = await page.getByRole("alertdialog").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sobra, "texto estourando a janela").toBeLessThanOrEqual(1);
    for (const b of [cancelar(page), confirmar(page)]) {
      const r = (await b.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(43.99);
      expect(r.x + r.width).toBeLessThanOrEqual(janela.x + janela.width + 0.5);
    }
    await page.keyboard.press("Escape");
    expect(mock.chamadas).toEqual([]);
  });

  test("lote sem banco definido não tem 'Pago' (nem janela); a câmera não abre confirmação", async ({ page }) => {
    const mock = await abrirPagamentos(page, { width: 390, height: 844 });
    await expect(page.locator("#btn-pagar-lote-lote-c")).toHaveCount(0);
    await expect(page.locator("#btn-exportar-lote-lote-c")).toBeVisible();
    await expect(dialogo(page)).toHaveCount(0);
    expect(mock.chamadas).toEqual([]);
  });
});
