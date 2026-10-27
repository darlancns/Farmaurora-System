import { test, expect, type Page } from "@playwright/test";

// Posição horizontal dos valores do card de /prestacao no desenho LARGO (card com 1180px ou mais: 1440x900 e
// 1920x1080). O card de 6 valores (com Despachante e Transporte) mantém as 3 colunas de 2 valores — Alvará/Custo,
// Despachante/Transporte, Nota/Imposto —, mas agora elas começam nos mesmos x do bloco de 4 valores:
//   coluna 1 (Alvará)   = x do Alvará do card de 4 valores;
//   coluna 3 (Imposto)  = x do Imposto do card de 4 valores;
//   coluna 2            = ponto médio entre as duas.
// Posições FIXAS (não dependem do texto) e iguais em todos os cards de 6 valores. Os cards de 4 valores não mudam.
//
// As prestações são injetadas por page.route (só o GET de /api/patients; escrita nunca é enviada), então o spec roda
// igual no harness local e com credenciais reais, sem depender dos dados da conta.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback — só socio e administrador leem "patients")

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SOCIO_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SOCIO_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

function paciente(id: string, dia: number, nome: string, extra: Record<string, unknown>) {
  const dd = String(dia).padStart(2, "0");
  return {
    id,
    data: `${dd}/10/2026`,
    paciente: nome,
    descricaoCompra: "Compra de teste",
    descricaoResumo: "Enhertu 100mg",
    medicamentos: [{ qtd: "2", medicamento: "Medicamento X" }],
    empresa: "FARMAURORA",
    consultor: "Mateus Morais",
    alvara: 80000,
    custoImportacao: 20000,
    despesaTotal: 0,
    transporteTotal: 0,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    attachedSlots: [],
    status: "em_andamento",
    createdAt: `2026-10-${dd}T10:00:00Z`,
    ...extra,
  };
}

// Cards de 4 e de 6 valores intercalados, com valores enormes (R$1.234.567,89), nome de 40+ caracteres e os dois status.
const QUATRO = ["c4a", "c4b", "c4c"];
const SEIS = ["c6a", "c6b", "c6c"];
const DADOS = [
  paciente("c4a", 15, "Quatro Valores Normal", {}),
  paciente("c6a", 14, "Seis Valores Normal", { despesaTotal: 5000, transporteTotal: 2000 }),
  paciente("c4b", 13, "Quatro Valores Enormes", { alvara: 1234567.89, custoImportacao: 345678.9, status: "concluida" }),
  paciente("c6b", 12, "Seis Valores Enormes Nome Longo De Teste 45!", {
    alvara: 1234567.89,
    custoImportacao: 1234567.89,
    despesaTotal: 1234567.89,
    transporteTotal: 1234567.89,
    status: "concluida",
  }),
  paciente("c4c", 11, "Quatro Valores Terceiro", { alvara: 100000, custoImportacao: 1500 }),
  paciente("c6c", 10, "Seis Valores Terceiro", { despesaTotal: 12345.67, transporteTotal: 9876.5, status: "concluida" }),
];

// Altura do card de 6 valores no desenho largo (dois níveis de valores), a mesma de antes da mudança.
const ALTURA_CARD_SEIS = 98;
// Distância do Alvará do card de 4 valores até a borda direita do card (selo + ações + paddings): fixa e igual à de antes.
const ALVARA4_ATE_BORDA_DIREITA = 789;
// Passo entre colunas do bloco de 4 valores: 6.75rem + 0.75rem de gap (16px de raiz).
const PASSO = 120;
const TOL = 1;

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

async function gotoPrestacao(
  page: Page,
  viewport: { width: number; height: number },
  hydration: string[] = []
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.route(
    (url) => url.pathname === "/api/patients",
    (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DADOS) })
        : route.abort()
  );
  page.on("console", (msg) => {
    if (["warning", "error"].includes(msg.type()) && /hydration/i.test(msg.text())) hydration.push(msg.text());
  });
  await login(page);
  await page.goto("/prestacao", { waitUntil: "networkidle" });
  await expect(page.locator("#patient-row-c4a")).toBeVisible();
}

