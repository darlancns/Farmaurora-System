import { test, expect, type Page } from "@playwright/test";

// Card de processo e detalhe de /processos de lg (1024px) pra cima — regra crítica do refino
// mobile: o DESKTOP NÃO MUDA. Este spec trava o layout de sempre (linha em uma fileira com
// badge/data/responsável à direita, lixeira no cabeçalho do card, detalhe em 4 colunas,
// "Editar processo" no cabeçalho do detalhe) e garante que o rodapé Editar/lixeira do
// mobile não aparece. A comparação pixel a pixel contra o baseline é feita à parte
// (screenshots antes × depois); aqui ficam as asserções explícitas de estilo/posição.
//
// Cria 2 processos de teste via API e apaga no afterAll, também via API (mesmo padrão de
// processos-card-mobile.spec.ts).
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const RUN = String(Date.now()).slice(-9);

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
  medicamentos: [{ nome: "Pembrolizumabe", dosagem: "100mg", quantidade: "4 cx" }],
  status: "em_transito",
  datas: { dataCompraPO: "05/08", dataEmbarque: "12/08", previsaoEntrega: "28/08", supostaEstimativa: "Entre 28/08 e 02/09" },
  localEntrega: "Rua das Flores 123, São Paulo",
  numeroProcesso: "25BR00001234567-8/2026",
  pendencias: ["Aguardando licença de importação"],
  atualizacoes: [{ data: "31/08", texto: "Carga embarcada." }],
};

const ADVERSARIAL = {
  ...ROBUSTO,
  paciente: `Maria Aparecida Conceição de Albuquerque Montenegro Vasconcelos ${RUN}`,
  consultor: "Bolívar",
  transportadoraNacional: { nome: "Transportadora Rápido Nordeste Logística Integrada e Armazenagem Ltda", valor: 98765.43 },
  numeroProcesso: "25BR00009876543-2/2026-ADM/0001.2345.6789",
  status: "outro",
  statusOutro: "Aguardando liberação da ANVISA e da Receita Federal",
  pendencias: [],
};

