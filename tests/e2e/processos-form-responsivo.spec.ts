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
  numeroRemessa: 2,
  pasta: "2026 - 234",
  empresa: "FARMAURORA",
  consultor: "Alessandra",
  responsavelOperacional: "Rebeca",
  despachante: "Andreza Faconi",
  fornecedor: "Fornecedor Teste Avulso Ltda",
  transportadoraNacional: { nome: "Jadlog Logística", cotacao: "COT-1", valor: 1234.5 },
  modalEnvio: "Air Cargo",
  companhiaAerea: "Lufthansa",
  numeroAwb: "957-12345678",
  medicamentos: [
    { nome: "Pembrolizumabe", dosagem: "100mg", quantidade: "4 cx" },
    { nome: "Nivolumabe", dosagem: "40mg/10mL", quantidade: "2 cx" },
  ],
  status: "desembaraco",
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

// Todos os campos do formulário (ids) — o conjunto exato de hoje, por modo, na ordem da tela (de cima para baixo), que é a
// ordem do painel lateral do Kanban.
const CAMPOS_NOVO = [
  "pf-paciente",
  "pf-pasta",
  "pf-numero-po",
  "pf-numero-remessa",
  "pf-numero-remessa-menos",
  "pf-numero-remessa-mais",
  "pf-medicamento-quantidade-0",
  "pf-medicamento-nome-0",
  "pf-fornecedor",
  "pf-modal",
  "pf-cia-aerea",
  "pf-awb",
  "pf-despachante",
  "pf-transp-nome",
  "pf-transp-cotacao",
  "pf-transp-valor",
  "pf-local-entrega",
  "pf-numero-processo",
  ...DATAS,
  "pf-empresa",
  "pf-responsavel",
  "pf-consultor",
  "pf-status",
  "pf-status-pagamento",
];
// Editar: 2º medicamento (entra depois do 1º) e o condicional Qual fornecedor? (logo depois de Fornecedor · Envio).
const CAMPOS_EDITAR = [
  ...CAMPOS_NOVO.slice(0, 8),
  "pf-medicamento-quantidade-1",
  "pf-medicamento-nome-1",
  ...CAMPOS_NOVO.slice(8, 10),
  "pf-fornecedor-outro",
  ...CAMPOS_NOVO.slice(10),
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
            // Setas ▲/▼ do Nº Ordem: ícones dentro do campo (cada uma com metade da altura), sem texto — conferidas na
            // grade abaixo; a altura de 44px é do CONTÊINER do campo (o input ocupa a altura toda dele, sem a borda).
            if (id === "pf-numero-remessa-mais" || id === "pf-numero-remessa-menos") continue;
            const b =
              id === "pf-numero-remessa"
                ? await box(campo(page, id).locator("xpath=.."), "contêiner do Nº Ordem")
                : await boxCampo(page, id);
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
          // "Na origem", "Desembaraço", "Beldimed - Bélgica", "Speciality - Índia",
          // "Courier Simples", "Andreza Faconi", "Marcelo Lima", "FARMAURORA"...).
          // O despachante/transportadora some com modal "Courier Simples" — por isso o
          // modal é o último a varrer, e volta pra uma opção que mantém despachante.
          const nomes = ["pf-empresa", "pf-consultor", "pf-status", "pf-responsavel", "pf-status-pagamento", "pf-despachante", "pf-fornecedor", "pf-cia-aerea", "pf-modal"];
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
            ["pf-awb", "957-12345678"],
            ["pf-medicamento-nome-0", "Pembrolizumabe"],
            ["pf-medicamento-quantidade-0", "12 ampolas"], // ~14 caracteres cabem na Qtd.
            ["pf-local-entrega", "Rua das Flores 123, São Paulo"],
            ["pf-numero-processo", "25BR00001234567-8/2026"],
            // As 9 datas não são mais digitáveis (calendário próprio): não entram aqui. O texto antigo longo
            // delas é cortado com reticências dentro do botão (truncate), sem estourar o campo.
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

        test("grades: blocos na ordem do painel, colunas por faixa, campos longos em largura total, condicionais", async ({ page }) => {
          const tablet = viewport.width >= 640; // sm
          const b = async (id: string) => caixaNoCorpo(campo(page, id), id);
          const mesmaLinha = (a: Caixa, c: Caixa, nome: string) =>
            expect(Math.abs(a.y - c.y), `${nome} na mesma linha`).toBeLessThanOrEqual(1);
          const abaixoDe = (a: Caixa, ref: Caixa, nome: string) =>
            expect(a.y, `${nome} abaixo`).toBeGreaterThanOrEqual(embaixo(ref) - 1);

          // Largura útil do corpo (o conteúdo é uma coluna de até 720px, centralizada). Os blocos (fieldset) não têm mais
          // moldura (só a linha de cima): por dentro, a largura é a mesma.
          const util = Math.min(viewport.width, 720) - 2 * (viewport.width >= 720 ? 20 : 16);
          const interno = util;
          const col2 = (util - 10) / 2;
          const col3 = (util - 20) / 3;

          // 1. Paciente em linha inteira. 2. Pasta | PO em 2 colunas iguais e o Nº Ordem (5rem = 80px) na linha de baixo,
          // na borda esquerda. Ordem visual = ordem do DOM (sem order-*).
          const larguraRemessa = 80;
          const paciente = await b("pf-paciente");
          const pasta = await b("pf-pasta");
          const ordemPo = await b("pf-numero-po");
          const remessa = await caixaNoCorpo(campo(page, "pf-numero-remessa").locator("xpath=.."), "stepper do Nº Ordem");
          expect(paciente.width, "Paciente em largura total da coluna").toBeCloseTo(util, 0);
          mesmaLinha(pasta, ordemPo, "Pasta | PO");
          expect(ordemPo.x).toBeGreaterThanOrEqual(direita(pasta));
          expect(pasta.width, "Pasta, meia coluna").toBeCloseTo(col2, 0);
          expect(ordemPo.width, "PO, meia coluna").toBeCloseTo(col2, 0);
          abaixoDe(pasta, paciente, "Pasta");
          abaixoDe(remessa, pasta, "Nº Ordem (abaixo de Pasta)");
          expect(Math.abs(remessa.x - pasta.x), "Nº Ordem na borda esquerda").toBeLessThanOrEqual(1);
          expect(remessa.width, "Nº Ordem estreito").toBeCloseTo(larguraRemessa, 0);
          await campo(page, "pf-pasta").fill("2026234");
          expect(await campo(page, "pf-pasta").inputValue()).toBe("2026 - 234");
          expect(await campo(page, "pf-pasta").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5), "Pasta cortada").toBe(false);
          await campo(page, "pf-numero-po").fill("PO-25-2652/12345678901234567");
          expect((await campo(page, "pf-numero-po").inputValue()).length).toBeLessThanOrEqual(30);
          const ordemPoCheio = await b("pf-numero-po");
          expect(ordemPoCheio.width, "PO mantém a largura da coluna").toBeCloseTo(col2, 0);
          expect(direita(ordemPoCheio), "PO dentro da coluna útil").toBeLessThanOrEqual(paciente.x + util + 0.5);

          // Stepper do Nº Ordem: setas ▲/▼ empilhadas à direita, DENTRO da borda; campo de 44px; 2 dígitos sem rolar.
          const mais = await b("pf-numero-remessa-mais");
          const menos = await b("pf-numero-remessa-menos");
          const miolo = await b("pf-numero-remessa");
          expect(direita(miolo), "número termina antes das setas").toBeLessThanOrEqual(mais.x + 1);
          expect(direita(mais), "setas dentro da borda").toBeLessThanOrEqual(direita(remessa) + 1);
          expect(menos.y, "▼ abaixo de ▲").toBeGreaterThanOrEqual(embaixo(mais) - 1);
          expect(remessa.height, "campo de 44px").toBeGreaterThanOrEqual(44);
          await campo(page, "pf-numero-remessa").fill("12");
          expect(
            await campo(page, "pf-numero-remessa").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5),
            "Nº Ordem (2 dígitos) cortado",
          ).toBe(false);

          // 3. Medicamentos (bloco em largura total): Qtd. (10rem = 160px) | Medicamento (o resto); "+" e ✕ na linha de baixo.
          const fsMed = await caixaNoCorpo(page.locator("#pf-medicamento-nome-0").locator("xpath=ancestor::fieldset"), "fieldset Medicamentos");
          expect(fsMed.width).toBeCloseTo(util, 0);
          abaixoDe(fsMed, remessa, "Medicamentos");
          const mQtd = await b("pf-medicamento-quantidade-0");
          const mNome = await b("pf-medicamento-nome-0");
          await expect(campo(page, "pf-medicamento-dosagem-0")).toHaveCount(0);
          mesmaLinha(mQtd, mNome, "Qtd. | Medicamento");
          expect(mNome.x).toBeGreaterThan(direita(mQtd));
          expect(mQtd.width, "Qtd. estreita (10rem)").toBeCloseTo(160, 0);
          expect(mNome.width, "Medicamento ocupa o resto da linha").toBeCloseTo(interno - 160 - 8, 0);
          const mAdd = await caixaNoCorpo(page.locator("#processo-form button[title='Adicionar medicamento']"), "adicionar medicamento");
          abaixoDe(mAdd, modo === "editar" ? await b("pf-medicamento-nome-1") : mNome, "Adicionar");

          // 4. Fornecedor · Envio: celular, empilhados em largura total; tablet, 2 colunas iguais. "Qual fornecedor?" (Editar)
          // em linha inteira logo abaixo.
          const forn = await b("pf-fornecedor");
          const modal = await b("pf-modal");
          abaixoDe(forn, mAdd, "Fornecedor (depois dos Medicamentos)");
          if (!tablet) {
            expect(forn.width, "Fornecedor em largura total").toBeCloseTo(util, 0);
            expect(modal.width, "Envio em largura total").toBeCloseTo(util, 0);
            abaixoDe(modal, forn, "Envio");
          } else {
            mesmaLinha(forn, modal, "Fornecedor | Envio");
            expect(forn.width).toBeCloseTo(col2, 0);
            expect(modal.width).toBeCloseTo(col2, 0);
          }
          let fimBloco4 = modal;
          if (modo === "editar") {
            const outro = await b("pf-fornecedor-outro");
            expect(outro.width, "Qual fornecedor? em largura total").toBeCloseTo(util, 0);
            abaixoDe(outro, modal, "Qual fornecedor?");
            expect(outro.x, "sem pular pro lado").toBeLessThanOrEqual(forn.x + 1);
            fimBloco4 = outro;
          }

          // 5. Cia. aérea | Nº AWB (2 colunas) e Despachante em linha inteira no celular; tablet, os três em 3 colunas.
          const cia = await b("pf-cia-aerea");
          const awb = await b("pf-awb");
          const desp = await b("pf-despachante");
          abaixoDe(cia, fimBloco4, "Cia. aérea (depois de Fornecedor · Envio)");
          mesmaLinha(cia, awb, "Cia | AWB");
          expect(cia.width, "Cia e AWB com a mesma largura").toBeCloseTo(awb.width, 0);
          if (!tablet) {
            expect(cia.width).toBeCloseTo(col2, 0);
            expect(desp.width, "Despachante em linha inteira").toBeCloseTo(util, 0);
            abaixoDe(desp, cia, "Despachante");
          } else {
            mesmaLinha(awb, desp, "AWB | Despachante (3 colunas)");
            expect(cia.width).toBeCloseTo(col3, 0);
            expect(desp.width).toBeCloseTo(col3, 0);
          }
          await expect(page.locator("#pf-rastreio")).toHaveCount(0);

          // 6. Transportadora: Nome em largura total (celular) e Cotação | Valor lado a lado; tablet, 3 colunas. Local de
          // entrega em linha inteira, abaixo.
          const nome = await b("pf-transp-nome");
          const cot = await b("pf-transp-cotacao");
          const valor = await b("pf-transp-valor");
          abaixoDe(nome, desp, "Transportadora (depois do Despachante)");
          mesmaLinha(cot, valor, "Cotação | Valor");
          if (!tablet) {
            expect(nome.width, "Nome ocupa as 2 colunas").toBeGreaterThan(cot.width * 1.9);
            abaixoDe(cot, nome, "Cotação");
          } else {
            mesmaLinha(nome, cot, "Nome | Cotação (3 colunas)");
          }
          const local = await b("pf-local-entrega");
          expect(local.width, "Local de entrega em largura total").toBeCloseTo(interno, 0);
          abaixoDe(local, cot, "Local de entrega");

          // 7. Nº do processo em linha inteira.
          const numero = await b("pf-numero-processo");
          expect(numero.width, "Nº do processo em linha inteira").toBeCloseTo(interno, 0);
          abaixoDe(numero, local, "Nº do processo");

          // 8. Datas: 2 colunas no celular (3 no tablet); "Suposta estimativa" em largura total no celular.
          const d1 = await b("pf-data-po");
          const d2 = await b("pf-data-embarque");
          const d3 = await b("pf-thread");
          const suposta = await b("pf-suposta-estimativa");
          abaixoDe(d1, numero, "Datas (depois do Nº do processo)");
          mesmaLinha(d1, d2, "Compra | Embarque");
          if (modo === "novo") {
            for (const id of DATAS) await expect(campo(page, id), id).toHaveText("Escolher");
          }
          if (!tablet) {
            abaixoDe(d3, d1, "Abertura thread (2 colunas)");
            expect(suposta.width, "Suposta estimativa ocupa as 2 colunas").toBeGreaterThan(d1.width * 1.9);
          } else {
            mesmaLinha(d2, d3, "Embarque | Abertura thread (3 colunas)");
          }

          // 9. Pendências, depois das Datas.
          const pendencias = await caixaNoCorpo(page.locator("#btn-add-pendencia"), "+ Pendência");
          abaixoDe(pendencias, suposta, "Pendências (depois das Datas)");

          // 10. Controle do processo por último: celular, 1 coluna (Empresa, Responsável, Consultor, Status, Pagamento);
          // tablet, 2 colunas iguais.
          const empresa = await b("pf-empresa");
          const resp = await b("pf-responsavel");
          const consultor = await b("pf-consultor");
          const status = await b("pf-status");
          const pag = await b("pf-status-pagamento");
          abaixoDe(empresa, pendencias, "Controle do processo (depois das Pendências)");
          if (!tablet) {
            for (const [n, c] of [["Empresa", empresa], ["Responsável", resp], ["Consultor", consultor], ["Status", status], ["Pagamento", pag]] as const) {
              expect(c.width, `${n} em largura total`).toBeCloseTo(util, 0);
            }
            abaixoDe(resp, empresa, "Responsável");
            abaixoDe(consultor, resp, "Consultor");
            abaixoDe(status, consultor, "Status");
            abaixoDe(pag, status, "Pagamento");
          } else {
            mesmaLinha(empresa, resp, "Empresa | Responsável");
            mesmaLinha(consultor, status, "Consultor | Status");
            abaixoDe(pag, consultor, "Pagamento");
            for (const [n, c] of [["Empresa", empresa], ["Responsável", resp], ["Consultor", consultor], ["Status", status], ["Pagamento", pag]] as const) {
              expect(c.width, n).toBeCloseTo(col2, 0);
            }
          }
          expect(await page.locator("#pf-status-outro").count(), "Qual status? saiu do formulário").toBe(0);
        });

        test("campo focado nunca fica atrás do rodapé fixo (scroll-padding do corpo)", async ({ page }) => {
          // Com o teclado virtual aberto o navegador rola o campo focado pra dentro da área
          // visível; o scroll-padding-bottom do corpo desconta o rodapé sticky nessa conta.
          const ids = ["pf-numero-processo", "pf-local-entrega", "pf-awb", "pf-data-po", "pf-suposta-estimativa"];
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
            await campo(page, "pf-awb").fill("ZZ999999999BR");
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
            expect(m.corpo).toMatchObject({ numeroAwb: "ZZ999999999BR" });
          }
        });
      });
    }
  }
});
