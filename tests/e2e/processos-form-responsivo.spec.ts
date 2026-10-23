import { test, expect, type Locator, type Page, type Request } from "@playwright/test";

// Formulário "Novo processo" / "Editar processo" (ProcessoFormModal.vue e filhos)
// abaixo de lg (celular e tablet): tela cheia por cima do BottomNav, cabeçalho e
// rodapé (Cancelar + Salvar) fixos, corpo que rola por dentro, campos de 44px/16px
// sem truncar valores reais e listas dos AppSelect sempre inteiras na viewport.
//
// As asserções são explícitas sobre posição, tamanho e estilo computado (não só
// "sem overflow"). Cria 1 processo de teste via API (pro modo Editar) e SEMPRE o
// apaga no afterAll, também via API. "Salvar" NUNCA persiste: POST/PATCH de
// /api/processos são interceptados (page.route) e respondidos pelo próprio teste —
// o spec só afirma qual endpoint/método/corpo o formulário chamou.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — precisa de escrita
//   em processos: é o que cria e apaga o processo de teste)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

// Só dígitos: a busca normaliza o texto, então o RUN casa por substring.
const RUN = String(Date.now()).slice(-9);

// Processo de teste do modo Editar: status e fornecedor "Outro" (campos
// condicionais abertos), transportadora nacional, 2 medicamentos e 2 pendências.
const EDITAR = {
  paciente: `Samuel Correia de Medeiros ${RUN}`,
  ordem: "Ordem 2",
  pasta: "2026 - 234",
  empresa: "FARMAURORA",
  consultor: "Alessandra",
  responsavelOperacional: "Rebeca",
  despachante: "Andreza Faconi",
  fornecedor: "Fornecedor Teste Avulso Ltda",
  transportadoraNacional: { nome: "Jadlog Logística", cotacao: "COT-1", valor: 1234.5 },
  modalEnvio: "Air Cargo",
  companhiaAerea: "LATAM Cargo",
  numeroAwb: "957-12345678",
  codigoRastreio: "LA123456789BR",
  medicamentos: [
    { nome: "Pembrolizumabe", dosagem: "100mg", quantidade: "4 cx" },
    { nome: "Nivolumabe", dosagem: "40mg/10mL", quantidade: "2 cx" },
  ],
  status: "outro",
  statusOutro: "Aguardando liberação da ANVISA",
  datas: {
    dataCompraPO: "05/08",
    dataEmbarque: "12/08",
    aberturaThread: "06/08",
    dataChegadaBrasil: "20/08",
    registroRadar: "21/08",
    registroDuimp: "22/08",
    registroLpco: "23/08",
    previsaoEntrega: "28/08",
    supostaEstimativa: "Entre 28/08 e 02/09",
  },
  localEntrega: "Rua das Flores 123, São Paulo",
  numeroProcesso: "25BR00001234567-8/2026",
  pendencias: ["Aguardando licença de importação", "Enviar procuração assinada"],
  statusPagamento: "pendente",
  atualizacoes: [],
};

// sm = 640px (Tailwind): o formulário troca de 2 pra 3/4 colunas aí. md = 768px.
const VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768 (último pixel antes de lg)", width: 1023, height: 768 },
];

const MODOS = ["novo", "editar"] as const;
type Modo = (typeof MODOS)[number];

const SELECTS = [
  "pf-empresa",
  "pf-consultor",
  "pf-status",
  "pf-responsavel",
  "pf-status-pagamento",
  "pf-despachante",
  "pf-fornecedor",
  "pf-modal",
] as const;

const DATAS = [
  "pf-data-po",
  "pf-data-embarque",
  "pf-thread",
  "pf-chegada",
  "pf-radar",
  "pf-duimp",
  "pf-lpco",
  "pf-previsao",
  "pf-suposta-estimativa",
] as const;

// Todos os campos do formulário (ids) — o conjunto exato de hoje, por modo.
const CAMPOS_NOVO = [
  "pf-paciente",
  "pf-pasta",
  "pf-ordem",
  "pf-empresa",
  "pf-consultor",
  "pf-status",
  "pf-responsavel",
  "pf-status-pagamento",
  "pf-despachante",
  "pf-fornecedor",
  "pf-modal",
  "pf-transp-nome",
  "pf-transp-cotacao",
  "pf-transp-valor",
  "pf-cia-aerea",
  "pf-awb",
  "pf-rastreio",
  "pf-medicamento-nome-0",
  "pf-medicamento-dosagem-0",
  "pf-medicamento-quantidade-0",
  ...DATAS,
  "pf-local-entrega",
  "pf-numero-processo",
];
const CAMPOS_EDITAR = [
  ...CAMPOS_NOVO.slice(0, 6),
  "pf-status-outro",
  ...CAMPOS_NOVO.slice(6, 11),
  "pf-fornecedor-outro",
  ...CAMPOS_NOVO.slice(11, 20),
  "pf-medicamento-nome-1",
  "pf-medicamento-dosagem-1",
  "pf-medicamento-quantidade-1",
  ...CAMPOS_NOVO.slice(20),
];

