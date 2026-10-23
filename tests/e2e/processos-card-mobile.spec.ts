import { test, expect, type Page } from "@playwright/test";

// Card de processo (ProcessoRow) e detalhe (ProcessoDetail) de /processos abaixo de lg
// (mobile e tablet). Cria 3 processos de teste via API (um normal, um com dados
// adversariais — nome, transportadora, medicamento, nº de processo, status "outro" e
// textos longos —, e um sem nenhum dado opcional) e SEMPRE apaga no afterAll, também via
// API. A página é filtrada pela busca com o RUN deste spec, então só os processos de
// teste aparecem e o resultado não depende dos dados reais da conta.
//
// As asserções são sobre posição, flexDirection e estilo computado (não só "sem overflow").
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — precisa de escrita em
//   processos: é o que cria e apaga os dados de teste)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

// Só dígitos: a busca normaliza o texto e o nome passa por capitalização no form (não aqui,
// que é API), então o RUN casa por substring.
const RUN = String(Date.now()).slice(-9);

const ACCENT_DARK_RGB = "rgb(11, 57, 86)"; // --color-accent-dark
const INK_SOFT_RGB = "rgb(76, 96, 105)"; // --color-ink-soft
const PAPER_RGB = "rgb(238, 242, 241)"; // --color-paper

const ROBUSTO = {
  paciente: `Maria Aparecida dos Santos ${RUN}`,
  ordem: "Ordem 2",
  pasta: "2026 - 234",
  empresa: "FARMAURORA",
  consultor: "Flávia",
  responsavelOperacional: "Rebeca",
  despachante: "Andreza Faconi",
  fornecedor: "Beldimed - Bélgica",
  transportadoraNacional: { nome: "Jadlog Logística", valor: 1234.5 },
  modalEnvio: "Air Cargo",
  companhiaAerea: "LATAM Cargo",
  numeroAwb: "957-12345678",
  codigoRastreio: "LA123456789BR",
  medicamentos: [
    { nome: "Pembrolizumabe", dosagem: "100mg", quantidade: "4 cx" },
    { nome: "Nivolumabe", dosagem: "40mg", quantidade: "2 cx" },
  ],
  status: "em_transito",
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
  pendencias: ["Aguardando licença de importação"],
  atualizacoes: [
    { data: "31/08", texto: "Carga embarcada no aeroporto de origem." },
    { data: "02/09", texto: "Chegou ao Brasil, aguardando liberação alfandegária para seguir ao destino final." },
  ],
};

const ADVERSARIAL = {
  paciente: `Maria Aparecida Conceição de Albuquerque Montenegro Vasconcelos ${RUN}`,
  ordem: "Ordem 12",
  pasta: "2026 - 1234",
  empresa: "MAINZFARMA",
  consultor: "Bolívar",
  responsavelOperacional: "Responsável Operacional com Nome Muito Longo da Silva Albuquerque",
  despachante: "Marcelo Lima",
  fornecedor: "Speciality - Índia",
  transportadoraNacional: {
    nome: "Transportadora Rápido Nordeste Logística Integrada e Armazenagem Ltda",
    valor: 98765.43,
  },
  modalEnvio: "Courier Formal",
  companhiaAerea: "Companhia Aérea Internacional de Carga",
  numeroAwb: "157-98765432109",
  codigoRastreio: "BR123456789012345678901234567890",
  medicamentos: [
    { nome: "Pembrolizumabe com excipiente estendido para teste de truncamento", dosagem: "100mg/4mL", quantidade: "10 cx" },
    { nome: "Ipilimumabe", dosagem: "50mg", quantidade: "1 cx" },
  ],
  status: "outro",
  statusOutro: "Aguardando liberação da ANVISA e da Receita Federal",
  datas: { previsaoEntrega: "30/09", supostaEstimativa: "Sem estimativa confiável até a liberação alfandegária" },
  localEntrega: "Avenida Governador Agamenon Magalhães, 1500, Boa Viagem, Recife - PE",
  numeroProcesso: "25BR00009876543-2/2026-ADM/0001.2345.6789",
  pendencias: [],
  atualizacoes: [
    {
      data: "10/09",
      texto: "Atualização com um texto bem longo para validar a quebra de linha normal na linha do tempo vertical do detalhe.",
    },
  ],
};

const VAZIO = {
  paciente: `Joao Sem Dados ${RUN}`,
  pasta: "2026 - 9",
  empresa: "FARMAURORA",
  consultor: "Dani",
  status: "aguardando_inicio",
  medicamentos: [],
  datas: {},
  pendencias: [],
  atualizacoes: [],
};

