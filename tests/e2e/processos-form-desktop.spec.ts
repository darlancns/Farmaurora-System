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
    await page.locator("#processo-group-list button").filter({ hasText: "Alessandra" }).first().click();
    await page.locator(`#processo-row-${processoId} > button`).click();
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
          const b = (id: string) => caixa(page.locator(`#${id}`), id);
          const mesmaLinha = (a: Caixa, c: Caixa, nome: string) =>
            expect(Math.abs(a.y - c.y), `${nome} na mesma linha`).toBeLessThanOrEqual(1);
          const util = 720 - 2 - 40; // largura do modal - bordas - padding do corpo
          const col3 = (util - 2 * 10) / 3;

          // Paciente (2 colunas) | Pasta (1) e Ordem | Empresa | Consultor (3 grids de 3 colunas).
          const paciente = await b("pf-paciente");
          const pasta = await b("pf-pasta");
          mesmaLinha(paciente, pasta, "Paciente | Pasta");
          expect(paciente.width).toBeCloseTo(2 * col3 + 10, 0);
          expect(pasta.width).toBeCloseTo(col3, 0);
          const linhas3 = [
            ["pf-ordem", "pf-empresa", "pf-consultor"],
            ["pf-status", "pf-responsavel", "pf-status-pagamento"],
            ["pf-despachante", "pf-fornecedor", "pf-modal"],
            ["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor"],
            ["pf-cia-aerea", "pf-awb", "pf-rastreio"],
          ];
          for (const ids of linhas3) {
            const caixas = await Promise.all(ids.map(b));
            mesmaLinha(caixas[0]!, caixas[1]!, `${ids[0]} | ${ids[1]}`);
            mesmaLinha(caixas[1]!, caixas[2]!, `${ids[1]} | ${ids[2]}`);
            expect(caixas[1]!.x).toBeGreaterThan(direita(caixas[0]!));
            expect(caixas[2]!.x).toBeGreaterThan(direita(caixas[1]!));
            if (!ids[0]!.startsWith("pf-transp")) expect(caixas[0]!.width, ids[0]).toBeCloseTo(col3, 0);
          }
          // Pasta e Ordem NÃO ficam na mesma linha em lg (são grids diferentes, como antes).
          expect((await b("pf-ordem")).y).toBeGreaterThan(embaixo(pasta) - 1);

          // Condicionais (só no modo Editar): largura total, abaixo da linha do select.
          if (modo === "editar") {
            const statusOutro = await b("pf-status-outro");
            expect(statusOutro.width).toBeCloseTo(util, 0);
            expect(statusOutro.y).toBeGreaterThan(embaixo(await b("pf-status-pagamento")) - 1);
            const fornOutro = await b("pf-fornecedor-outro");
            expect(fornOutro.width).toBeCloseTo(util, 0);
            expect(fornOutro.y).toBeGreaterThan(embaixo(await b("pf-modal")) - 1);
          }

          // Transportadora nacional: fieldset de 3 colunas dentro do padding de 12px.
          const fieldset = await caixa(page.locator("#pf-transp-nome").locator("xpath=ancestor::fieldset"), "fieldset");
          expect(fieldset.width).toBeCloseTo(util, 0);

          // Medicamento: 4 colunas na mesma linha (Nome 1.4fr, Dosagem 1fr, Quantidade 0.7fr, ações).
          const mNome = await b("pf-medicamento-nome-0");
          const mDos = await b("pf-medicamento-dosagem-0");
          const mQtd = await b("pf-medicamento-quantidade-0");
          mesmaLinha(mNome, mDos, "Nome | Dosagem");
          mesmaLinha(mDos, mQtd, "Dosagem | Quantidade");
          expect(mNome.width / mDos.width).toBeCloseTo(1.4, 1);
          expect(mQtd.width / mDos.width).toBeCloseTo(0.7, 1);
          const botaoAdd = await caixa(page.locator(`#processo-form button[title='Adicionar medicamento']`), "adicionar");
          // O "+" só existe no último item (o 2º no modo Editar).
          const qtdUltimo = modo === "editar" ? await b("pf-medicamento-quantidade-1") : mQtd;
          expect(Math.abs(embaixo(qtdUltimo) - embaixo(botaoAdd)), "Quantidade | + alinhados pela base (items-end)").toBeLessThanOrEqual(1);
          expect(botaoAdd.x).toBeGreaterThanOrEqual(direita(qtdUltimo));
          expect(botaoAdd.width, "+ continua um botão pequeno").toBeLessThan(44);

          // Datas: 4 colunas (Suposta estimativa sozinha na 3ª linha, 1 coluna).
          const datas = await Promise.all(
            ["pf-data-po", "pf-data-embarque", "pf-thread", "pf-chegada", "pf-radar", "pf-duimp", "pf-lpco", "pf-previsao", "pf-suposta-estimativa"].map(b),
          );
          for (const i of [1, 2, 3]) mesmaLinha(datas[0]!, datas[i]!, `data ${i}`);
          for (const i of [5, 6, 7]) mesmaLinha(datas[4]!, datas[i]!, `data ${i}`);
          expect(datas[4]!.y).toBeGreaterThan(embaixo(datas[0]!) - 1);
          expect(datas[8]!.y).toBeGreaterThan(embaixo(datas[4]!) - 1);
          expect(datas[8]!.width).toBeCloseTo(datas[0]!.width, 0);

          // Local de entrega | Nº do processo: 2 colunas.
          const local = await b("pf-local-entrega");
          const numero = await b("pf-numero-processo");
          mesmaLinha(local, numero, "Local | Nº do processo");
          expect(local.width).toBeCloseTo((util - 10) / 2, 0);

          // Fontes e alturas de lg (13.5 / 13 / 12.5; sem min-height; labels de 10.5px).
          const fontes: Record<string, string> = {
            "pf-paciente": "13.5px",
            "pf-pasta": "13.5px",
            "pf-ordem": "13.5px",
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