interface Caixa {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(page: Page, selector: string): Promise<Caixa> {
  const b = await page.locator(selector).boundingBox();
  expect(b, `${selector} precisa ter caixa`).not.toBeNull();
  return b!;
}

const CHAVES = ["alvara", "custo", "despachante", "transporte", "nota", "imposto"] as const;
type Chave = (typeof CHAVES)[number];

// Caixa da célula (rótulo + valor) de cada valor do card; ausentes (card de 4) ficam de fora.
async function celulas(page: Page, id: string): Promise<Partial<Record<Chave, Caixa>>> {
  const out: Partial<Record<Chave, Caixa>> = {};
  for (const k of CHAVES) {
    const l = page.locator(`#patient-valor-${k}-${id}`);
    if ((await l.count()) > 0) out[k] = (await l.boundingBox())!;
  }
  return out;
}

const perto = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;

test.describe("Valores do card de /prestacao no desenho largo", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "1440x900", width: 1440, height: 900 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport);
      });

      test("cards de 4 valores: colunas nos mesmos x de antes (passo fixo, iguais entre os cards)", async ({ page }) => {
        const referencia = await celulas(page, QUATRO[0]!);
        for (const id of QUATRO) {
          const c = await celulas(page, id);
          const card = await box(page, `#patient-row-${id}`);
          const direita = card.x + card.width;
          expect(Object.keys(c)).toEqual(["alvara", "custo", "nota", "imposto"]);
          // x absoluto igual ao de antes: a distância do Alvará à borda direita do card é fixa
          expect(perto(direita - c.alvara!.x, ALVARA4_ATE_BORDA_DIREITA), `${id}: Alvará até a borda`).toBe(true);
          expect(perto(c.custo!.x - c.alvara!.x, PASSO), `${id}: passo Alvará->Custo`).toBe(true);
          expect(perto(c.nota!.x - c.custo!.x, PASSO), `${id}: passo Custo->Nota`).toBe(true);
          expect(perto(c.imposto!.x - c.nota!.x, PASSO), `${id}: passo Nota->Imposto`).toBe(true);
          // iguais entre os cards de 4 valores
          for (const k of ["alvara", "custo", "nota", "imposto"] as const) {
            expect(perto(c[k]!.x - card.x, referencia[k]!.x - (await box(page, `#patient-row-${QUATRO[0]}`)).x), `${id}: ${k}`).toBe(
              true
            );
          }
          // uma linha só de valores (card de 68px)
          expect(perto(c.alvara!.y, c.imposto!.y)).toBe(true);
        }
      });

      test("cards de 6 valores: colunas 1, 2 e 3 nos x do Alvará, do meio e do Imposto dos cards de 4", async ({ page }) => {
        const ref = await celulas(page, QUATRO[0]!);
        const x1 = ref.alvara!.x;
        const x3 = ref.imposto!.x;
        const x2 = (x1 + x3) / 2;
        for (const id of SEIS) {
          const c = await celulas(page, id);
          expect(Object.keys(c).sort(), `${id}: os 6 valores`).toEqual([...CHAVES].sort());
          // coluna 1 = Alvará (em cima) e Custo (embaixo)
          expect(perto(c.alvara!.x, x1), `${id}: Alvará x`).toBe(true);
          expect(perto(c.custo!.x, x1), `${id}: Custo x`).toBe(true);
          // coluna 2 = Despachante e Transporte, no ponto médio entre as colunas 1 e 3
          expect(perto(c.despachante!.x, x2), `${id}: Despachante x`).toBe(true);
          expect(perto(c.transporte!.x, x2), `${id}: Transporte x`).toBe(true);
          // coluna 3 = Nota e Imposto, no x do Imposto do card de 4 valores
          expect(perto(c.nota!.x, x3), `${id}: Nota x`).toBe(true);
          expect(perto(c.imposto!.x, x3), `${id}: Imposto x`).toBe(true);
        }
      });

      test("cards de 6 valores: dois níveis na mesma ordem, rótulo em cima e valor embaixo", async ({ page }) => {
        for (const id of SEIS) {
          const c = await celulas(page, id);
          // 1º nível: Alvará | Despachante | Nota — 2º nível: Custo | Transporte | Imposto (mesmo y na linha)
          expect(perto(c.alvara!.y, c.despachante!.y), `${id}: 1º nível`).toBe(true);
          expect(perto(c.alvara!.y, c.nota!.y), `${id}: 1º nível`).toBe(true);
          expect(perto(c.custo!.y, c.transporte!.y), `${id}: 2º nível`).toBe(true);
          expect(perto(c.custo!.y, c.imposto!.y), `${id}: 2º nível`).toBe(true);
          expect(c.custo!.y, `${id}: Custo abaixo do Alvará`).toBeGreaterThan(c.alvara!.y + 10);
          // colunas da esquerda para a direita
          expect(c.alvara!.x).toBeLessThan(c.despachante!.x);
          expect(c.despachante!.x).toBeLessThan(c.nota!.x);
          // rótulo pequeno em cima, valor embaixo, com os textos de sempre
          for (const [k, rotulo] of [
            ["alvara", "Alvará"],
            ["custo", "Custo"],
            ["despachante", "Despachante"],
            ["transporte", "Transporte"],
            ["nota", "Nota"],
            ["imposto", "Imposto"],
          ] as const) {
            const spans = page.locator(`#patient-valor-${k}-${id} span`);
            await expect(spans.nth(0)).toHaveText(rotulo);
            const r = (await spans.nth(0).boundingBox())!;
            const v = (await spans.nth(1).boundingBox())!;
            expect(v.y, `${id}/${k}: valor abaixo do rótulo`).toBeGreaterThan(r.y + r.height - 2);
          }
        }
      });

      test("valores enormes não truncam, não invadem a coluna vizinha nem o selo; nome não invade os valores", async ({
        page,
      }) => {
        for (const id of ["c6b", "c4b"]) {
          const c = await celulas(page, id);
          const valores = page.locator(`#patient-valores-${id} span.font-mono`);
          const n = await valores.count();
          for (let i = 0; i < n; i++) {
            const trunca = await valores.nth(i).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
            expect(trunca, `${id}: valor #${i} truncado`).toBe(false);
          }
          // a caixa do TEXTO de cada valor cabe antes da coluna seguinte e do selo
          const textoDireita = async (k: Chave) =>
            page.locator(`#patient-valor-${k}-${id} span.font-mono`).evaluate((el) => {
              const r = document.createRange();
              r.selectNodeContents(el);
              return r.getBoundingClientRect().right;
            });
          const status = await box(page, `#patient-status-${id}`);
          if (id === "c6b") {
            expect(await textoDireita("alvara")).toBeLessThanOrEqual(c.despachante!.x + 0.5);
            expect(await textoDireita("custo")).toBeLessThanOrEqual(c.transporte!.x + 0.5);
            expect(await textoDireita("despachante")).toBeLessThanOrEqual(c.nota!.x + 0.5);
            expect(await textoDireita("transporte")).toBeLessThanOrEqual(c.imposto!.x + 0.5);
            expect(await textoDireita("imposto")).toBeLessThanOrEqual(status.x);
          } else {
            expect(await textoDireita("alvara")).toBeLessThanOrEqual(c.custo!.x + 0.5);
            expect(await textoDireita("custo")).toBeLessThanOrEqual(c.nota!.x + 0.5);
            expect(await textoDireita("imposto")).toBeLessThanOrEqual(status.x);
          }
          // o nome termina antes do bloco de valores
          const nome = await box(page, `#patient-nome-${id}`);
          const bloco = await box(page, `#patient-valores-${id}`);
          expect(nome.x + nome.width).toBeLessThanOrEqual(bloco.x + 0.5);
        }
      });

      test("altura do card de 6 valores é a de antes (dois níveis) e a lista não ganha overflow horizontal", async ({ page }) => {
        for (const id of SEIS) {
          const card = await box(page, `#patient-row-${id}`);
          expect(perto(card.height, ALTURA_CARD_SEIS), `${id}: altura ${card.height}`).toBe(true);
        }
        // o card de 4 valores segue com uma linha de valores (68px)
        for (const id of QUATRO) expect(perto((await box(page, `#patient-row-${id}`)).height, 68)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(
          false
        );
        expect(await page.locator("#patient-table-scroll").evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
      });
    });
  }

  test("o nome do card de 6 valores passa a ter a largura do de 4 valores (o bloco ocupa o mesmo espaço)", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoPrestacao(page, { width: 1920, height: 1080 });
    const nome4 = await box(page, "#patient-nome-c4a");
    const nome6 = await box(page, "#patient-nome-c6a");
    expect(perto(nome6.width, nome4.width)).toBe(true);
    expect(perto(nome6.x, nome4.x)).toBe(true);
  });
});

