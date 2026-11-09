import { test, expect, type Locator, type Page } from "@playwright/test";

// Formulário "Novo processo" / "Editar processo" em lg+ (>= 1024px): o refino mobile/tablet
// (tela cheia, rodapé fixo, campos de 44px/16px) não pode ter mexido em NADA aqui. Este spec
// trava os valores de hoje — dimensões e posição do modal, paddings, gaps, tamanhos de fonte,
// colunas de cada grade e a lista do AppSelect — com asserções explícitas (os números
// vieram do baseline capturado antes da mudança e conferido pixel a pixel com `cmp`).
//
// Cria 1 processo de teste via API (pro modo Editar) e SEMPRE o apaga no afterAll. Nada é salvo
// pelo formulário.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — precisa de escrita em processos)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const RUN = String(Date.now()).slice(-9);

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
    { nome: "Nivolumabe", dosagem: "40mg", quantidade: "2 cx" },
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

const VIEWPORTS = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const MODOS = ["novo", "editar"] as const;
type Modo = (typeof MODOS)[number];

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

// Caixa em coordenadas do conteúdo do <form> (independe da rolagem).
async function caixa(locator: Locator, nome: string): Promise<Caixa> {
  const c = await locator.first().evaluate((el) => {
    const form = document.querySelector("#processo-form")!;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.top - form.getBoundingClientRect().top + form.scrollTop, width: r.width, height: r.height };
  });
  expect(c.width, `${nome} sem caixa (oculto?)`).toBeGreaterThan(0);
  return c;
}

const estilo = (locator: Locator, props: string[]) =>
  locator.first().evaluate((el, ps) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
  }, props);

async function abrirModal(page: Page, modo: Modo): Promise<void> {
  if (modo === "novo") {
    await page.locator("#btn-novo-processo").click();
  } else {
    // A busca (RUN) acha só este processo: o grupo e o detalhe já abrem sozinhos. Idempotente: só clica
    // no que ainda estiver fechado (clicar de novo no que abriu sozinho o FECHARIA).
    if (!(await page.locator(`#processo-row-${processoId}`).isVisible())) {
      await page.locator("#processo-group-list button").filter({ hasText: "Alessandra" }).first().click();
    }
    if (!(await page.locator(`#processo-detail-${processoId}`).isVisible())) {
      await page.locator(`#processo-row-${processoId} > button`).click();
    }
    await page
      .locator(`#btn-edit-processo-${processoId}, #btn-edit-processo-footer-${processoId}`)
      .locator("visible=true")
      .first()
      .click();
  }
  await expect(page.locator("#processo-form")).toBeVisible();
}

