import { test, expect, type Page } from "@playwright/test";
import { hojeBrasilia } from "../../shared/utils/dataBrasilia";

// Chips de mês de /prestacao (só CSS/lg + qual mês aparece; nenhuma lógica de filtro, contagem, busca ou
// cálculo mudou). Em lg+ (>= 1024px) a barra fica na MESMA linha da busca, entre a busca e o botão
// "+ Nova prestação", e mostra só "Todos", o mês corrente e o anterior (pela data de Brasília); os demais
// meses ficam no dropdown do ☰. Abaixo de lg os chips seguem ocultos e o mês vive no painel de filtros.
//
// As prestações são injetadas por page.route (só o GET de /api/patients; escrita nunca é enviada), com datas
// relativas ao "hoje" de Brasília — o spec roda igual no harness local e com credenciais reais, sem depender
// dos dados da conta.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback — só socio e administrador leem "patients")

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SOCIO_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SOCIO_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

interface Mes {
  key: string; // "2026-10" — mesmo formato do selectedMonthKey
  nome: string; // "Outubro"
  ano: number;
}

// Mês `atras` meses antes do mês corrente de Brasília (aritmética de calendário, sem Date local).
function mesRelativo(atras: number): Mes {
  const [ano, mes] = hojeBrasilia().split("-").map(Number) as [number, number];
  const indice = ano * 12 + (mes - 1) - atras;
  const a = Math.floor(indice / 12);
  const m = indice % 12;
  return { key: `${a}-${String(m + 1).padStart(2, "0")}`, nome: MESES[m]!, ano: a };
}

const ATUAL = mesRelativo(0);
const ANTERIOR = mesRelativo(1);
const ANTIGOS = [mesRelativo(3), mesRelativo(6)];

function paciente(id: string, mes: Mes, dia: number) {
  const [ano, m] = mes.key.split("-");
  return {
    id,
    data: `${String(dia).padStart(2, "0")}/${m}/${ano}`,
    paciente: `Paciente ${id}`,
    descricaoCompra: "Compra de teste",
    descricaoResumo: "Resumo",
    medicamentos: [{ qtd: "2", medicamento: "Medicamento X" }],
    empresa: "FARMAURORA",
    consultor: "Mateus Morais",
    alvara: 100,
    custoImportacao: 1000,
    despesaTotal: 500,
    transporteTotal: 200,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    attachedSlots: [],
    createdAt: `${ano}-${m}-${String(dia).padStart(2, "0")}T12:00:00Z`,
  };
}

function grupo(prefixo: string, mes: Mes, quantidade: number) {
  return Array.from({ length: quantidade }, (_, i) => paciente(`${prefixo}${i + 1}`, mes, i + 1));
}

// Cenário A: os dois meses dos chips têm prestações. Cenário B: o mês corrente está vazio.
const CENARIO_A = [...grupo("a", ATUAL, 3), ...grupo("b", ANTERIOR, 2), ...grupo("c", ANTIGOS[0]!, 1), ...grupo("d", ANTIGOS[1]!, 2)];
const CENARIO_B = [...grupo("b", ANTERIOR, 2), ...grupo("c", ANTIGOS[0]!, 1)];
const TODOS_A = CENARIO_A.length;

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
  dados: unknown[],
  hydration: string[] = []
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.route(
    (url) => url.pathname === "/api/patients",
    (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dados) })
        : route.abort()
  );
  page.on("console", (msg) => {
    if (["warning", "error"].includes(msg.type()) && /hydration/i.test(msg.text())) hydration.push(msg.text());
  });
  await login(page);
  await page.goto("/prestacao", { waitUntil: "networkidle" });
  await expect(page.locator("#patient-search")).toBeVisible();
}

const cards = (page: Page) => page.locator('[id^="patient-row-"]');
const hasHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b, `${selector} precisa estar visível`).not.toBeNull();
  return b!;
}