test.describe("Abaixo do desenho largo nada muda", () => {
  test.describe.configure({ retries: 2 });

  test("1280x800 (card de ~1036px, desenho médio, 6 colunas): 4 valores em 4 colunas, 6 valores em 6", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoPrestacao(page, { width: 1280, height: 800 });
    const c4 = await celulas(page, "c4a");
    const c6 = await celulas(page, "c6a");
    // o desenho médio de hoje: o card de 6 valores usa 6 colunas lado a lado, com passo diferente do de 4 colunas
    const xs6 = CHAVES.map((k) => c6[k]!.x);
    expect(xs6).toEqual([...xs6].sort((a, b) => a - b));
    expect(new Set(xs6.map((x) => Math.round(x))).size).toBe(6);
    expect(perto(c6.alvara!.x, c4.alvara!.x)).toBe(true);
    expect(perto(c6.alvara!.y, c6.imposto!.y)).toBe(true); // uma linha só
  });

  for (const viewport of [
    { name: "375px (estreito: 2 colunas)", width: 375, height: 667 },
    { name: "768px (médio: 3 colunas x 2 linhas)", width: 768, height: 1024 },
    { name: "1023px (médio: 6 colunas)", width: 1023, height: 768 },
  ]) {
    test(`${viewport.name}: comportamento de hoje`, async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
      await gotoPrestacao(page, viewport);
      const c6 = await celulas(page, "c6a");
      if (viewport.width === 375) {
        // 2 colunas: Alvará|Custo, Despachante|Transporte, Nota|Imposto
        expect(perto(c6.alvara!.x, c6.despachante!.x)).toBe(true);
        expect(perto(c6.alvara!.x, c6.nota!.x)).toBe(true);
        expect(perto(c6.custo!.x, c6.transporte!.x)).toBe(true);
        expect(perto(c6.custo!.x, c6.imposto!.x)).toBe(true);
        expect(c6.custo!.x).toBeGreaterThan(c6.alvara!.x + 40);
      } else if (viewport.width === 768) {
        // 3 colunas de 2 valores (Alvará/Custo, Despachante/Transporte, Nota/Imposto)
        expect(perto(c6.alvara!.x, c6.custo!.x)).toBe(true);
        expect(perto(c6.despachante!.x, c6.transporte!.x)).toBe(true);
        expect(perto(c6.nota!.x, c6.imposto!.x)).toBe(true);
        expect(c6.despachante!.x).toBeGreaterThan(c6.alvara!.x + 40);
        expect(c6.nota!.x).toBeGreaterThan(c6.despachante!.x + 40);
      } else {
        const xs = CHAVES.map((k) => c6[k]!.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(new Set(xs.map((x) => Math.round(x))).size).toBe(6);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(
        false
      );
    });
  }
});

test("sem aviso de hydration vindo do card (desktop e mobile)", async ({ page }) => {
  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
  // Os avisos de /prestacao que já existem (FloatingAddButton x cargo) ficam de fora: aqui só se exige que nenhum
  // aviso aponte para o card ou para o bloco de valores.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 667 },
  ]) {
    const avisos: string[] = [];
    const pagina = await page.context().newPage();
    await gotoPrestacao(pagina, viewport, avisos);
    const nossos = avisos.filter((texto) => /PatientRow|PatientTable|patient-row|patient-valor/.test(texto));
    expect(nossos, `avisos de hydration do card em ${viewport.width}px`).toEqual([]);
    await pagina.close();
  }
});