const VIEWPORTS = [
  { name: "375x667", width: 375, height: 667, colunas: 2, colunasDatas: 2 },
  { name: "390x844", width: 390, height: 844, colunas: 2, colunasDatas: 2 },
  { name: "768x1024", width: 768, height: 1024, colunas: 3, colunasDatas: 4 },
  { name: "820x1180", width: 820, height: 1180, colunas: 3, colunasDatas: 4 },
  { name: "1023x768 (último pixel antes de lg)", width: 1023, height: 768, colunas: 3, colunasDatas: 4 },
];

type Ids = { robusto: string; adversarial: string; vazio: string };
let ids: Ids | null = null;

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

async function criar(page: Page, dados: object): Promise<string> {
  const res = await page.request.post("/api/processos", { data: dados });
  expect(res.ok(), `POST /api/processos: ${res.status()}`).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}

const centerY = (b: { y: number; height: number }): number => b.y + b.height / 2;
const direita = (b: { x: number; width: number }): number => b.x + b.width;

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function irParaProcessos(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await login(page);
  await page.goto("/processos", { waitUntil: "networkidle" });
  await expect(page.locator("#tab-andamento")).toBeVisible();
  // Só os processos deste spec.
  await page.locator("#processo-search").fill(RUN);
  await expect(page.locator("#processo-group-list [id^='processo-row-']")).toHaveCount(0); // grupos colapsados
  for (const consultor of ["Bolívar", "Dani", "Flávia"]) {
    await page.locator("#processo-group-list button").filter({ hasText: consultor }).first().click();
  }
  await expect(page.locator("[id^='processo-row-proc_']")).toHaveCount(3);
}

const linha = (id: string) => `#processo-row-${id}`;

async function abrirDetalhe(page: Page, id: string): Promise<void> {
  await page.locator(`${linha(id)} > button`).click();
  await expect(page.locator(`#processo-detail-${id}`)).toBeVisible();
}

// Célula (rótulo + valor) de um campo do detalhe, pelo texto do rótulo, dentro do detalhe todo.
function celula(page: Page, id: string, rotulo: string) {
  return page.locator(`#processo-detail-${id} span:text-is("${rotulo}")`).first().locator("xpath=..");
}

async function boxCelula(page: Page, id: string, rotulo: string) {
  const b = await celula(page, id, rotulo).boundingBox();
  expect(b, `célula "${rotulo}" sem caixa`).not.toBeNull();
  return b!;
}

// Dois campos na mesma linha, o segundo à direita do primeiro.
async function expectLadoALado(page: Page, id: string, esquerda: string, direitaRotulo: string): Promise<void> {
  const a = await boxCelula(page, id, esquerda);
  const b = await boxCelula(page, id, direitaRotulo);
  expect(Math.abs(a.y - b.y), `${esquerda} | ${direitaRotulo} na mesma linha`).toBeLessThanOrEqual(1);
  expect(b.x, `${direitaRotulo} à direita de ${esquerda}`).toBeGreaterThanOrEqual(direita(a) - 1);
}