test.describe("/processos em lg+ — formulário Novo/Editar processo (idêntico ao de antes)", () => {
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
        test.beforeEach(async ({ page }) => {
          expect(processoId, "processo de teste não foi criado").not.toBeNull();
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await login(page);
          await page.goto("/processos", { waitUntil: "networkidle" });
          await expect(page.locator("#tab-andamento")).toBeVisible();
          await page.locator("#processo-search").fill(RUN);
          await abrirModal(page, modo);
        });

        test("modal centralizado de 720px com cantos e borda de antes; cabeçalho, corpo e botão de salvar no lugar", async ({ page }) => {
          const modal = page.locator("#processo-form-modal-overlay > div");
          const m = (await modal.boundingBox())!;
          expect(m.width).toBe(720);
          expect(m.x).toBeCloseTo((viewport.width - 720) / 2, 0);
          expect(m.height).toBeLessThanOrEqual(viewport.height * 0.9 + 0.5);
          expect(m.y + m.height / 2, "centralizado na vertical").toBeCloseTo(viewport.height / 2, 0);
          expect(await estilo(modal, ["position", "border-top-width", "border-top-left-radius", "max-width", "max-height"])).toEqual({
            position: "static",
            "border-top-width": "1px",
            "border-top-left-radius": "10px",
            "max-width": "720px",
            "max-height": `${viewport.height * 0.9}px`,
          });
          await expect(page.locator("#bottom-nav")).toBeHidden();

          // Cabeçalho: padding 16px 20px; fechar pequeno (não é o alvo de 44px do mobile).
          const fechar = page.locator("#btn-close-processo-form");
          const cab = fechar.locator("xpath=..");
          expect(await estilo(cab, ["padding-top", "padding-left", "border-bottom-width"])).toEqual({
            "padding-top": "16px",
            "padding-left": "20px",
            "border-bottom-width": "1px",
          });
          expect(await estilo(fechar, ["display", "padding-top", "padding-left"])).toEqual({ display: "block", "padding-top": "4px", "padding-left": "8px" });
          const fb = (await fechar.boundingBox())!;
          expect(fb.width).toBeLessThan(40);
          expect(fb.height).toBeLessThan(40);

          // Corpo: o próprio <form> rola, com padding de 20px e gap de 14px.
          const form = page.locator("#processo-form");
          expect(
            await estilo(form, ["overflow-y", "padding-top", "padding-left", "padding-bottom", "row-gap", "overscroll-behavior-y", "scroll-padding-bottom"]),
          ).toEqual({
            "overflow-y": "auto",
            "padding-top": "20px",
            "padding-left": "20px",
            "padding-bottom": "20px",
            "row-gap": "14px",
            "overscroll-behavior-y": "auto",
            "scroll-padding-bottom": "auto",
          });

          // Rodapé "some" (contents) e Cancelar não existe visualmente: só o botão de salvar no fim do corpo.
          await expect(page.locator("#btn-cancel-processo")).toBeHidden();
          const rodape = page.locator("#btn-save-processo").locator("xpath=..");
          expect(await estilo(rodape, ["display"])).toEqual({ display: "contents" });
          await form.evaluate((f) => { f.scrollTop = f.scrollHeight; });
          const salvar = (await page.locator("#btn-save-processo").boundingBox())!;
          const fm = (await form.boundingBox())!;
          expect(salvar.width, "salvar em largura total do corpo").toBeCloseTo(fm.width - 40, 0);
          expect(Math.abs(embaixo(salvar) + 20 - embaixo(fm)), "salvar no fim do corpo, com o padding de 20px").toBeLessThanOrEqual(1);
          expect(await estilo(page.locator("#btn-save-processo"), ["margin-top", "font-size", "flex-grow", "flex-shrink", "min-height"])).toEqual({
            "margin-top": "4px",
            "font-size": "13px",
            "flex-grow": "0",
            "flex-shrink": "1",
            "min-height": "auto",
          });
          // Sem overflow horizontal.
          expect(await form.evaluate((f) => f.scrollWidth > f.clientWidth + 1)).toBe(false);
        });

        test("grades: colunas, larguras e tamanhos de fonte dos campos como antes", async ({ page }) => {
          // `pf-numero-remessa` é o stepper (número + setas ▲▼ DENTRO da mesma borda): a caixa medida é a do CONTÊINER
          // com a borda, que ocupa a coluna do grid inteira (o input é só a parte do número, à esquerda das setas).
          const b = (id: string) =>
            caixa(page.locator(id === "pf-numero-remessa" ? "#pf-numero-remessa >> xpath=.." : `#${id}`), id);
          const mesmaLinha = (a: Caixa, c: Caixa, nome: string) =>
            expect(Math.abs(a.y - c.y), `${nome} na mesma linha`).toBeLessThanOrEqual(1);
          const util = 720 - 2 - 40; // largura do modal - bordas - padding do corpo
          const col2 = (util - 10) / 2;
          const col3 = (util - 2 * 10) / 3;
          // Linha 1: Paciente (flexível) | Pasta (7rem = 112px) | Nº Ordem (10,5rem = 168px) com 2 espaços de 10px.
          const larguraPasta = 112;
          const larguraPo = 168;
          const larguraPaciente = util - larguraPasta - larguraPo - 2 * 10; // 378px
          // Linha 2: Nº Remessa (5rem = 80px) | Nº do processo (TODO o resto da linha, sem teto: 678 − 80 − 10 = 588px).
          const larguraRemessa = 80;
          const larguraNumeroProcesso = util - larguraRemessa - 10;
          // Dentro de um fieldset: borda 1+1 e padding 12+12.
          const interno = util - 2 - 24;
          const colEnvio = (interno - 2 * 10) / 3;

          // Linha 1: Paciente | Pasta | Nº Ordem, todos na mesma linha, nessa ordem.
          const paciente = await b("pf-paciente");
          const pasta = await b("pf-pasta");
          const ordemPo = await b("pf-numero-po");
          for (const [nome, c] of [["Pasta", pasta], ["Nº Ordem", ordemPo]] as const) mesmaLinha(paciente, c, `Paciente | ${nome}`);
          expect(pasta.x).toBeGreaterThan(direita(paciente));
          expect(ordemPo.x).toBeGreaterThan(direita(pasta));
          expect(paciente.width, "Paciente").toBeCloseTo(larguraPaciente, 0);
          expect(pasta.width, "Pasta").toBeCloseTo(larguraPasta, 0);
          expect(ordemPo.width, "Nº Ordem").toBeCloseTo(larguraPo, 0);
          expect(direita(ordemPo), "linha 1 ocupa a largura útil").toBeCloseTo(paciente.x + util, 0);
          // A Pasta comporta o MAIOR valor da máscara ("2026 - 234" = 10 caracteres, mono 13,5px) com o padding de sempre
          // (10px), sem cortar (o texto vem do `fill`, que passa pela máscara do campo).
          await page.locator("#pf-pasta").fill("2026234");
          expect(await page.locator("#pf-pasta").inputValue()).toBe("2026 - 234");
          expect(await page.locator("#pf-pasta").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5), "Pasta cortada").toBe(false);

          // Linha 2: Nº Remessa (estreito) | Nº do processo, abaixo da linha 1. O Nº Remessa sai da linha 1.
          const remessa = await b("pf-numero-remessa");
          const numeroProcesso = await b("pf-numero-processo");
          mesmaLinha(remessa, numeroProcesso, "Nº Remessa | Nº do processo");
          expect(remessa.y).toBeGreaterThan(embaixo(paciente) - 1);
          expect(Math.abs(remessa.x - paciente.x), "Nº Remessa na borda esquerda").toBeLessThanOrEqual(1);
          expect(remessa.width, "Nº Remessa estreito").toBeCloseTo(larguraRemessa, 0);
          expect(numeroProcesso.x).toBeGreaterThan(direita(remessa));
          expect(numeroProcesso.width, "Nº do processo: todo o resto da linha (sem teto)").toBeCloseTo(larguraNumeroProcesso, 0);
          // O fim do Nº do processo coincide com o fim do Nº Ordem (a mesma borda direita da linha 1) e com a borda útil.
          expect(direita(numeroProcesso), "Nº do processo termina onde termina o Nº Ordem").toBeCloseTo(direita(ordemPo), 0);
          expect(direita(numeroProcesso), "Nº do processo vai até a borda útil").toBeCloseTo(paciente.x + util, 0);
          // 2 dígitos cabem sem rolar (o texto vem do `fill`, que passa pelo filtro do campo).
          await page.locator("#pf-numero-remessa").fill("12");
          expect(
            await page.locator("#pf-numero-remessa").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5),
            "Nº Remessa (2 dígitos) cortado",
          ).toBe(false);

          // Grade 2x2: Empresa | Responsável // Consultor | Fornecedor, em 2 colunas iguais.
          const empresa = await b("pf-empresa");
          const resp = await b("pf-responsavel");
          const consultor = await b("pf-consultor");
          const forn = await b("pf-fornecedor");
          mesmaLinha(empresa, resp, "Empresa | Responsável");
          mesmaLinha(consultor, forn, "Consultor | Fornecedor");
          expect(resp.x).toBeGreaterThan(direita(empresa));
          expect(forn.x).toBeGreaterThan(direita(consultor));
          expect(consultor.y).toBeGreaterThan(embaixo(empresa) - 1);
          for (const [nome, c] of [["Empresa", empresa], ["Responsável", resp], ["Consultor", consultor], ["Fornecedor", forn]] as const) {
            expect(c.width, nome).toBeCloseTo(col2, 0);
          }

          // Status | Pagamento: 2 colunas iguais, abaixo da grade 2x2 (e do "Qual fornecedor?", se houver).
          const status = await b("pf-status");
          const pag = await b("pf-status-pagamento");
          mesmaLinha(status, pag, "Status | Pagamento");
          expect(pag.x).toBeGreaterThan(direita(status));
          expect(status.width).toBeCloseTo(col2, 0);
          expect(pag.width).toBeCloseTo(col2, 0);
          expect(status.y).toBeGreaterThan(embaixo(forn) - 1);

          // Envio internacional (fieldset): Modal | Cia. aérea | Nº AWB em 3 colunas iguais (sem Rastreio, sem buraco).
          const fsEnvio = await caixa(page.locator("#pf-modal").locator("xpath=ancestor::fieldset"), "fieldset Envio internacional");
          expect(fsEnvio.width).toBeCloseTo(util, 0);
          expect(fsEnvio.y).toBeGreaterThan(embaixo(status) - 1);
          const modalEnvio = await b("pf-modal");
          const cia = await b("pf-cia-aerea");
          const awb = await b("pf-awb");
          mesmaLinha(modalEnvio, cia, "Modal | Cia. aérea");
          mesmaLinha(cia, awb, "Cia. aérea | Nº AWB");
          expect(cia.x).toBeGreaterThan(direita(modalEnvio));
          expect(awb.x).toBeGreaterThan(direita(cia));
          for (const [nome, c] of [["Modal", modalEnvio], ["Cia. aérea", cia], ["Nº AWB", awb]] as const) {
            expect(c.width, nome).toBeCloseTo(colEnvio, 0);
          }
          await expect(page.locator("#pf-rastreio")).toHaveCount(0);

          // Despachante: FORA do bloco, logo depois dele, 1 coluna de 3.
          const desp = await b("pf-despachante");
          expect(desp.width).toBeCloseTo(col3, 0);
          expect(desp.y).toBeGreaterThan(embaixo(fsEnvio) - 1);
          expect(await page.locator("#pf-despachante").evaluate((el) => el.closest("fieldset") === null)).toBe(true);

          // Transportadora nacional: Nome | Cotação | Valor em 3 colunas, abaixo do Despachante.
          const transp = await Promise.all(["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor"].map(b));
          mesmaLinha(transp[0]!, transp[1]!, "Nome | Cotação");
          mesmaLinha(transp[1]!, transp[2]!, "Cotação | Valor");
          expect(transp[1]!.x).toBeGreaterThan(direita(transp[0]!));
          expect(transp[2]!.x).toBeGreaterThan(direita(transp[1]!));
          expect(transp[0]!.y).toBeGreaterThan(embaixo(desp) - 1);

          // Stepper do Nº Remessa em lg+: UM campo (uma borda só) com o número à esquerda e, à direita DENTRO da borda, as
          // setas ▲ (em cima) e ▼ (embaixo) empilhadas, cada uma com metade da altura. O contêiner ocupa a coluna inteira e
          // tem a MESMA altura de um campo de texto (não aumenta a linha).
          const mais = await caixa(page.locator("#pf-numero-remessa-mais"), "▲");
          const menos = await caixa(page.locator("#pf-numero-remessa-menos"), "▼");
          const campoRemessa = await caixa(page.locator("#pf-numero-remessa"), "campo");
          expect(remessa.width, "o campo ocupa a coluna inteira (5rem)").toBeCloseTo(larguraRemessa, 0);
          expect(Math.abs(remessa.height - paciente.height), "mesma altura de um campo de texto").toBeLessThanOrEqual(1);
          // Tudo dentro da borda do contêiner.
          for (const [nome, c] of [["▲", mais], ["▼", menos], ["número", campoRemessa]] as const) {
            expect(c.x, `${nome} dentro (esquerda)`).toBeGreaterThanOrEqual(remessa.x - 1);
            expect(direita(c), `${nome} dentro (direita)`).toBeLessThanOrEqual(direita(remessa) + 1);
            expect(c.y, `${nome} dentro (topo)`).toBeGreaterThanOrEqual(remessa.y - 1);
            expect(embaixo(c), `${nome} dentro (base)`).toBeLessThanOrEqual(embaixo(remessa) + 1);
          }
          // Número à esquerda, setas à direita, sem o número ficar por baixo das setas.
          expect(direita(campoRemessa)).toBeLessThanOrEqual(mais.x + 1);
          // Setas empilhadas: mesma coluna (x e largura de 31–32px), ▲ acima de ▼, metade da altura cada.
          expect(Math.abs(mais.x - menos.x)).toBeLessThanOrEqual(1);
          expect(mais.width).toBeGreaterThanOrEqual(30);
          expect(mais.width).toBeLessThanOrEqual(32);
          expect(Math.abs(mais.width - menos.width)).toBeLessThanOrEqual(1);
          expect(menos.y).toBeGreaterThanOrEqual(embaixo(mais) - 1);
          expect(Math.abs(mais.height - menos.height)).toBeLessThanOrEqual(1.5);
          expect(mais.height, "cada seta ≈ metade da altura do campo").toBeCloseTo((remessa.height - 2) / 2, 0);
          // A borda é do contêiner: o input não tem borda própria.
          expect(await estilo(page.locator("#pf-numero-remessa"), ["border-top-width", "border-left-width"])).toEqual({
            "border-top-width": "0px",
            "border-left-width": "0px",
          });
          expect(await estilo(page.locator("#pf-numero-remessa >> xpath=.."), ["border-top-width", "border-top-left-radius"])).toEqual({
            "border-top-width": "1px",
            "border-top-left-radius": "6px",
          });

          // Condicionais (só no modo Editar): largura total, abaixo da linha do select. "Qual fornecedor?" fica logo abaixo da
          // grade 2x2 (antes de Status | Pagamento) e "Qual status?" logo abaixo de Status | Pagamento (antes do Envio internacional).
          if (modo === "editar") {
            const statusOutro = await b("pf-status-outro");
            expect(statusOutro.width).toBeCloseTo(util, 0);
            expect(statusOutro.y).toBeGreaterThan(embaixo(await b("pf-status-pagamento")) - 1);
            expect(statusOutro.y + statusOutro.height).toBeLessThanOrEqual((await b("pf-modal")).y);
            const fornOutro = await b("pf-fornecedor-outro");
            expect(fornOutro.width).toBeCloseTo(util, 0);
            expect(fornOutro.x, "sem pular pro lado").toBeLessThanOrEqual(empresa.x + 1);
            expect(fornOutro.y).toBeGreaterThan(embaixo(forn) - 1);
            expect(fornOutro.y).toBeLessThan((await b("pf-status")).y);
            // Nenhuma célula da grade 2x2 se mexeu por causa do condicional (a posição vem do mesmo `b`, já com ele aberto).
            expect(forn.y).toBeCloseTo(consultor.y, 0);
          }

          // Transportadora nacional: fieldset de 3 colunas dentro do padding de 12px.
          const fieldset = await caixa(page.locator("#pf-transp-nome").locator("xpath=ancestor::fieldset"), "fieldset");
          expect(fieldset.width).toBeCloseTo(util, 0);

          // Medicamento: Qtd. (8,5rem = 136px) | Medicamento (o resto) | ações, tudo na mesma linha. Sem campo de dosagem.
          const mQtd = await b("pf-medicamento-quantidade-0");
          const mNome = await b("pf-medicamento-nome-0");
          mesmaLinha(mQtd, mNome, "Qtd. | Medicamento");
          expect(mNome.x).toBeGreaterThan(direita(mQtd));
          expect(mQtd.width, "Qtd. estreita (8,5rem)").toBeCloseTo(8.5 * 16, 0);
          expect(mNome.width, "Medicamento ocupa o resto da linha").toBeGreaterThan(mQtd.width * 2);
          await expect(page.locator("#pf-medicamento-dosagem-0")).toHaveCount(0);
          const botaoAdd = await caixa(page.locator(`#processo-form button[title='Adicionar medicamento']`), "adicionar");
          // Os botões só existem a partir do 2º item (✕) e no último (+): o "+" fica à direita do Medicamento, alinhado pela base.
          const mQtdUltimo = modo === "editar" ? await b("pf-medicamento-quantidade-1") : mQtd;
          const mNomeUltimo = modo === "editar" ? await b("pf-medicamento-nome-1") : mNome;
          mesmaLinha(mQtdUltimo, mNomeUltimo, "Qtd. | Medicamento (último item)");
          expect(Math.abs(embaixo(mNomeUltimo) - embaixo(botaoAdd)), "Medicamento | + alinhados pela base (items-end)").toBeLessThanOrEqual(1);
          expect(botaoAdd.x).toBeGreaterThanOrEqual(direita(mNomeUltimo));
          expect(botaoAdd.width, "+ continua um botão pequeno").toBeLessThan(44);
          if (modo === "editar") {
            // Ordem dos botões (como sempre foi): ✕ (remover) e depois "+", na mesma linha.
            const remover = await caixa(page.locator(`#processo-form button[title='Remover medicamento']`), "remover");
            expect(botaoAdd.x).toBeGreaterThanOrEqual(direita(remover) - 1);
            expect(Math.abs(embaixo(remover) - embaixo(botaoAdd)), "✕ e + na mesma linha").toBeLessThanOrEqual(1);
          }

          // Datas: 4 colunas (Suposta estimativa sozinha na 3ª linha, 1 coluna).
          const datas = await Promise.all(
            ["pf-data-po", "pf-data-embarque", "pf-thread", "pf-chegada", "pf-radar", "pf-duimp", "pf-lpco", "pf-previsao", "pf-suposta-estimativa"].map(b),
          );
          if (modo === "novo") {
            // Campo de data vazio: só "Escolher" (o texto-guia não leva mais a palavra "data").
            for (const id of ["pf-data-po", "pf-data-embarque", "pf-thread", "pf-chegada", "pf-radar", "pf-duimp", "pf-lpco", "pf-previsao", "pf-suposta-estimativa"]) {
              await expect(page.locator(`#${id}`), id).toHaveText("Escolher");
            }
          }
          for (const i of [1, 2, 3]) mesmaLinha(datas[0]!, datas[i]!, `data ${i}`);
          for (const i of [5, 6, 7]) mesmaLinha(datas[4]!, datas[i]!, `data ${i}`);
          expect(datas[4]!.y).toBeGreaterThan(embaixo(datas[0]!) - 1);
          expect(datas[8]!.y).toBeGreaterThan(embaixo(datas[4]!) - 1);
          expect(datas[8]!.width).toBeCloseTo(datas[0]!.width, 0);

          // Medicamentos e local de entrega: o fieldset vem logo depois da linha 1 e o Local de entrega fecha o bloco,
          // em largura total dentro dele.
          const fsMed = await caixa(page.locator("#pf-medicamento-nome-0").locator("xpath=ancestor::fieldset"), "fieldset Medicamentos");
          expect(fsMed.width).toBeCloseTo(util, 0);
          expect(fsMed.y).toBeGreaterThan(embaixo(remessa) - 1);
          expect(embaixo(fsMed)).toBeLessThanOrEqual(empresa.y);
          const local = await b("pf-local-entrega");
          expect(local.width, "Local de entrega em largura total do bloco").toBeCloseTo(interno, 0);
          expect(local.y).toBeGreaterThan(embaixo(mNome) - 1);
          expect(embaixo(local)).toBeLessThanOrEqual(embaixo(fsMed));
          // Datas vêm depois de tudo isso, e as Pendências por último.
          const fsDatas = await caixa(page.locator("#pf-data-po").locator("xpath=ancestor::fieldset"), "fieldset Datas");
          expect(fsDatas.y).toBeGreaterThan(embaixo(transp[0]!) - 1);

          // Fontes e alturas de lg (13.5 / 13 / 12.5; sem min-height; labels de 10.5px).
          const fontes: Record<string, string> = {
            "pf-paciente": "13.5px",
            "pf-pasta": "13.5px",
            "pf-numero-remessa": "13.5px", // o número usa a mesma fonte e o mesmo padding dos demais campos
            "pf-empresa": "13.5px",
            "pf-awb": "13.5px",
            "pf-medicamento-nome-0": "13px",
            "pf-data-po": "12.5px",
            "pf-suposta-estimativa": "12.5px",
            "pf-numero-processo": "13.5px",
          };
          for (const [id, fonte] of Object.entries(fontes)) {
            const e = await estilo(page.locator(`#${id}`), ["font-size", "min-height", "padding-top", "padding-left"]);
            expect(e, id).toEqual({ "font-size": fonte, "min-height": expect.stringMatching(/^(auto|0px)$/), "padding-top": "8px", "padding-left": "10px" });
          }
          expect(await estilo(page.locator("label[for='pf-paciente']"), ["font-size", "margin-bottom"])).toEqual({ "font-size": "10.5px", "margin-bottom": "6px" });
          // Altura de um campo de texto de antes: padding 8+8, borda 1+1 e a linha da fonte (sem piso de 44px).
          expect((await b("pf-paciente")).height).toBeLessThan(44);
          expect((await b("pf-paciente")).height).toBeGreaterThan(30);
        });

        test("lista do AppSelect: absoluta logo abaixo do campo, w-max, até 224px, como antes", async ({ page }) => {
          for (const id of ["pf-empresa", "pf-consultor", "pf-modal"]) {
            await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ block: "center" }));
            await page.locator(`#${id}`).click();
            const lista = page.locator(`#${id}-listbox`);
            await expect(lista).toBeVisible();
            const e = await estilo(lista, ["position", "margin-top", "max-height", "min-width", "max-width", "right", "bottom"]);
            expect(e.position).toBe("absolute");
            expect(e["margin-top"]).toBe("4px");
            expect(e["max-height"]).toBe("224px");
            const campo = (await page.locator(`#${id}`).boundingBox())!;
            const l = (await lista.boundingBox())!;
            expect(l.x, `${id}: alinhada à esquerda do campo`).toBeCloseTo(campo.x, 0);
            expect(l.y, `${id}: 4px abaixo do campo`).toBeCloseTo(embaixo(campo) + 4, 0);
            expect(l.width).toBeGreaterThanOrEqual(campo.width - 0.5);
            expect(l.width).toBeLessThanOrEqual(320 + 0.5); // max-w-[min(20rem,90vw)]
            const alturaOpcao = await lista.locator("li").first().evaluate((li) => li.getBoundingClientRect().height);
            expect(alturaOpcao, `${id}: opção compacta (não vira alvo de 44px)`).toBeLessThan(40);
            await page.locator(`#${id}`).click(); // fecha (Esc fecharia o modal inteiro — comportamento do BaseModal)
            await expect(lista).toHaveCount(0);
          }
        });
      });
    }
  }
});