const VIEWPORTS = [
  { name: "1024x768 (limite inferior de lg)", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

type Ids = { robusto: string; adversarial: string };
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

function celula(page: Page, id: string, rotulo: string) {
  return page.locator(`#processo-detail-${id} span:text-is("${rotulo}")`).first().locator("xpath=..");
}

test.describe("/processos em lg+ — card e detalhe inalterados", () => {
  test.describe.configure({ retries: 2 });

  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");

  test.beforeAll(async ({ browser }) => {
    if (!hasWriter) return;
    const page = await browser.newPage();
    try {
      await login(page);
      ids = { robusto: await criar(page, ROBUSTO), adversarial: await criar(page, ADVERSARIAL) };
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
      ids = null;
    }
  });

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        expect(ids, "processos de teste não foram criados").not.toBeNull();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await login(page);
        await page.goto("/processos", { waitUntil: "networkidle" });
        await expect(page.locator("#tab-andamento")).toBeVisible();
        await page.locator("#processo-search").fill(RUN);
        for (const consultor of ["Bolívar", "Flávia"]) {
          await page.locator("#processo-group-list button").filter({ hasText: consultor }).first().click();
        }
        await expect(page.locator("[id^='processo-row-proc_']")).toHaveCount(2);
      });

      test("card fechado: linha única (nome, ordem·pasta, medicamento | badge, data, responsável | lixeira), sem o card mobile", async ({
        page,
      }) => {
        const id = ids!.robusto;

        // O card mobile some por completo (display: none) e o desktop assume.
        for (const oculto of [`#mobile-paciente-${id}`, `#mobile-badge-status-${id}`, `#mobile-previsao-${id}`]) {
          await expect(page.locator(oculto), oculto).toBeHidden();
          expect(await page.locator(oculto).boundingBox(), oculto).toBeNull();
        }

        // Botão da linha em fileira (container query @[700px] intacta) e centralizado.
        const botao = await page
          .locator(`#processo-row-${id} > button`)
          .evaluate((el) => {
            const cs = getComputedStyle(el);
            return { flexDirection: cs.flexDirection, alignItems: cs.alignItems, gap: cs.columnGap };
          });
        expect(botao).toEqual({ flexDirection: "row", alignItems: "center", gap: "12px" });

        const linhaBox = await box(page, `#processo-row-${id}`);
        const badge = await box(page, `#badge-status-${id}`);
        const lixeira = await box(page, `#btn-delete-processo-${id}`);
        const nome = await box(page, `#processo-row-${id} span.truncate.font-medium`);
        const data = await box(page, `#processo-row-${id} span.font-mono.text-\\[12px\\]`);
        const resp = await box(page, `#processo-row-${id} span.text-right.shrink-0:not(.font-mono)`);

        // Tudo na mesma fileira, na ordem de sempre: nome < badge < data < responsável < lixeira.
        for (const b of [badge, data, resp, lixeira]) expect(Math.abs(centerY(b) - centerY(nome))).toBeLessThanOrEqual(14);
        expect(badge.x).toBeGreaterThanOrEqual(direita(nome) - 1);
        expect(data.x).toBeGreaterThanOrEqual(direita(badge) - 1);
        expect(resp.x).toBeGreaterThanOrEqual(direita(data) - 1);
        expect(lixeira.x).toBeGreaterThanOrEqual(direita(resp) - 1);
        expect(direita(lixeira)).toBeLessThanOrEqual(direita(linhaBox) + 1);

        // Colunas fixas de lg+ (data 92px, responsável 110px) e lixeira compacta de 28px.
        expect(Math.round(data.width)).toBe(92);
        expect(Math.round(resp.width)).toBe(110);
        expect(Math.round(lixeira.width)).toBe(28);
        expect(Math.round(lixeira.height)).toBe(28);

        // Badge e nome do status "Outro" truncam como sempre (max-w-[200px] + reticências).
        const badgeOutro = await box(page, `#badge-status-${ids!.adversarial}`);
        expect(Math.round(badgeOutro.width)).toBeLessThanOrEqual(200);
      });

      test("detalhe: 4 colunas, 'Editar processo' no cabeçalho, sem rodapé Editar/lixeira, valores monoespaçados", async ({
        page,
      }) => {
        const id = ids!.robusto;
        await page.locator(`#processo-row-${id} > button`).click();
        await expect(page.locator(`#processo-detail-${id}`)).toBeVisible();

        // Rodapé do mobile ausente (oculto, sem caixa) e cabeçalho com o botão de sempre.
        for (const oculto of [`#processo-acoes-${id}`, `#btn-edit-processo-footer-${id}`, `#btn-delete-processo-footer-${id}`]) {
          await expect(page.locator(oculto), oculto).toBeHidden();
          expect(await page.locator(oculto).boundingBox(), oculto).toBeNull();
        }
        const editar = await box(page, `#btn-edit-processo-${id}`);
        const titulo = await box(page, `#processo-detail-${id} p`);
        await expect(page.locator(`#btn-edit-processo-${id}`)).toHaveText("Editar processo");
        expect(Math.abs(centerY(editar) - centerY(titulo))).toBeLessThanOrEqual(14);
        expect(editar.x).toBeGreaterThan(direita(titulo));

        // Duas grades de 4 colunas (campos e datas), com folga de 16px entre colunas.
        const grades = page.locator(`#processo-detail-${id} div.grid`);
        await expect(grades).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
          const estilo = await grades.nth(i).evaluate((el) => {
            const cs = getComputedStyle(el);
            return { colunas: cs.gridTemplateColumns.split(" ").length, colGap: cs.columnGap, rowGap: cs.rowGap };
          });
          expect(estilo).toEqual({ colunas: 4, colGap: "16px", rowGap: "8px" });
        }

        // "Nº do processo" e "Transportadora" são células comuns da grade (1 coluna), lado a lado.
        const np = (await celula(page, id, "Nº do processo").boundingBox())!;
        const tr = (await celula(page, id, "Transportadora").boundingBox())!;
        const pasta = (await celula(page, id, "Pasta").boundingBox())!;
        expect(Math.abs(np.width - pasta.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(tr.width - pasta.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(np.y - tr.y)).toBeLessThanOrEqual(1);
        expect(tr.x).toBeGreaterThanOrEqual(direita(np) - 1);

        // Todos os valores em monoespaçado (inclusive os que no mobile são sans), "— R$" inline.
        for (const rotulo of ["Pasta", "Despachante", "Fornecedor", "Cia. aérea", "Nº AWB", "Rastreio", "Compra (PO)", "Embarque"]) {
          const valor = celula(page, id, rotulo).locator("span").nth(1);
          expect(await valor.evaluate((el) => getComputedStyle(el).fontFamily), rotulo).toMatch(/mono/i);
        }
        await expect(celula(page, id, "Transportadora")).toContainText("Jadlog Logística — R$ 1.234,50");
        const previsao = celula(page, id, "Previsão entrega").locator("span").nth(1);
        expect(await previsao.evaluate((el) => ({ cor: getComputedStyle(el).color, peso: getComputedStyle(el).fontWeight }))).toEqual({
          cor: "rgb(20, 36, 43)", // --color-ink, sem o destaque azul do mobile
          peso: "400",
        });

        // Nº do processo desktop: um único span (sem <wbr>) com o texto original.
        await expect(celula(page, id, "Nº do processo").locator("span.lg\\:inline")).toHaveText(ROBUSTO.numeroProcesso);
        expect(await celula(page, id, "Nº do processo").locator("span.lg\\:hidden").evaluate((el) => getComputedStyle(el).display)).toBe("none");

        // Formulário de atualização em fileira, como sempre.
        const form = page.locator(`#form-nova-atualizacao-${id}`);
        expect(await form.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");
        const data = await box(page, `#form-nova-atualizacao-${id} input >> nth=0`);
        expect(Math.round(data.width)).toBe(140);
        expect(data.height).toBeLessThan(40);
      });

      test("lixeira do cabeçalho do card continua pedindo confirmação e 'Editar processo' abre o formulário", async ({ page }) => {
        const id = ids!.robusto;
        await page.locator(`#btn-delete-processo-${id}`).click();
        await expect(page.locator("#confirm-dialog-overlay")).toBeVisible();
        await page.locator("#btn-confirm-dialog-cancel").click();
        await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);

        await page.locator(`#processo-row-${id} > button`).click();
        await page.locator(`#btn-edit-processo-${id}`).click();
        await expect(page.locator("#processo-form-modal-overlay")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#processo-form-modal-overlay")).toHaveCount(0);
      });
    });
  }
});
