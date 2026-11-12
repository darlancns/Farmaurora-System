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

        test("grades: blocos na ordem do painel, colunas, larguras e tamanhos de fonte dos campos", async ({ page }) => {
          // `pf-numero-remessa` é o stepper (número + setas ▲▼ DENTRO da mesma borda): a caixa medida é a do CONTÊINER
          // com a borda, que ocupa a coluna do grid inteira (o input é só a parte do número, à esquerda das setas).
          const b = (id: string) =>
            caixa(page.locator(id === "pf-numero-remessa" ? "#pf-numero-remessa >> xpath=.." : `#${id}`), id);
          const mesmaLinha = (a: Caixa, c: Caixa, nome: string) =>
            expect(Math.abs(a.y - c.y), `${nome} na mesma linha`).toBeLessThanOrEqual(1);
          const abaixo = (a: Caixa, ref: Caixa, nome: string) =>
            expect(a.y, `${nome} abaixo`).toBeGreaterThan(embaixo(ref) - 1);
          const util = 720 - 2 - 40; // largura do modal - bordas - padding do corpo
          const col2 = (util - 10) / 2;
          const col3 = (util - 2 * 10) / 3;
          // Os blocos (fieldset) não têm mais moldura: só a linha de cima. Por dentro, a largura é a útil.
          const interno = util;
          const larguraPasta = 112; // 7rem: a máscara "2026 - 234" (10 caracteres = 81px em mono 13,5px) + 22 = 103px; 9px de sobra
          const larguraPo = 112; // igual à Pasta: "PO-00-0000" também tem 10 caracteres
          const larguraRemessa = 80; // 5rem: 2 dígitos + as setas

          // 1. Paciente em linha inteira.
          const paciente = await b("pf-paciente");
          expect(paciente.width, "Paciente em linha inteira").toBeCloseTo(util, 0);

          // 2. Pasta | PO | Nº Ordem, na mesma linha, abaixo do Paciente, alinhados à esquerda.
          const pasta = await b("pf-pasta");
          const ordemPo = await b("pf-numero-po");
          const remessa = await b("pf-numero-remessa");
          mesmaLinha(pasta, ordemPo, "Pasta | PO");
          mesmaLinha(ordemPo, remessa, "PO | Nº Ordem");
          abaixo(pasta, paciente, "Pasta");
          expect(Math.abs(pasta.x - paciente.x), "Pasta na borda esquerda").toBeLessThanOrEqual(1);
          expect(ordemPo.x).toBeGreaterThan(direita(pasta));
          expect(remessa.x).toBeGreaterThan(direita(ordemPo));
          expect(pasta.width, "Pasta").toBeCloseTo(larguraPasta, 0);
          expect(ordemPo.width, "PO com a mesma largura da Pasta").toBeCloseTo(larguraPo, 0);
          expect(remessa.width, "Nº Ordem estreito").toBeCloseTo(larguraRemessa, 0);
          await page.locator("#pf-pasta").fill("2026234");
          expect(await page.locator("#pf-pasta").inputValue()).toBe("2026 - 234");
          expect(await page.locator("#pf-pasta").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5), "Pasta cortada").toBe(false);
          await page.locator("#pf-numero-po").fill("PO-25-2652");
          expect(await page.locator("#pf-numero-po").inputValue()).toBe("PO-25-2652");
          expect(await page.locator("#pf-numero-po").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5), "PO (10 caracteres) cortado").toBe(false);
          await page.locator("#pf-numero-po").fill("PO-25-2652/12345678901234567");
          expect((await b("pf-numero-po")).width, "PO mantém a largura com 30 caracteres").toBeCloseTo(larguraPo, 0);
          expect(await page.locator("#pf-numero-po").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5), "30 caracteres rolam dentro do campo").toBe(true);
          await page.locator("#pf-numero-remessa").fill("12");
          expect(
            await page.locator("#pf-numero-remessa").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5),
            "Nº Ordem (2 dígitos) cortado",
          ).toBe(false);

          // Stepper do Nº Ordem: UM campo (uma borda só), número à esquerda e as setas ▲/▼ empilhadas à direita, DENTRO da
          // borda, cada uma com metade da altura; a mesma altura de um campo de texto.
          const mais = await caixa(page.locator("#pf-numero-remessa-mais"), "▲");
          const menos = await caixa(page.locator("#pf-numero-remessa-menos"), "▼");
          const campoRemessa = await caixa(page.locator("#pf-numero-remessa"), "campo");
          expect(Math.abs(remessa.height - paciente.height), "mesma altura de um campo de texto").toBeLessThanOrEqual(1);
          for (const [nome, c] of [["▲", mais], ["▼", menos], ["número", campoRemessa]] as const) {
            expect(c.x, `${nome} dentro (esquerda)`).toBeGreaterThanOrEqual(remessa.x - 1);
            expect(direita(c), `${nome} dentro (direita)`).toBeLessThanOrEqual(direita(remessa) + 1);
            expect(c.y, `${nome} dentro (topo)`).toBeGreaterThanOrEqual(remessa.y - 1);
            expect(embaixo(c), `${nome} dentro (base)`).toBeLessThanOrEqual(embaixo(remessa) + 1);
          }
          expect(direita(campoRemessa)).toBeLessThanOrEqual(mais.x + 1);
          expect(Math.abs(mais.x - menos.x)).toBeLessThanOrEqual(1);
          expect(menos.y).toBeGreaterThanOrEqual(embaixo(mais) - 1);
          expect(await estilo(page.locator("#pf-numero-remessa >> xpath=.."), ["border-top-width", "border-top-left-radius"])).toEqual({
            "border-top-width": "1px",
            "border-top-left-radius": "6px",
          });

          // 3. Medicamentos: bloco em largura total; Qtd. (8,5rem) | Medicamento (o resto) | ações. Sem campo de dosagem.
          const fsMed = await caixa(page.locator("#pf-medicamento-nome-0").locator("xpath=ancestor::fieldset"), "fieldset Medicamentos");
          expect(fsMed.width).toBeCloseTo(util, 0);
          abaixo(fsMed, remessa, "Medicamentos");
          // O bloco tem a linha de cima e não tem moldura.
          expect(await estilo(page.locator("#pf-medicamento-nome-0").locator("xpath=ancestor::fieldset"), ["border-top-width", "border-left-width"])).toEqual({
            "border-top-width": "1px",
            "border-left-width": "0px",
          });
          const mQtd = await b("pf-medicamento-quantidade-0");
          const mNome = await b("pf-medicamento-nome-0");
          mesmaLinha(mQtd, mNome, "Qtd. | Medicamento");
          expect(mNome.x).toBeGreaterThan(direita(mQtd));
          expect(mQtd.width, "Qtd. estreita (8,5rem)").toBeCloseTo(8.5 * 16, 0);
          expect(mNome.width, "Medicamento ocupa o resto da linha").toBeGreaterThan(mQtd.width * 2);
          await expect(page.locator("#pf-medicamento-dosagem-0")).toHaveCount(0);
          const botaoAdd = await caixa(page.locator(`#processo-form button[title='Adicionar medicamento']`), "adicionar");
          const mNomeUltimo = modo === "editar" ? await b("pf-medicamento-nome-1") : mNome;
          expect(Math.abs(embaixo(mNomeUltimo) - embaixo(botaoAdd)), "Medicamento | + alinhados pela base (items-end)").toBeLessThanOrEqual(1);
          expect(botaoAdd.x).toBeGreaterThanOrEqual(direita(mNomeUltimo));
          expect(botaoAdd.width, "+ continua um botão pequeno").toBeLessThan(44);

          // 4. Fornecedor | Envio, 2 colunas iguais; "Qual fornecedor?" (Editar) em linha inteira logo abaixo.
          const forn = await b("pf-fornecedor");
          const modalEnvio = await b("pf-modal");
          mesmaLinha(forn, modalEnvio, "Fornecedor | Envio");
          expect(modalEnvio.x).toBeGreaterThan(direita(forn));
          expect(forn.width).toBeCloseTo(col2, 0);
          expect(modalEnvio.width).toBeCloseTo(col2, 0);
          abaixo(forn, fsMed, "Fornecedor (depois dos Medicamentos)");
          let fimBloco4 = forn;
          if (modo === "editar") {
            const fornOutro = await b("pf-fornecedor-outro");
            expect(fornOutro.width, "Qual fornecedor? em linha inteira").toBeCloseTo(interno, 0);
            expect(fornOutro.x, "sem pular pro lado").toBeLessThanOrEqual(forn.x + 1);
            abaixo(fornOutro, forn, "Qual fornecedor?");
            fimBloco4 = fornOutro;
          }

          // 5. Cia. aérea | Nº AWB | Despachante, 3 colunas iguais.
          const cia = await b("pf-cia-aerea");
          const awb = await b("pf-awb");
          const desp = await b("pf-despachante");
          mesmaLinha(cia, awb, "Cia. aérea | Nº AWB");
          mesmaLinha(awb, desp, "Nº AWB | Despachante");
          expect(awb.x).toBeGreaterThan(direita(cia));
          expect(desp.x).toBeGreaterThan(direita(awb));
          for (const [nome, c] of [["Cia. aérea", cia], ["Nº AWB", awb], ["Despachante", desp]] as const) {
            expect(c.width, nome).toBeCloseTo(col3, 0);
          }
          abaixo(cia, fimBloco4, "Cia. aérea (depois de Fornecedor · Envio)");
          await expect(page.locator("#pf-rastreio")).toHaveCount(0);

          // 6. Transportadora | Cotação | Valor em 3 colunas; Local de entrega em linha inteira, abaixo.
          const transp = await Promise.all(["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor"].map(b));
          mesmaLinha(transp[0]!, transp[1]!, "Transportadora | Cotação");
          mesmaLinha(transp[1]!, transp[2]!, "Cotação | Valor");
          expect(transp[1]!.x).toBeGreaterThan(direita(transp[0]!));
          expect(transp[2]!.x).toBeGreaterThan(direita(transp[1]!));
          abaixo(transp[0]!, desp, "Transportadora (depois do Despachante)");
          const local = await b("pf-local-entrega");
          expect(local.width, "Local de entrega em linha inteira").toBeCloseTo(interno, 0);
          abaixo(local, transp[0]!, "Local de entrega");

          // 7. Nº do processo em linha inteira (sem teto).
          const numeroProcesso = await b("pf-numero-processo");
          expect(numeroProcesso.width, "Nº do processo em linha inteira").toBeCloseTo(interno, 0);
          abaixo(numeroProcesso, local, "Nº do processo");

          // 8. Datas: 4 colunas (Suposta estimativa sozinha na 3ª linha, 1 coluna).
          const datas = await Promise.all(
            ["pf-data-po", "pf-data-embarque", "pf-thread", "pf-chegada", "pf-radar", "pf-duimp", "pf-lpco", "pf-previsao", "pf-suposta-estimativa"].map(b),
          );
          if (modo === "novo") {
            for (const id of ["pf-data-po", "pf-data-embarque", "pf-thread", "pf-chegada", "pf-radar", "pf-duimp", "pf-lpco", "pf-previsao", "pf-suposta-estimativa"]) {
              await expect(page.locator(`#${id}`), id).toHaveText("Escolher");
            }
          }
          abaixo(datas[0]!, numeroProcesso, "Datas (depois do Nº do processo)");
          for (const i of [1, 2, 3]) mesmaLinha(datas[0]!, datas[i]!, `data ${i}`);
          for (const i of [5, 6, 7]) mesmaLinha(datas[4]!, datas[i]!, `data ${i}`);
          expect(datas[4]!.y).toBeGreaterThan(embaixo(datas[0]!) - 1);
          expect(datas[8]!.y).toBeGreaterThan(embaixo(datas[4]!) - 1);
          expect(datas[8]!.width).toBeCloseTo(datas[0]!.width, 0);

          // 9. Pendências, depois das Datas.
          const addPendencia = await caixa(page.locator("#btn-add-pendencia"), "+ Pendência");
          abaixo(addPendencia, datas[8]!, "Pendências");

          // 10. Controle do processo, por último: Empresa | Responsável // Consultor | Status // Pagamento (2 colunas iguais).
          const empresa = await b("pf-empresa");
          const resp = await b("pf-responsavel");
          const consultor = await b("pf-consultor");
          const status = await b("pf-status");
          const pag = await b("pf-status-pagamento");
          abaixo(empresa, addPendencia, "Controle do processo (depois das Pendências)");
          mesmaLinha(empresa, resp, "Empresa | Responsável");
          mesmaLinha(consultor, status, "Consultor | Status");
          abaixo(consultor, empresa, "Consultor");
          abaixo(pag, consultor, "Pagamento");
          expect(Math.abs(pag.x - empresa.x), "Pagamento na 1ª coluna").toBeLessThanOrEqual(1);
          for (const [nome, c] of [["Empresa", empresa], ["Responsável", resp], ["Consultor", consultor], ["Status", status], ["Pagamento", pag]] as const) {
            expect(c.width, nome).toBeCloseTo(col2, 0);
          }
          const salvar = await caixa(page.locator("#btn-save-processo"), "salvar");
          abaixo(salvar, pag, "Salvar (fecha o formulário)");

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