test.describe("/processos abaixo de lg — card e detalhe do processo", () => {
  test.describe.configure({ retries: 2 });

  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");

  test.beforeAll(async ({ browser }) => {
    if (!hasWriter) return;
    const page = await browser.newPage();
    try {
      await login(page);
      ids = {
        robusto: await criar(page, ROBUSTO),
        adversarial: await criar(page, ADVERSARIAL),
        vazio: await criar(page, VAZIO),
      };
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
      const res = await page.request.get("/api/processos");
      const todos = (await res.json()) as { id: string; paciente: string }[];
      for (const p of todos.filter((x) => x.paciente.includes(RUN))) {
        const del = await page.request.delete(`/api/processos/${p.id}`);
        expect(del.ok(), `DELETE ${p.id}`).toBe(true);
      }
      const depois = (await (await page.request.get("/api/processos")).json()) as { paciente: string }[];
      expect(depois.filter((x) => x.paciente.includes(RUN))).toHaveLength(0);
    } finally {
      await page.close();
      ids = null;
    }
  });

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        expect(ids, "processos de teste não foram criados").not.toBeNull();
        await irParaProcessos(page, viewport);
      });

      test("card fechado: seta, nome e selo na mesma linha; selo nunca come o nome", async ({ page }) => {
        for (const id of [ids!.robusto, ids!.adversarial, ids!.vazio]) {
          const nome = await box(page, `#mobile-paciente-${id}`);
          const selo = await box(page, `#mobile-badge-status-${id}`);
          const card = await box(page, linha(id));

          // Selo à direita do nome, alinhado ao topo da mesma linha (items-start), dentro do card.
          expect(selo.x, `selo à direita do nome (${id})`).toBeGreaterThanOrEqual(direita(nome) - 1);
          expect(Math.abs(selo.y - nome.y), `selo na linha do nome (${id})`).toBeLessThanOrEqual(8);
          expect(direita(selo)).toBeLessThanOrEqual(direita(card) + 1);

          // Linha 1 é uma linha (flex-direction: row), não uma coluna.
          const dir = await page
            .locator(`#mobile-paciente-${id}`)
            .evaluate((el) => getComputedStyle(el.parentElement!).flexDirection);
          expect(dir).toBe("row");

          // O nome mantém largura legível (nunca "Ma…") e não vaza na horizontal.
          expect(nome.width, `largura do nome (${id})`).toBeGreaterThanOrEqual(110);
          const vazamento = await page
            .locator(`#mobile-paciente-${id}`)
            .evaluate((el) => ({ h: el.scrollWidth > el.clientWidth + 1, linhas: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight) }));
          expect(vazamento.h).toBe(false);
          expect(vazamento.linhas, `nome em até 2 linhas (${id})`).toBeLessThanOrEqual(2.1);
        }

        // Nome comum quebra em até 2 linhas SEM reticências (cabe inteiro).
        const robusto = page.locator(`#mobile-paciente-${ids!.robusto}`);
        expect(await robusto.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

        // Selo "Outro" longo: limitado em largura, com reticências e título com o texto completo.
        const selo = page.locator(`#mobile-badge-status-${ids!.adversarial}`);
        const estiloSelo = await selo.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, cortado: el.scrollWidth > el.clientWidth };
        });
        expect(estiloSelo.textOverflow).toBe("ellipsis");
        expect(estiloSelo.whiteSpace).toBe("nowrap");
        // Em tablet (>= 640px) o texto cabe inteiro; abaixo disso é cortado com reticências.
        if (viewport.width < 640) expect(estiloSelo.cortado).toBe(true);
        await expect(selo).toHaveAttribute("title", "Aguardando liberação da ANVISA e da Receita Federal");
        const seloBox = await box(page, `#mobile-badge-status-${ids!.adversarial}`);
        const cardBox = await box(page, linha(ids!.adversarial));
        expect(seloBox.width).toBeLessThanOrEqual(cardBox.width * 0.46);

        // Selo de status comum aparece inteiro (sem reticências) e colorido.
        const seloComum = page.locator(`#mobile-badge-status-${ids!.robusto}`);
        await expect(seloComum).toHaveText("Em trânsito");
        expect(await seloComum.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
        expect(await seloComum.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      });

      test("card fechado: Ordem · Pasta, medicamento em 1 linha, data + responsável (só texto) na última linha", async ({ page }) => {
        const id = ids!.robusto;
        const nome = await box(page, `#mobile-paciente-${id}`);
        const ordemPasta = await box(page, `#mobile-ordem-pasta-${id}`);
        expect(ordemPasta.y).toBeGreaterThanOrEqual(nome.y + nome.height - 1);
        const textoOrdem = (await page.locator(`#mobile-ordem-pasta-${id}`).innerText()).replace(/\s+/g, " ").trim();
        expect(textoOrdem).toBe("Ordem 2 · Pasta 2026 - 234");
        expect(await page.locator(`#mobile-ordem-pasta-${id}`).evaluate((el) => getComputedStyle(el).color)).toBe(
          INK_SOFT_RGB,
        );

        // Sem "Ordem": só "Pasta XXXX".
        const textoSemOrdem = (await page.locator(`#mobile-ordem-pasta-${ids!.vazio}`).innerText())
          .replace(/\s+/g, " ")
          .trim();
        expect(textoSemOrdem).toBe("Pasta 2026 - 9");

        // Medicamento: 1 linha, cinza; no adversarial, corta com reticências.
        const resumo = page.locator(`${linha(id)} p.truncate`).first();
        const estilo = await resumo.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, color: cs.color, linhas: el.getBoundingClientRect().height / parseFloat(cs.lineHeight) };
        });
        expect(estilo).toMatchObject({ textOverflow: "ellipsis", whiteSpace: "nowrap", color: INK_SOFT_RGB });
        expect(estilo.linhas).toBeLessThanOrEqual(1.1);
        await expect(resumo).toHaveText("Pembrolizumabe 100mg +1");
        const resumoLongo = page.locator(`${linha(ids!.adversarial)} p.truncate`).first();
        if (viewport.width < 640) expect(await resumoLongo.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
        expect(await resumoLongo.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(1.1);

        // Última linha: calendário + previsão à esquerda, só o nome do responsável (texto) à direita.
        const previsao = await box(page, `#mobile-previsao-${id}`);
        const responsavel = await box(page, `#mobile-responsavel-${id}`);
        const medic = await box(page, `${linha(id)} p.truncate`);
        expect(previsao.y).toBeGreaterThanOrEqual(medic.y + medic.height - 1);
        expect(Math.abs(centerY(previsao) - centerY(responsavel))).toBeLessThanOrEqual(2);
        expect(responsavel.x).toBeGreaterThanOrEqual(direita(previsao) - 1);
        await expect(page.locator(`#mobile-previsao-${id}`)).toHaveText("28/08");
        await expect(page.locator(`#mobile-responsavel-${id}`)).toHaveText("Rebeca");
        // Calendário: svg imediatamente antes da data, na mesma linha.
        const svgCalendario = await page
          .locator(`#mobile-previsao-${id}`)
          .evaluate((el) => {
            const r = el.previousElementSibling?.getBoundingClientRect();
            return r ? { x: r.x, width: r.width, y: r.y, height: r.height } : null;
          });
        expect(svgCalendario).not.toBeNull();
        expect(svgCalendario!.x + svgCalendario!.width).toBeLessThanOrEqual(previsao.x + 1);
        expect(Math.abs(centerY(svgCalendario!) - centerY(previsao))).toBeLessThanOrEqual(2);

        // Valores vazios viram "—" sem quebrar a linha.
        await expect(page.locator(`#mobile-previsao-${ids!.vazio}`)).toHaveText("—");
        await expect(page.locator(`#mobile-responsavel-${ids!.vazio}`)).toHaveText("—");
      });

      test("card fechado: o responsável é só texto cinza (sem avatar) e o nome longo trunca sem empurrar a data", async ({
        page,
      }) => {
        for (const id of [ids!.robusto, ids!.adversarial]) {
          const resp = page.locator(`#mobile-responsavel-${id}`);
          // O texto é exatamente o nome — um avatar com inicial acrescentaria "R" / "B" antes dele.
          await expect(resp).toHaveText(id === ids!.robusto ? "Rebeca" : ADVERSARIAL.responsavelOperacional);
          expect(await resp.evaluate((el) => el.children.length), "sem elementos filhos").toBe(0);

          // A linha (pai) só tem o bloco calendário+data e o nome: nenhum círculo/avatar.
          const linha4 = await resp.evaluate((el) => ({
            filhos: el.parentElement!.children.length,
            circulos: el.parentElement!.querySelectorAll(".rounded-full").length,
            svgs: el.parentElement!.querySelectorAll("svg").length,
          }));
          expect(linha4).toEqual({ filhos: 2, circulos: 0, svgs: 1 }); // 1 svg = calendário
          // E nada no card mobile usa o fundo azul-marinho do avatar nem as iniciais dele.
          await expect(page.locator(`${linha(id)} div.bg-accent-dark`)).toHaveCount(0);
          await expect(page.locator(`${linha(id)} div.font-display`)).toHaveCount(0);

          // Mesmo estilo cinza da linha, sem fundo, sem círculo, sem borda.
          const estilo = await resp.evaluate((el) => {
            const cs = getComputedStyle(el);
            const data = getComputedStyle(document.querySelector(`#mobile-previsao-${el.id.replace("mobile-responsavel-", "")}`)!);
            return {
              cor: cs.color, fundo: cs.backgroundColor, raio: cs.borderTopLeftRadius, borda: cs.borderTopWidth,
              tamanho: cs.fontSize, mesmoTamanhoDaData: cs.fontSize === data.fontSize, truncate: cs.textOverflow,
            };
          });
          expect(estilo).toMatchObject({
            cor: INK_SOFT_RGB, fundo: "rgba(0, 0, 0, 0)", raio: "0px", borda: "0px", tamanho: "11.5px",
            mesmoTamanhoDaData: true, truncate: "ellipsis",
          });
        }

        // Nome longo: nunca empurra a data (que fica alinhada ao recuo do card, igual à do card curto) e
        // nunca vaza; abaixo de 640px é cortado com reticências.
        const dataCurta = await box(page, `#mobile-previsao-${ids!.robusto}`);
        const dataLonga = await box(page, `#mobile-previsao-${ids!.adversarial}`);
        const respLonga = await box(page, `#mobile-responsavel-${ids!.adversarial}`);
        const cardLongo = await box(page, linha(ids!.adversarial));
        expect(Math.abs(dataLonga.x - dataCurta.x)).toBeLessThanOrEqual(1);
        expect(respLonga.x).toBeGreaterThanOrEqual(direita(dataLonga) + 8);
        expect(direita(respLonga)).toBeLessThanOrEqual(direita(cardLongo) + 1);
        if (viewport.width < 640) {
          expect(await page.locator(`#mobile-responsavel-${ids!.adversarial}`).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
        }
        // Nome curto: encostado na direita do card (alinhado à margem), mesma linha da data.
        const respCurta = await box(page, `#mobile-responsavel-${ids!.robusto}`);
        const cardCurto = await box(page, linha(ids!.robusto));
        expect(direita(cardCurto) - direita(respCurta)).toBeLessThanOrEqual(16);
      });

      test("card fechado: seta, ícone de pendência visível sem competir com o selo; excluir não fica mais no cabeçalho", async ({
        page,
      }) => {
        const id = ids!.robusto;
        const icone = await box(page, `#mobile-icon-pendencia-${id}`);
        const nome = await box(page, `#mobile-paciente-${id}`);
        const selo = await box(page, `#mobile-badge-status-${id}`);
        expect(icone.x).toBeLessThanOrEqual(nome.x + 1);
        expect(direita(icone)).toBeLessThanOrEqual(selo.x);
        await expect(page.locator(`#mobile-icon-pendencia-${ids!.adversarial}`)).toHaveCount(0);

        // Seta ">" fechada (sem rotação) → "v" aberta (girada 90°).
        const seta = page.locator(`${linha(id)} > button svg`).first();
        // Tailwind v4 aplica rotate-90 pela propriedade `rotate` (não por `transform`).
        expect(await seta.evaluate((el) => getComputedStyle(el).rotate)).toBe("none");
        await abrirDetalhe(page, id);
        await expect.poll(() => seta.evaluate((el) => getComputedStyle(el).rotate)).toBe("90deg");
      });

      test("lixeira e blocos desktop do cabeçalho do card ficam ocultos (não ocupam espaço)", async ({ page }) => {
        const id = ids!.robusto;
        for (const oculto of [`#badge-status-${id}`, `#icon-pendencia-${id}`, `#btn-delete-processo-${id}`]) {
          await expect(page.locator(oculto), oculto).toBeHidden();
          expect(await page.locator(oculto).boundingBox(), oculto).toBeNull();
        }
        await abrirDetalhe(page, id);
        await expect(page.locator(`#btn-edit-processo-${id}`)).toBeHidden();
      });

      test("detalhe: título em caixa alta, fundo cinza, Medicamentos em largura total", async ({ page }) => {
        const id = ids!.robusto;
        await abrirDetalhe(page, id);
        const detalhe = page.locator(`#processo-detail-${id}`);
        expect(await detalhe.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PAPER_RGB);

        const titulo = detalhe.locator("p").first();
        await expect(titulo).toHaveText(/detalhe do processo/i);
        const estiloTitulo = await titulo.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { transform: cs.textTransform, color: cs.color, size: parseFloat(cs.fontSize) };
        });
        expect(estiloTitulo).toEqual({ transform: "uppercase", color: INK_SOFT_RGB, size: 11 });

        const medicamentos = detalhe.locator("div", { hasText: /^Medicamentos:/ }).first();
        const mb = (await medicamentos.boundingBox())!;
        const db = (await detalhe.boundingBox())!;
        expect(mb.width).toBeGreaterThanOrEqual(db.width - 34); // só perde o padding de 16px de cada lado
        await expect(medicamentos).toContainText("Pembrolizumabe 100mg 4 cx e Nivolumabe 40mg 2 cx");
      });

      test("detalhe: grade de colunas por faixa, pares lado a lado na ordem pedida", async ({ page }) => {
        const id = ids!.robusto;
        await abrirDetalhe(page, id);

        const grade = page.locator(`#processo-detail-${id} > div.grid`).first();
        const colunas = await grade.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        expect(colunas).toBe(viewport.colunas);

        if (viewport.colunas === 2) {
          // < 640px: duas colunas — Pasta|Despachante, Fornecedor|Modal, Cia|AWB, Rastreio|Local.
          await expectLadoALado(page, id, "Pasta", "Despachante");
          await expectLadoALado(page, id, "Fornecedor", "Modal de envio");
          await expectLadoALado(page, id, "Cia. aérea", "Nº AWB");
          await expectLadoALado(page, id, "Rastreio", "Local de entrega");
        } else {
          // sm..lg: três colunas — Pasta|Despachante|Fornecedor, Modal|Cia|AWB, Rastreio|Local.
          await expectLadoALado(page, id, "Pasta", "Despachante");
          await expectLadoALado(page, id, "Despachante", "Fornecedor");
          await expectLadoALado(page, id, "Modal de envio", "Cia. aérea");
          await expectLadoALado(page, id, "Cia. aérea", "Nº AWB");
          await expectLadoALado(page, id, "Rastreio", "Local de entrega");
        }

        // Ordem vertical dos pares.
        const ys = [];
        for (const r of ["Pasta", "Modal de envio", "Rastreio", "Nº do processo", "Transportadora"]) {
          ys.push((await boxCelula(page, id, r)).y);
        }
        for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);

        // Rótulo pequeno e cinza em cima, valor embaixo; AWB monoespaçado.
        const pasta = celula(page, id, "Pasta");
        const rotulo = pasta.locator("span").nth(0);
        const valor = pasta.locator("span").nth(1);
        const rb = (await rotulo.boundingBox())!;
        const vb = (await valor.boundingBox())!;
        expect(vb.y).toBeGreaterThanOrEqual(rb.y + rb.height - 1);
        expect(await rotulo.evaluate((el) => getComputedStyle(el).color)).toBe(INK_SOFT_RGB);
        const awb = celula(page, id, "Nº AWB").locator("span").nth(1);
        expect(await awb.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
      });

      test("detalhe: Nº do processo e Transportadora em largura total, sem overflow, com dados adversariais", async ({
        page,
      }) => {
        const id = ids!.adversarial;
        await abrirDetalhe(page, id);
        const grade = (await page.locator(`#processo-detail-${id} > div.grid`).first().boundingBox())!;

        for (const rotulo of ["Nº do processo", "Transportadora"]) {
          const c = await boxCelula(page, id, rotulo);
          expect(Math.abs(c.x - grade.x), `${rotulo} começa na margem`).toBeLessThanOrEqual(1);
          expect(c.width, `${rotulo} em largura total`).toBeGreaterThanOrEqual(grade.width - 1);
        }
        const np = await boxCelula(page, id, "Nº do processo");
        const tr = await boxCelula(page, id, "Transportadora");
        expect(tr.y).toBeGreaterThanOrEqual(np.y + np.height - 1);

        // Nenhum valor do detalhe vaza do próprio bloco.
        const vazamentos = await page.locator(`#processo-detail-${id}`).evaluate((det) =>
          [...det.querySelectorAll<HTMLElement>("span, p, li")]
            .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline")
            .map((el) => el.textContent?.trim().slice(0, 40)),
        );
        expect(vazamentos).toEqual([]);

        // Nº do processo: monoespaçado e só quebra depois de ponto, barra ou traço.
        const valorNp = celula(page, id, "Nº do processo").locator("span.lg\\:hidden");
        expect(await valorNp.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
        const quebras = await valorNp.evaluate((el) => {
          const texto = el.firstChild ? (el.textContent ?? "") : "";
          const nos: Text[] = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) nos.push(n as Text);
          const linhas: { top: number; ultimo: string }[] = [];
          for (const no of nos) {
            for (let i = 0; i < no.length; i++) {
              const r = document.createRange();
              r.setStart(no, i);
              r.setEnd(no, i + 1);
              const rect = r.getClientRects()[0];
              if (!rect || no.data[i]!.trim() === "") continue;
              const ultima = linhas[linhas.length - 1];
              if (!ultima || Math.abs(ultima.top - rect.top) > 4) linhas.push({ top: rect.top, ultimo: no.data[i]! });
              else ultima.ultimo = no.data[i]!;
            }
          }
          return { texto, finais: linhas.slice(0, -1).map((l) => l.ultimo) };
        });
        for (const fim of quebras.finais) expect(fim, `linha terminando em "${fim}"`).toMatch(/[./-]/);

        // Transportadora: nome longo quebra em palavras; o valor (R$) fica em linha própria, logo abaixo.
        const trValor = celula(page, id, "Transportadora").locator("span", { hasText: "R$ 98.765,43" }).last();
        await expect(trValor).toBeVisible();
        const nomeLinha = (await celula(page, id, "Transportadora").locator("span").nth(1).boundingBox())!;
        const valorBox = (await trValor.boundingBox())!;
        expect(valorBox.y).toBeGreaterThan(nomeLinha.y);
        expect(valorBox.width).toBeLessThanOrEqual(grade.width);
        expect(await trValor.evaluate((el) => parseInt(getComputedStyle(el).fontWeight, 10))).toBeGreaterThanOrEqual(600);
        // O "— " separador existe no DOM (oculto) só pro desktop: o texto visível não o tem.
        await expect(celula(page, id, "Transportadora")).not.toContainText("— R$", { useInnerText: true });
      });

      test("detalhe: valores vazios aparecem como —; nenhum campo some", async ({ page }) => {
        const id = ids!.vazio;
        await abrirDetalhe(page, id);
        const rotulos = [
          "Pasta", "Despachante", "Fornecedor", "Modal de envio", "Cia. aérea", "Nº AWB", "Rastreio",
          "Local de entrega", "Nº do processo", "Compra (PO)", "Embarque", "Abertura thread", "Chegada Brasil",
          "Registro Radar", "Registro Duimp", "Registro Lpco", "Previsão entrega", "Suposta estimativa",
        ];
        for (const r of rotulos) {
          const c = celula(page, id, r);
          await expect(c, r).toBeVisible();
          if (r !== "Pasta") await expect(c.locator("span").nth(1), r).toHaveText("—");
        }
        // Sem transportadora, o bloco não existe (condição idêntica à de hoje).
        await expect(page.locator(`#processo-detail-${id} span:text-is("Transportadora")`)).toHaveCount(0);
      });

      test("datas: grade (2 colunas abaixo de sm), pares na ordem, Previsão em azul-marinho e negrito, estimativa em largura total", async ({
        page,
      }) => {
        const id = ids!.robusto;
        await abrirDetalhe(page, id);

        const titulo = page.locator(`#processo-detail-${id} p`, { hasText: /^Datas$/ });
        expect(await titulo.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
        const grade = titulo.locator("xpath=following-sibling::div[1]");
        expect(await grade.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(
          viewport.colunasDatas,
        );

        if (viewport.colunasDatas === 2) {
          await expectLadoALado(page, id, "Compra (PO)", "Embarque");
          await expectLadoALado(page, id, "Abertura thread", "Chegada Brasil");
          await expectLadoALado(page, id, "Registro Radar", "Registro Duimp");
          await expectLadoALado(page, id, "Registro Lpco", "Previsão entrega");
        } else {
          await expectLadoALado(page, id, "Compra (PO)", "Embarque");
          await expectLadoALado(page, id, "Embarque", "Abertura thread");
          await expectLadoALado(page, id, "Abertura thread", "Chegada Brasil");
          await expectLadoALado(page, id, "Registro Radar", "Registro Duimp");
          await expectLadoALado(page, id, "Registro Lpco", "Previsão entrega");
        }

        // Rótulo em cima, data embaixo.
        const compra = celula(page, id, "Compra (PO)");
        const rb = (await compra.locator("span").nth(0).boundingBox())!;
        const vb = (await compra.locator("span").nth(1).boundingBox())!;
        expect(vb.y).toBeGreaterThanOrEqual(rb.y + rb.height - 1);

        // Previsão destacada.
        const previsao = celula(page, id, "Previsão entrega").locator("span").nth(1);
        const estilo = await previsao.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { color: cs.color, peso: parseInt(cs.fontWeight, 10) };
        });
        expect(estilo.color).toBe(ACCENT_DARK_RGB);
        expect(estilo.peso).toBeGreaterThanOrEqual(600);
        const comum = await celula(page, id, "Embarque").locator("span").nth(1).evaluate((el) => getComputedStyle(el).color);
        expect(comum).not.toBe(ACCENT_DARK_RGB);

        // Suposta estimativa: largura total, abaixo das demais.
        const gb = (await grade.boundingBox())!;
        const sup = await boxCelula(page, id, "Suposta estimativa");
        const prev = await boxCelula(page, id, "Previsão entrega");
        expect(sup.y).toBeGreaterThanOrEqual(prev.y + prev.height - 1);
        expect(sup.width).toBeGreaterThanOrEqual(gb.width - 1);
        await expect(celula(page, id, "Suposta estimativa")).toContainText("Entre 28/08 e 02/09");
      });

      test("atualizações: data monoespaçada à esquerda, texto à direita quebrando normalmente", async ({ page }) => {
        const id = ids!.adversarial;
        await abrirDetalhe(page, id);
        const titulo = page.locator(`#processo-detail-${id} p`, { hasText: /^Atualizações$/ });
        expect(await titulo.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");

        const item = page.locator(`#processo-detail-${id} ol > li`).first();
        expect(await item.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");
        const data = item.locator("span").nth(0);
        const texto = item.locator("span").nth(1);
        expect(await data.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
        const db = (await data.boundingBox())!;
        const tb = (await texto.boundingBox())!;
        const ib = (await item.boundingBox())!;
        expect(tb.x).toBeGreaterThanOrEqual(direita(db) - 1);
        expect(Math.abs(tb.y - db.y)).toBeLessThanOrEqual(2);
        expect(direita(tb)).toBeLessThanOrEqual(direita(ib) + 1);
        // Texto longo quebra em mais de uma linha (nada de nowrap) e sem overflow.
        if (viewport.width < 800) expect(tb.height).toBeGreaterThan(20);
        expect(await texto.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("normal");
        expect(await texto.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);

        // Formulário de nova atualização: campos empilhados em largura total, toque ≥44px.
        const form = page.locator(`#form-nova-atualizacao-${id}`);
        expect(await form.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");
        for (const sel of ["input >> nth=0", "input >> nth=1", "button[type=submit]"]) {
          const b = (await form.locator(sel).boundingBox())!;
          expect(b.height, sel).toBeGreaterThanOrEqual(44);
          expect(b.width, sel).toBeGreaterThanOrEqual((await form.boundingBox())!.width - 1);
        }
      });

      test("rodapé: Editar (contorno azul-marinho) e lixeira lado a lado, toque ≥44px, no fim do detalhe", async ({
        page,
      }) => {
        const id = ids!.robusto;
        await abrirDetalhe(page, id);
        const rodape = await box(page, `#processo-acoes-${id}`);
        const editar = await box(page, `#btn-edit-processo-footer-${id}`);
        const lixeira = await box(page, `#btn-delete-processo-footer-${id}`);
        const detalhe = await box(page, `#processo-detail-${id}`);
        const form = await box(page, `#form-nova-atualizacao-${id}`);

        expect(Math.abs(centerY(editar) - centerY(lixeira))).toBeLessThanOrEqual(1);
        expect(lixeira.x).toBeGreaterThanOrEqual(direita(editar) - 1);
        for (const b of [editar, lixeira]) {
          expect(b.width).toBeGreaterThanOrEqual(44);
          expect(b.height).toBeGreaterThanOrEqual(44);
        }
        // No fim do detalhe: abaixo do formulário de atualização e encostado na base do bloco.
        expect(rodape.y).toBeGreaterThanOrEqual(form.y + form.height - 1);
        expect(direita(rodape)).toBeLessThanOrEqual(direita(detalhe) + 1);
        expect(detalhe.y + detalhe.height - (rodape.y + rodape.height)).toBeLessThanOrEqual(20);

        const estiloEditar = await page.locator(`#btn-edit-processo-footer-${id}`).evaluate((el) => {
          const cs = getComputedStyle(el);
          return { borda: cs.borderTopColor, larguraBorda: cs.borderTopWidth, cor: cs.color, fundo: cs.backgroundColor };
        });
        expect(estiloEditar).toEqual({ borda: ACCENT_DARK_RGB, larguraBorda: "1px", cor: ACCENT_DARK_RGB, fundo: "rgba(0, 0, 0, 0)" });
        await expect(page.locator(`#btn-edit-processo-footer-${id}`)).toHaveText("Editar");
        expect(await page.locator(`#btn-delete-processo-footer-${id}`).evaluate((el) => getComputedStyle(el).color)).toBe(
          INK_SOFT_RGB,
        );
      });

      test("rodapé reaproveita os handlers: Editar abre o formulário do processo; lixeira pede confirmação (e cancelar não exclui)", async ({
        page,
      }) => {
        const id = ids!.robusto;
        await abrirDetalhe(page, id);

        await page.locator(`#btn-edit-processo-footer-${id}`).click();
        await expect(page.locator("#processo-form-modal-overlay")).toBeVisible();
        await expect(page.locator("#pf-paciente")).toHaveValue(ROBUSTO.paciente);
        await page.keyboard.press("Escape");
        await expect(page.locator("#processo-form-modal-overlay")).toHaveCount(0);

        await page.locator(`#btn-delete-processo-footer-${id}`).click();
        await expect(page.locator("#confirm-dialog-overlay")).toBeVisible();
        await expect(page.locator("#confirm-dialog-overlay")).toContainText(ROBUSTO.paciente);
        await page.locator("#btn-confirm-dialog-cancel").click();
        await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
        await expect(page.locator(linha(id))).toBeVisible();
      });

      test("botão flutuante '+' (Novo processo) não cobre o rodapé nem o último card", async ({ page }) => {
        const novo = page.getByRole("button", { name: "Novo processo" });
        await expect(novo).toBeVisible();

        // Abre os 3 e rola até o fim: o último card (Flávia) termina acima do botão flutuante,
        // e os botões do rodapé dele recebem o toque (nada por cima).
        for (const id of [ids!.adversarial, ids!.vazio, ids!.robusto]) await abrirDetalhe(page, id);
        await page.evaluate(() => {
          const main = document.querySelector<HTMLElement>("#app-main-content")!;
          main.scrollTop = main.scrollHeight;
        });
        const fab = await box(page, "#fab-novo-processo");
        const fimLista = await page.evaluate(
          () => document.querySelector("#processos-page")!.lastElementChild!.getBoundingClientRect().bottom,
        );
        expect(fimLista).toBeLessThanOrEqual(fab.y);

        const rodape = await box(page, `#processo-acoes-${ids!.robusto}`);
        expect(rodape.y + rodape.height).toBeLessThanOrEqual(fab.y);
        for (const sel of [`#btn-edit-processo-footer-${ids!.robusto}`, `#btn-delete-processo-footer-${ids!.robusto}`]) {
          const b = await box(page, sel);
          const topo = await page.evaluate(
            ([x, y, s]) => document.elementFromPoint(x as number, y as number)?.closest(s as string) !== null,
            [b.x + b.width / 2, b.y + b.height / 2, sel],
          );
          expect(topo, `${sel} coberto`).toBe(true);
        }
      });

      test("sem overflow horizontal: lista aberta e fechada, e aba Entregues", async ({ page }) => {
        expect(await hasHorizontalOverflow(page), "lista fechada").toBe(false);
        for (const id of [ids!.adversarial, ids!.vazio, ids!.robusto]) await abrirDetalhe(page, id);
        expect(await hasHorizontalOverflow(page), "lista com os 3 abertos").toBe(false);
        for (const id of [ids!.robusto, ids!.adversarial]) {
          const r = await box(page, linha(id));
          const d = await box(page, `#processo-detail-${id}`);
          expect(direita(d)).toBeLessThanOrEqual(direita(r) + 1);
          expect(d.x).toBeGreaterThanOrEqual(r.x - 1);
        }
        await page.locator("#tab-entregues").click();
        await page.waitForTimeout(200);
        expect(await hasHorizontalOverflow(page), "aba Entregues").toBe(false);
      });
    });
  }
});