let processoId: string | null = null;

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

type Caixa = { x: number; y: number; width: number; height: number };
const direita = (b: Caixa): number => b.x + b.width;
const embaixo = (b: Caixa): number => b.y + b.height;

async function box(locator: Locator, nome: string): Promise<Caixa> {
  const b = await locator.first().boundingBox();
  expect(b, `${nome} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}
// Caixa em coordenadas do CONTEÚDO do corpo (y soma o scrollTop do <form>): permite
// comparar campos medidos em momentos diferentes, com o corpo rolado pra outro lugar.
async function caixaNoCorpo(locator: Locator, nome: string): Promise<Caixa> {
  const c = await locator.first().evaluate((el) => {
    const form = document.querySelector("#processo-form")!;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.top - form.getBoundingClientRect().top + form.scrollTop, width: r.width, height: r.height };
  });
  expect(c.width, `${nome} sem caixa (oculto?)`).toBeGreaterThan(0);
  return c;
}
const campo = (page: Page, id: string): Locator => page.locator(`#${id}`);
const boxCampo = (page: Page, id: string): Promise<Caixa> => box(campo(page, id), id);

// Caixa da área visível do corpo: entre o cabeçalho (fixo) e o rodapé (fixo).
async function areaDoCorpo(page: Page): Promise<{ topo: number; base: number }> {
  const fechar = await box(page.locator("#btn-close-processo-form"), "fechar");
  const cabecalho = await page.locator("#btn-close-processo-form").evaluate((el) => el.parentElement!.getBoundingClientRect().bottom);
  const salvar = await box(page.locator("#btn-save-processo"), "salvar");
  // O rodapé tem 12px de respiro acima dos botões (pt-3).
  expect(fechar.y).toBeGreaterThanOrEqual(0);
  return { topo: cabecalho, base: salvar.y - 12 };
}

async function abrirModal(page: Page, modo: Modo): Promise<void> {
  if (modo === "novo") {
    await page.getByRole("button", { name: "Novo processo" }).click();
  } else {
    // Idempotente: na 2ª abertura (depois de Cancelar) o grupo e a linha já estão expandidos.
    const linha = page.locator(`#processo-row-${processoId}`);
    if (!(await linha.isVisible())) {
      await page.locator("#processo-group-list button").filter({ hasText: "Alessandra" }).first().click();
    }
    if (!(await page.locator(`#processo-detail-${processoId}`).isVisible())) {
      await page.locator(`#processo-row-${processoId} > button`).click();
    }
    const editar = page
      .locator(`#btn-edit-processo-${processoId}, #btn-edit-processo-footer-${processoId}`)
      .locator("visible=true")
      .first();
    await editar.click();
  }
  await expect(page.locator("#processo-form")).toBeVisible();
}

async function irParaProcessos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await login(page);
  await page.goto("/processos", { waitUntil: "networkidle" });
  await expect(page.locator("#tab-andamento")).toBeVisible();
  await page.locator("#processo-search").fill(RUN);
}

// Rola SÓ o corpo (o <form>) até o campo ficar no centro da área visível.
async function rolarParaCampo(page: Page, id: string): Promise<void> {
  await campo(page, id).evaluate((el) => el.scrollIntoView({ block: "center" }));
}

// Altura visível mínima/máxima de um campo dentro da área do corpo.
async function expectVisivelNoCorpo(page: Page, id: string): Promise<void> {
  await rolarParaCampo(page, id);
  const area = await areaDoCorpo(page);
  const b = await boxCampo(page, id);
  expect(b.y, `${id} abaixo do cabeçalho`).toBeGreaterThanOrEqual(area.topo - 1);
  expect(embaixo(b), `${id} acima do rodapé`).toBeLessThanOrEqual(area.base + 1);
}

test.describe("/processos abaixo de lg — formulário Novo/Editar processo", () => {
  test.describe.configure({ retries: 2 });

  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");

  test.beforeAll(async ({ browser }) => {
    if (!hasWriter) return;
    const page = await browser.newPage();
    try {
      await login(page);
      const res = await page.request.post("/api/processos", { data: EDITAR });
      expect(res.ok(), `POST /api/processos: ${res.status()}`).toBe(true);
      processoId = ((await res.json()) as { id: string }).id;
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!hasWriter) return;
    const page = await browser.newPage();
    try {
      await login(page);
      // Apaga tudo que casa com o RUN (mesmo se o beforeAll falhou no meio), via API.
      const todos = (await (await page.request.get("/api/processos")).json()) as { id: string; paciente: string }[];
      for (const p of todos.filter((x) => x.paciente.includes(RUN))) {
        const del = await page.request.delete(`/api/processos/${p.id}`);
        expect(del.ok(), `DELETE ${p.id}`).toBe(true);
      }
      const depois = (await (await page.request.get("/api/processos")).json()) as { paciente: string }[];
      expect(depois.filter((x) => x.paciente.includes(RUN))).toHaveLength(0);
    } finally {
      await page.close();
      processoId = null;
    }
  });

  for (const viewport of VIEWPORTS) {
    for (const modo of MODOS) {
      test.describe(`${viewport.name} — modo ${modo}`, () => {
        // Nenhum Salvar deste describe persiste nada: mutações em /api/processos
        // são respondidas aqui (mesmo no modo Editar) e registradas pra asserção.
        let mutacoes: { metodo: string; url: string; corpo: Record<string, unknown> }[] = [];

        test.beforeEach(async ({ page }) => {
          expect(processoId, "processo de teste não foi criado").not.toBeNull();
          mutacoes = [];
          await page.route(/\/api\/processos(\/[^/?]+)?(\?.*)?$/, async (route) => {
            const req = route.request();
            if (req.method() !== "POST" && req.method() !== "PATCH") return route.fallback();
            const corpo = req.postDataJSON() as Record<string, unknown>;
            mutacoes.push({ metodo: req.method(), url: new URL(req.url()).pathname, corpo });
            return route.fulfill({
              status: req.method() === "POST" ? 201 : 200,
              contentType: "application/json",
              body: JSON.stringify({ id: processoId ?? "proc_teste", ...EDITAR, ...corpo }),
            });
          });
          await irParaProcessos(page, viewport);
          await abrirModal(page, modo);
        });

        test("casco: tela cheia por cima do BottomNav, cabeçalho e rodapé fixos, sem overflow horizontal", async ({ page }) => {
          const { width: vw, height: vh } = viewport;
          const casco = await box(page.locator("#processo-form-modal-overlay > div"), "casco");
          expect(casco, "casco ocupa a viewport inteira").toMatchObject({ x: 0, y: 0, width: vw, height: vh });
          const estiloCasco = await page
            .locator("#processo-form-modal-overlay > div")
            .evaluate((el) => ({ position: getComputedStyle(el).position, raio: getComputedStyle(el).borderRadius }));
          expect(estiloCasco).toEqual({ position: "fixed", raio: "0px" });

          // BottomNav coberto: o elemento no ponto de toque de cada item é do modal.
          const nav = await box(page.locator("#bottom-nav"), "bottom-nav");
          for (const fx of [0.1, 0.35, 0.5, 0.65, 0.9]) {
            const dono = await page.evaluate(
              ([x, y]) => document.elementFromPoint(x, y)?.closest("#processo-form-modal-overlay") !== null,
              [nav.x + nav.width * fx, nav.y + nav.height / 2] as [number, number],
            );
            expect(dono, `ponto ${fx} da barra inferior pertence ao modal`).toBe(true);
          }

          // Cabeçalho: encostado no topo, com "PROCESSO", título e fechar >= 44px.
          const fechar = await box(page.locator("#btn-close-processo-form"), "fechar");
          expect(fechar.width).toBeGreaterThanOrEqual(44);
          expect(fechar.height).toBeGreaterThanOrEqual(44);
          expect(direita(fechar), "fechar dentro da viewport").toBeLessThanOrEqual(vw);
          const cab = await page
            .locator("#btn-close-processo-form")
            .evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON() as { top: number; bottom: number });
          expect(cab.top).toBe(0);
          await expect(page.locator("#processo-form-modal-overlay h2")).toHaveText(
            modo === "editar" ? "Editar processo" : "Novo processo",
          );

          // Rodapé: Cancelar + Salvar >= 44px, lado a lado, colados na base (safe-area = 0 aqui).
          const cancelar = await box(page.locator("#btn-cancel-processo"), "cancelar");
          const salvar = await box(page.locator("#btn-save-processo"), "salvar");
          for (const [nome, b] of [["cancelar", cancelar], ["salvar", salvar]] as const) {
            expect(b.height, `altura de ${nome}`).toBeGreaterThanOrEqual(44);
            expect(embaixo(b), `${nome} dentro da viewport`).toBeLessThanOrEqual(vh);
          }
          expect(Math.abs(cancelar.y - salvar.y)).toBeLessThanOrEqual(1);
          expect(salvar.x).toBeGreaterThanOrEqual(direita(cancelar));
          expect(vh - embaixo(salvar), "respiro abaixo dos botões").toBeLessThanOrEqual(16);
          await expect(page.locator("#btn-save-processo")).toHaveText(
            modo === "editar" ? "Salvar alterações" : "+ Adicionar processo",
          );

          // Cabeçalho e rodapé não se mexem quando o corpo rola até o fim; a página atrás não rola.
          const antes = { cancelar, salvar, fechar };
          const principalAntes = await page.evaluate(() => document.querySelector("#app-main-content")?.scrollTop ?? 0);
          await page.locator("#processo-form").evaluate((f) => { f.scrollTop = f.scrollHeight; });
          const depois = {
            cancelar: await box(page.locator("#btn-cancel-processo"), "cancelar"),
            salvar: await box(page.locator("#btn-save-processo"), "salvar"),
            fechar: await box(page.locator("#btn-close-processo-form"), "fechar"),
          };
          expect(depois).toEqual(antes);
          const rolagem = await page.evaluate(() => ({
            corpo: document.body.style.overflow,
            janela: window.scrollY,
            principal: document.querySelector("#app-main-content")?.scrollTop ?? 0,
          }));
          expect(rolagem).toEqual({ corpo: "hidden", janela: 0, principal: principalAntes });
          const form = await page
            .locator("#processo-form")
            .evaluate((f) => ({ overscroll: getComputedStyle(f).overscrollBehaviorY, overflowY: getComputedStyle(f).overflowY, h: f.scrollWidth > f.clientWidth + 1 }));
          expect(form).toEqual({ overscroll: "contain", overflowY: "auto", h: false });

          // Sem overflow horizontal (página e casco).
          expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
        });

        test("todos os campos existem e são alcançáveis rolando só o corpo", async ({ page }) => {
          const esperados = modo === "editar" ? CAMPOS_EDITAR : CAMPOS_NOVO;
          const presentes = await page
            .locator("#processo-form [id^='pf-']")
            .evaluateAll((els) => els.map((el) => el.id).filter((id) => !id.endsWith("-listbox")));
          expect([...presentes].sort(), "conjunto exato de campos").toEqual([...esperados].sort());

          for (const id of esperados) await expectVisivelNoCorpo(page, id);

          // Pendências (modo Editar: 2 itens, sem id) e "+ Pendência".
          if (modo === "editar") {
            await expect(page.locator("#processo-form input:not([id])")).toHaveCount(2);
          }
          await rolarParaCampo(page, "btn-add-pendencia");
          const area = await areaDoCorpo(page);
          const add = await box(page.locator("#btn-add-pendencia"), "+ Pendência");
          expect(embaixo(add)).toBeLessThanOrEqual(area.base + 1);
        });

        test("altura >= 44px e fonte >= 16px em todos os campos; botões de remover/adicionar >= 44px", async ({ page }) => {
          const ids = modo === "editar" ? CAMPOS_EDITAR : CAMPOS_NOVO;
          for (const id of ids) {
            await rolarParaCampo(page, id);
            const b = await boxCampo(page, id);
            expect(b.height, `altura de #${id}`).toBeGreaterThanOrEqual(44);
            const fonte = await campo(page, id).evaluate((el) => parseFloat(getComputedStyle(el.tagName === "BUTTON" ? el : el).fontSize));
            expect(fonte, `font-size de #${id}`).toBeGreaterThanOrEqual(16);
          }

          // Inputs de pendência (sem id) — só no modo Editar.
          for (const input of await page.locator("#processo-form input:not([id])").all()) {
            await input.evaluate((el) => el.scrollIntoView({ block: "center" }));
            expect((await box(input, "pendência")).height).toBeGreaterThanOrEqual(44);
            expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
          }

          // Remover (✕) e adicionar (+): todos >= 44x44; "+ Pendência" >= 44 e em largura total.
          const botoes = page.locator(
            "#processo-form button[title='Remover medicamento'], #processo-form button[title='Remover pendência'], #processo-form button[title='Adicionar medicamento']",
          );
          const n = await botoes.count();
          expect(n, "há botões de remover/adicionar").toBeGreaterThan(0);
          for (let i = 0; i < n; i++) {
            await botoes.nth(i).evaluate((el) => el.scrollIntoView({ block: "center" }));
            const b = await box(botoes.nth(i), `botão ${i}`);
            expect(b.height, `altura do botão ${i}`).toBeGreaterThanOrEqual(44);
            expect(b.width, `largura do botão ${i}`).toBeGreaterThanOrEqual(44);
          }
          await rolarParaCampo(page, "btn-add-pendencia");
          const add = await box(page.locator("#btn-add-pendencia"), "+ Pendência");
          const corpo = await box(page.locator("#pf-local-entrega"), "ref");
          expect(add.height).toBeGreaterThanOrEqual(44);
          expect(add.width, "+ Pendência em largura total").toBeGreaterThanOrEqual(corpo.width);
        });

        test("nenhum select/input com valor realista fica truncado", async ({ page }) => {
          // Cada select com TODAS as opções reais (inclui as longas: "Gabriela Santana",
          // "Elaboração / Fornecedores", "Beldimed - Bélgica", "Speciality - Índia",
          // "Courier Simples", "Andreza Faconi", "Marcelo Lima", "FARMAURORA"...).
          // O despachante/transportadora some com modal "Courier Simples" — por isso o
          // modal é o último a varrer, e volta pra uma opção que mantém despachante.
          const nomes = ["pf-empresa", "pf-consultor", "pf-status", "pf-responsavel", "pf-status-pagamento", "pf-despachante", "pf-fornecedor", "pf-modal"];
          for (const id of nomes) {
            await rolarParaCampo(page, id);
            await campo(page, id).click();
            const opcoes = await page.locator(`#${id}-listbox li`).allInnerTexts();
            await campo(page, id).click(); // fecha (Esc fecharia o modal inteiro — comportamento do BaseModal)
            for (const texto of opcoes) {
              await rolarParaCampo(page, id);
              await campo(page, id).click();
              await page.locator(`#${id}-listbox li`).filter({ hasText: new RegExp(`^${texto.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
              await rolarParaCampo(page, id);
              const medida = await campo(page, id).locator("span.truncate").evaluate((s) => ({ cortado: s.scrollWidth > s.clientWidth + 0.5, texto: s.textContent?.trim() }));
              expect(medida.cortado, `#${id} = "${medida.texto}" truncado`).toBe(false);
            }
          }

          // Inputs com os valores reais.
          const valores: [string, string][] = [
            ["pf-paciente", "Samuel Correia de Medeiros"],
            ["pf-transp-nome", "Jadlog Logística"],
            ["pf-transp-cotacao", "COT-1"],
            ["pf-transp-valor", "1234.5"],
            ["pf-cia-aerea", "LATAM Cargo"],
            ["pf-awb", "957-12345678"],
            ["pf-rastreio", "LA123456789BR"],
            ["pf-medicamento-nome-0", "Pembrolizumabe"],
            ["pf-medicamento-dosagem-0", "100mg/4mL"],
            ["pf-medicamento-quantidade-0", "10 cx"],
            ["pf-local-entrega", "Rua das Flores 123, São Paulo"],
            ["pf-numero-processo", "25BR00001234567-8/2026"],
            ["pf-data-po", "05/08"],
            ["pf-suposta-estimativa", "Entre 28/08 e 02/09"],
          ];
          // Com modal "Courier Simples" selecionado acima, a transportadora some: reabre.
          await rolarParaCampo(page, "pf-modal");
          await campo(page, "pf-modal").click();
          await page.locator("#pf-modal-listbox li", { hasText: "Air Cargo" }).click();
          for (const [id, valor] of valores) {
            await rolarParaCampo(page, id);
            await campo(page, id).fill(valor);
            const cortado = await campo(page, id).evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
            expect(cortado, `#${id} = "${valor}" truncado`).toBe(false);
          }
        });

        test("grades: colunas por faixa, campos longos em largura total, condicionais abaixo do select", async ({ page }) => {
          const tablet = viewport.width >= 640; // sm
          const larguraTablet = viewport.width >= 768; // md
          const b = async (id: string) => caixaNoCorpo(campo(page, id), id);
          const mesmaLinha = (a: Caixa, c: Caixa, nome: string) =>
            expect(Math.abs(a.y - c.y), `${nome} na mesma linha`).toBeLessThanOrEqual(1);
          const abaixoDe = (a: Caixa, ref: Caixa, nome: string) =>
            expect(a.y, `${nome} abaixo`).toBeGreaterThanOrEqual(embaixo(ref) - 1);
          const mesmaColuna = (a: Caixa, c: Caixa, nome: string) => {
            expect(Math.abs(a.x - c.x), `${nome} alinhado à esquerda`).toBeLessThanOrEqual(1);
            expect(Math.abs(a.width - c.width), `${nome} mesma largura`).toBeLessThanOrEqual(1);
          };

          // Largura útil do corpo (o conteúdo é uma coluna de até 720px, centralizada).
          const paciente = await b("pf-paciente");
          const pasta = await b("pf-pasta");
          const util = Math.min(viewport.width, 720) - 2 * (viewport.width >= 720 ? 20 : 16);
          if (!tablet) {
            expect(paciente.width, "paciente em largura total da coluna").toBeCloseTo(util, 0);
          } else {
            // Tablet: Paciente (2 colunas) + Pasta (1) preenchem a coluna de 720px, sem sobrar nem estourar.
            expect(direita(pasta) - paciente.x, "Paciente + Pasta = largura da coluna").toBeCloseTo(util, 0);
          }

          // Pasta + Ordem lado a lado (2 colunas), abaixo do paciente.
          const ordem = await b("pf-ordem");
          if (!tablet) {
            mesmaLinha(pasta, ordem, "Pasta | Ordem");
            expect(ordem.x).toBeGreaterThanOrEqual(direita(pasta));
            abaixoDe(pasta, paciente, "Pasta");
          } else {
            // Tablet: 3 colunas — Paciente (2) + Pasta na 1ª linha, depois Ordem | Empresa | Consultor.
            mesmaLinha(paciente, pasta, "Paciente | Pasta");
            const empresa = await b("pf-empresa");
            const consultor = await b("pf-consultor");
            mesmaLinha(ordem, empresa, "Ordem | Empresa");
            mesmaLinha(empresa, consultor, "Empresa | Consultor");
          }

          // Status / Responsável / Pagamento.
          const status = await b("pf-status");
          const resp = await b("pf-responsavel");
          const pag = await b("pf-status-pagamento");
          mesmaLinha(resp, pag, "Responsável | Pagamento");
          if (!tablet) {
            expect(status.width, "Status em largura total").toBeCloseTo(util, 0);
            abaixoDe(resp, status, "Responsável");
          } else {
            mesmaLinha(status, resp, "Status | Responsável (4 colunas, Status ocupa 2)");
            expect(status.width, "Status ocupa 2 colunas").toBeGreaterThan(resp.width * 1.9);
          }
          if (modo === "editar") {
            const outro = await b("pf-status-outro");
            expect(outro.width, "Qual status? em largura total").toBeCloseTo(util, 0);
            abaixoDe(outro, pag, "Qual status?");
            expect(outro.y - embaixo(pag), "Qual status? logo abaixo do select").toBeLessThanOrEqual(48);
          }

          // Despachante / Fornecedor / Modal: 1 coluna até md, 3 colunas em md+.
          const desp = await b("pf-despachante");
          const forn = await b("pf-fornecedor");
          const modal = await b("pf-modal");
          if (!larguraTablet) {
            mesmaColuna(desp, forn, "Despachante/Fornecedor");
            mesmaColuna(forn, modal, "Fornecedor/Modal");
            abaixoDe(forn, desp, "Fornecedor");
            abaixoDe(modal, forn, "Modal");
            expect(forn.width).toBeCloseTo(util, 0);
          } else {
            mesmaLinha(desp, forn, "Despachante | Fornecedor");
            mesmaLinha(forn, modal, "Fornecedor | Modal");
          }
          if (modo === "editar") {
            const outro = await b("pf-fornecedor-outro");
            expect(outro.width, "Qual fornecedor? em largura total").toBeCloseTo(util, 0);
            abaixoDe(outro, modal, "Qual fornecedor?");
            expect(outro.x, "sem pular pro lado").toBeLessThanOrEqual(forn.x + 1);
          }

          // Transportadora nacional: Nome em largura total do fieldset; Cotação | Valor lado a lado.
          const fieldset = await caixaNoCorpo(page.locator("#pf-transp-nome").locator("xpath=ancestor::fieldset"), "fieldset");
          const nome = await b("pf-transp-nome");
          const cot = await b("pf-transp-cotacao");
          const valor = await b("pf-transp-valor");
          mesmaLinha(cot, valor, "Cotação | Valor");
          for (const [id, c] of [["nome", nome], ["cotação", cot], ["valor", valor]] as const) {
            expect(c.x, `${id} dentro do fieldset (esq.)`).toBeGreaterThanOrEqual(fieldset.x);
            expect(direita(c), `${id} dentro do fieldset (dir.)`).toBeLessThanOrEqual(direita(fieldset) + 0.5);
          }
          if (!tablet) {
            expect(nome.width, "Nome ocupa as 2 colunas").toBeGreaterThan(cot.width * 1.9);
            abaixoDe(cot, nome, "Cotação");
          } else {
            mesmaLinha(nome, cot, "Nome | Cotação (3 colunas)");
          }

          // Cia. aérea / AWB / Rastreio: Cia + AWB em 2 colunas, Rastreio em largura total (celular).
          const cia = await b("pf-cia-aerea");
          const awb = await b("pf-awb");
          const rastreio = await b("pf-rastreio");
          mesmaLinha(cia, awb, "Cia | AWB");
          if (!tablet) {
            expect(rastreio.width, "Rastreio em largura total").toBeCloseTo(util, 0);
            abaixoDe(rastreio, cia, "Rastreio");
          } else {
            mesmaLinha(awb, rastreio, "AWB | Rastreio (3 colunas)");
          }

          // Medicamento (item 0): Nome em largura total; Dosagem | Quantidade; ações na linha de baixo.
          const mNome = await b("pf-medicamento-nome-0");
          const mDos = await b("pf-medicamento-dosagem-0");
          const mQtd = await b("pf-medicamento-quantidade-0");
          expect(mNome.width, "nome do medicamento em largura total").toBeCloseTo(util, 0);
          mesmaLinha(mDos, mQtd, "Dosagem | Quantidade");
          abaixoDe(mDos, mNome, "Dosagem");
          const adicionar = page.locator("#processo-form button[title='Adicionar medicamento']");
          const mAdd = await caixaNoCorpo(adicionar, "adicionar medicamento");
          abaixoDe(mAdd, modo === "editar" ? await b("pf-medicamento-dosagem-1") : mDos, "Adicionar");
          expect(mAdd.width, "Adicionar medicamento em largura total (ou quase, ao lado do ✕)").toBeGreaterThanOrEqual(modo === "editar" ? util - 44 - 8 - 2 : util - 2);

          // Datas: 2 colunas no celular (3 no tablet); "Suposta estimativa" (texto livre) em largura total no celular.
          const d1 = await b("pf-data-po");
          const d2 = await b("pf-data-embarque");
          const d3 = await b("pf-thread");
          const suposta = await b("pf-suposta-estimativa");
          mesmaLinha(d1, d2, "Compra | Embarque");
          if (!tablet) {
            abaixoDe(d3, d1, "Abertura thread (2 colunas)");
            const fs = await caixaNoCorpo(page.locator("#pf-data-po").locator("xpath=ancestor::fieldset"), "fieldset datas");
            expect(suposta.width, "Suposta estimativa ocupa as 2 colunas").toBeGreaterThan(d1.width * 1.9);
            expect(direita(suposta)).toBeLessThanOrEqual(direita(fs) + 0.5);
          } else {
            mesmaLinha(d2, d3, "Embarque | Abertura thread (3 colunas)");
          }

          // Local de entrega / Nº do processo: largura total no celular, 2 colunas no tablet.
          const local = await b("pf-local-entrega");
          const numero = await b("pf-numero-processo");
          if (!tablet) {
            expect(numero.width).toBeCloseTo(util, 0);
            abaixoDe(numero, local, "Nº do processo");
          } else {
            mesmaLinha(local, numero, "Local | Nº do processo");
          }
        });

        test("campo focado nunca fica atrás do rodapé fixo (scroll-padding do corpo)", async ({ page }) => {
          // Com o teclado virtual aberto o navegador rola o campo focado pra dentro da área
          // visível; o scroll-padding-bottom do corpo desconta o rodapé sticky nessa conta.
          const ids = ["pf-numero-processo", "pf-local-entrega", "pf-rastreio", "pf-data-po", "pf-suposta-estimativa"];
          for (const id of ids) {
            await page.locator("#processo-form").evaluate((f) => { f.scrollTop = 0; });
            await campo(page, id).focus();
            const area = await areaDoCorpo(page);
            const b = await boxCampo(page, id);
            expect(b.y, `#${id} abaixo do cabeçalho ao focar`).toBeGreaterThanOrEqual(area.topo - 1);
            expect(embaixo(b), `#${id} acima do rodapé ao focar`).toBeLessThanOrEqual(area.base + 1);
          }
          const padding = await page.locator("#processo-form").evaluate((f) => parseFloat(getComputedStyle(f).scrollPaddingBottom));
          expect(padding, "scroll-padding cobre o rodapé (>= 68px)").toBeGreaterThanOrEqual(68);
        });

        test("toda lista de AppSelect abre inteira dentro da viewport, acima do rodapé", async ({ page }) => {
          const { width: vw } = viewport;
          for (const id of SELECTS) {
            await rolarParaCampo(page, id);
            await campo(page, id).click();
            const lista = page.locator(`#${id}-listbox`);
            await expect(lista).toBeVisible();
            const l = await box(lista, `lista de ${id}`);
            const area = await areaDoCorpo(page);
            expect(l.x, `${id}: esquerda`).toBeGreaterThanOrEqual(0);
            expect(direita(l), `${id}: direita`).toBeLessThanOrEqual(vw);
            expect(l.y, `${id}: topo abaixo do cabeçalho`).toBeGreaterThanOrEqual(area.topo - 1);
            expect(embaixo(l), `${id}: base acima do rodapé`).toBeLessThanOrEqual(area.base + 1);
            // Opções com alvo de toque decente e nenhuma cortada na horizontal.
            const opcoes = await lista.locator("li").evaluateAll((lis) =>
              lis.map((li) => ({ h: li.getBoundingClientRect().height, cortada: li.scrollWidth > li.clientWidth + 0.5 })),
            );
            for (const o of opcoes) {
              expect(o.h, `${id}: altura da opção`).toBeGreaterThanOrEqual(40);
              expect(o.cortada, `${id}: opção cortada`).toBe(false);
            }
            // A opção atual está visível dentro da lista (rolagem interna).
            const marcada = lista.locator("li[aria-selected='true']");
            const lb = await box(lista, "lista");
            const mb = await box(marcada, "opção marcada");
            expect(mb.y).toBeGreaterThanOrEqual(lb.y - 1);
            expect(embaixo(mb)).toBeLessThanOrEqual(embaixo(lb) + 1);
            await campo(page, id).click(); // fecha
            await expect(lista).toHaveCount(0);
          }
        });

        test("Cancelar fecha sem persistir; Salvar chama o mesmo endpoint de hoje", async ({ page }) => {
          // Cancelar (mesmo com campo alterado) não faz nenhuma requisição de escrita.
          await campo(page, "pf-paciente").fill("Alteração que não deve ser salva");
          await page.locator("#btn-cancel-processo").click();
          await expect(page.locator("#processo-form")).toHaveCount(0);
          expect(mutacoes, "Cancelar não persiste").toHaveLength(0);

          await abrirModal(page, modo);
          // Salvar inválido (Novo vazio) só avisa — nenhuma requisição.
          if (modo === "novo") {
            await page.locator("#btn-save-processo").click();
            await expect(page.locator("#toast-notice")).toHaveText("Informe o nome do paciente.");
            expect(mutacoes).toHaveLength(0);
            await campo(page, "pf-paciente").fill("Samuel Correia de Medeiros");
            await campo(page, "pf-pasta").fill("2026234");
            await campo(page, "pf-consultor").click();
            await page.locator("#pf-consultor-listbox li", { hasText: "Alessandra" }).click();
          } else {
            await campo(page, "pf-rastreio").fill("ZZ999999999BR");
          }
          await page.locator("#btn-save-processo").click();
          await expect(page.locator("#processo-form")).toHaveCount(0);

          expect(mutacoes, "uma única escrita").toHaveLength(1);
          const m = mutacoes[0]!;
          if (modo === "novo") {
            expect(m.metodo).toBe("POST");
            expect(m.url).toBe("/api/processos");
            expect(m.corpo).toMatchObject({ paciente: "Samuel Correia de Medeiros", consultor: "Alessandra" });
          } else {
            expect(m.metodo).toBe("PATCH");
            expect(m.url).toBe(`/api/processos/${processoId}`);
            expect(m.corpo).toMatchObject({ codigoRastreio: "ZZ999999999BR" });
          }
        });
      });
    }
  }
});