test.describe("Chips de mês de /prestacao", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "1024px", width: 1024, height: 768 },
    { name: "1280px", width: 1280, height: 800 },
    { name: "1920px", width: 1920, height: 1080 },
  ]) {
    test.describe(`lg+ ${viewport.name}`, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport, CENARIO_A);
      });

      test("busca, chips e botão na MESMA linha: busca à esquerda, chips no meio, botão à direita", async ({ page }) => {
        const busca = await box(page, "#patient-search");
        const barra = await box(page, "#month-filter-bar");
        const botao = await box(page, "#btn-nova-prestacao");

        // mesmo y: centros verticais alinhados (a altura dos três difere em até ~1px)
        const centro = (b: { y: number; height: number }) => b.y + b.height / 2;
        expect(Math.abs(centro(busca) - centro(barra))).toBeLessThanOrEqual(1);
        expect(Math.abs(centro(busca) - centro(botao))).toBeLessThanOrEqual(1);

        // ordem horizontal sem sobreposição: busca | chips | botão
        expect(busca.x + busca.width).toBeLessThanOrEqual(barra.x + 0.5);
        expect(barra.x + barra.width).toBeLessThanOrEqual(botao.x + 0.5);
        expect(botao.x + botao.width).toBeLessThanOrEqual(viewport.width);

        // gap igual entre os grupos (10px, o mesmo da linha de antes)
        expect(barra.x - (busca.x + busca.width)).toBeCloseTo(10, 0);
        expect(botao.x - (barra.x + barra.width)).toBeCloseTo(10, 0);

        // a busca ocupa o que sobra, mas nunca menos de 240px
        expect(busca.width).toBeGreaterThanOrEqual(240);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("só 'Todos', o mês corrente e o anterior — com contagem, e o resto no ☰", async ({ page }) => {
        const botoes = page.locator("#month-filter-bar > button[id^='month-filter-']");
        await expect(botoes).toHaveCount(4); // Todos, atual, anterior e o ☰
        await expect(page.locator("#month-filter-all")).toHaveText("Todos");
        await expect(page.locator(`#month-filter-${ATUAL.key}`)).toHaveText(`${ATUAL.nome} (3)`);
        await expect(page.locator(`#month-filter-${ANTERIOR.key}`)).toHaveText(`${ANTERIOR.nome} (2)`);
        // ordem: Todos, corrente, anterior, ☰
        const ids = await botoes.evaluateAll((els) => els.map((el) => el.id));
        expect(ids).toEqual([
          "month-filter-all",
          `month-filter-${ATUAL.key}`,
          `month-filter-${ANTERIOR.key}`,
          "month-filter-more-toggle",
        ]);
        // os meses antigos NÃO são chips
        for (const antigo of ANTIGOS) await expect(page.locator(`#month-filter-${antigo.key}`)).toHaveCount(0);
        await expect(cards(page)).toHaveCount(TODOS_A);
      });

      test("cada chip filtra e a contagem de cards bate com o número do chip", async ({ page }) => {
        await page.locator(`#month-filter-${ATUAL.key}`).click();
        await expect(cards(page)).toHaveCount(3);
        await expect(page.locator(`#month-filter-${ATUAL.key}`)).toHaveClass(/bg-accent-dark/);
        await expect(page.locator("#month-filter-all")).not.toHaveClass(/bg-accent-dark/);

        await page.locator(`#month-filter-${ANTERIOR.key}`).click();
        await expect(cards(page)).toHaveCount(2);
        await expect(page.locator(`#month-filter-${ANTERIOR.key}`)).toHaveClass(/bg-accent-dark/);
        await expect(page.locator(`#month-filter-${ATUAL.key}`)).not.toHaveClass(/bg-accent-dark/);

        await page.locator("#month-filter-all").click();
        await expect(cards(page)).toHaveCount(TODOS_A);
        await expect(page.locator("#month-filter-all")).toHaveClass(/bg-accent-dark/);
      });

      test("o ☰ lista os demais meses (com contagem, do mais recente ao mais antigo) e filtra por eles", async ({
        page,
      }) => {
        const toggle = page.locator("#month-filter-more-toggle");
        await expect(toggle).toBeVisible();
        await expect(toggle).not.toHaveClass(/bg-accent-dark/);
        await toggle.click();

        const dropdown = page.locator("#month-filter-dropdown");
        await expect(dropdown).toBeVisible();
        const itens = await dropdown.locator("button").allInnerTexts();
        expect(itens.map((t) => t.replace(/\s+/g, " ").trim())).toEqual([
          `${ANTIGOS[0]!.nome} ${ANTIGOS[0]!.ano} (1)`,
          `${ANTIGOS[1]!.nome} ${ANTIGOS[1]!.ano} (2)`,
        ]);
        const d = await dropdown.boundingBox();
        expect(d!.x).toBeGreaterThanOrEqual(0);
        expect(d!.x + d!.width).toBeLessThanOrEqual(viewport.width);

        // escolhe um mês que não é chip: a lista filtra, o ☰ fica ativo e os chips ficam inativos
        await page.locator(`#month-filter-dropdown-${ANTIGOS[1]!.key}`).click();
        await expect(dropdown).toHaveCount(0);
        await expect(cards(page)).toHaveCount(2);
        await expect(toggle).toHaveClass(/bg-accent-dark/);
        for (const id of ["#month-filter-all", `#month-filter-${ATUAL.key}`, `#month-filter-${ANTERIOR.key}`]) {
          await expect(page.locator(id)).not.toHaveClass(/bg-accent-dark/);
        }

        // voltar para um chip desativa o ☰
        await page.locator(`#month-filter-${ANTERIOR.key}`).click();
        await expect(cards(page)).toHaveCount(2);
        await expect(toggle).not.toHaveClass(/bg-accent-dark/);
      });

      test("'+ Nova prestação' continua à direita e abre o formulário", async ({ page }) => {
        await page.locator("#btn-nova-prestacao").click();
        await expect(page.locator("#patient-form")).toBeVisible();
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("busca por texto continua combinando com o chip de mês", async ({ page }) => {
        await page.locator(`#month-filter-${ATUAL.key}`).click();
        await page.locator("#patient-search").fill("a2");
        await expect(cards(page)).toHaveCount(1);
        await page.locator("#btn-clear-search").click();
        await expect(cards(page)).toHaveCount(3);
      });
    });
  }

  test("mês corrente sem prestações continua como chip, com (0), e a lista fica vazia", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoPrestacao(page, { width: 1280, height: 800 }, CENARIO_B);

    await expect(page.locator(`#month-filter-${ATUAL.key}`)).toHaveText(`${ATUAL.nome} (0)`);
    await expect(page.locator(`#month-filter-${ANTERIOR.key}`)).toHaveText(`${ANTERIOR.nome} (2)`);
    await expect(cards(page)).toHaveCount(3);

    await page.locator(`#month-filter-${ATUAL.key}`).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByText("Nenhuma prestação ainda.")).toBeVisible();
  });

  test("sem nenhuma prestação: 'Todos' e os dois meses (0); o ☰ some", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoPrestacao(page, { width: 1280, height: 800 }, []);

    await expect(page.locator(`#month-filter-${ATUAL.key}`)).toHaveText(`${ATUAL.nome} (0)`);
    await expect(page.locator(`#month-filter-${ANTERIOR.key}`)).toHaveText(`${ANTERIOR.nome} (0)`);
    await expect(page.locator("#month-filter-more-toggle")).toHaveCount(0);
  });

  for (const viewport of [
    { name: "375px", width: 375, height: 667 },
    { name: "768px", width: 768, height: 1024 },
    { name: "1023px", width: 1023, height: 768 },
  ]) {
    test(`abaixo de lg (${viewport.name}): chips ocultos; ícone de filtro e painel 'Mês' listam todos os meses`, async ({
      page,
    }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
      await gotoPrestacao(page, viewport, CENARIO_A);

      await expect(page.locator("#month-filter-bar")).toBeHidden();
      await expect(page.locator("#month-filter-all")).toBeHidden();
      await expect(page.locator("#btn-nova-prestacao")).toBeHidden();
      await expect(page.locator("#btn-filtros-prestacao")).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);

      await page.locator("#btn-filtros-prestacao").click();
      await expect(page.locator("#prestacao-filtros-sheet")).toBeVisible();
      await page.locator("#sheet-filtro-mes").click();
      const opcoes = await page.locator("#sheet-filtro-mes-listbox [role=option]").allInnerTexts();
      expect(opcoes.map((t) => t.replace(/\s+/g, " ").trim())).toEqual([
        "Todos os meses",
        `${ATUAL.nome} ${ATUAL.ano} (3)`,
        `${ANTERIOR.nome} ${ANTERIOR.ano} (2)`,
        `${ANTIGOS[0]!.nome} ${ANTIGOS[0]!.ano} (1)`,
        `${ANTIGOS[1]!.nome} ${ANTIGOS[1]!.ano} (2)`,
      ]);
    });
  }

  test("sem aviso de hydration vindo da barra de meses (desktop e mobile)", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    // Os avisos de /prestacao que já existem (FloatingAddButton x cargo) ficam de fora: aqui só se exige que
    // nenhum aviso aponte para a barra de meses.
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 667 },
    ]) {
      const avisos: string[] = [];
      const pagina = await page.context().newPage();
      await gotoPrestacao(pagina, viewport, CENARIO_A, avisos);
      const daBarra = avisos.filter((texto) => /MonthFilterBar|month-filter/.test(texto));
      expect(daBarra, `avisos de hydration da barra de meses em ${viewport.width}px`).toEqual([]);
      await pagina.close();
    }
  });
});
