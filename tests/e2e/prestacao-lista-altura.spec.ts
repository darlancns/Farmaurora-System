import { test, expect, type Page } from "@playwright/test";

// Altura da lista de /prestacao e ícone da data do card.
//
// Em lg+ (>= 1024px) a PÁGINA NÃO ROLA: cabeçalho, busca e chips ficam parados no topo e a lista (PatientTable)
// ocupa todo o resto da tela, com rolagem própria — a barra de rolagem vai do topo da lista ao fim da tela, e o
// #app-main-content não rola (sem barra dupla). A altura vem da cadeia de flex/h-full (sem calc de viewport nem
// JS): redimensionar a janela reajusta a lista. Abaixo de lg nada mudou: a lista segue com o max-height de 4
// cards (inline) e a página rola; as travas do painel de filtros e do modal seguem valendo.
//
// As prestações são injetadas por page.route (só o GET de /api/patients; escrita nunca é enviada), então o spec
// roda igual no harness local e com credenciais reais, sem depender dos dados da conta.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback — só socio e administrador leem "patients")

// O Chromium headless esconde as barras de rolagem por padrão; ligadas, dá para medir a largura da barra.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SOCIO_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SOCIO_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const NOMES = [
  "Ana Souza",
  "Bruno Lima",
  "Carla Dias",
  "João Pedro Cardoso de Albuquerque Montenegro Filho",
  "Maria Eduarda Vasconcelos de Figueiredo e Albuquerque Lins",
];

function paciente(n: number) {
  const mes = [10, 9, 8][n % 3]!;
  const dia = (n % 28) + 1;
  const dd = String(dia).padStart(2, "0");
  return {
    id: `pat-${n}`,
    data: `${dd}/${String(mes).padStart(2, "0")}/2026`,
    paciente: `${NOMES[n % NOMES.length]} ${n}`,
    descricaoCompra: "Compra de teste",
    descricaoResumo: "Resumo",
    medicamentos: [{ qtd: "2", medicamento: "Medicamento X" }],
    empresa: "FARMAURORA",
    consultor: "Mateus Morais",
    alvara: 100,
    custoImportacao: 1000 + n,
    despesaTotal: 500,
    transporteTotal: 200,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    attachedSlots: [],
    createdAt: `2026-${String(mes).padStart(2, "0")}-${dd}T12:00:00Z`,
  };
}

const MUITAS = Array.from({ length: 45 }, (_, i) => paciente(i));
const POUCAS = Array.from({ length: 4 }, (_, i) => paciente(i));
// Em 1024x768, 1280x800 e 1280x600 a lista é baixa (602, 634 e 434px) e 4 cards (de 6 valores, em 2 níveis, no
// desenho médio: 161px cada) não cabem: lá o teste "cabe tudo" usa 2 prestações. (Em 1280x800 cabiam 4 enquanto os
// 6 valores ficavam numa linha só: 121px por card.)
const DUAS = POUCAS.slice(0, 2);

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
  await expect(page.locator("#patient-table-scroll")).toBeVisible();
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b, `${selector} precisa estar visível`).not.toBeNull();
  return b!;
}

interface Rolagem {
  top: number;
  client: number;
  scroll: number;
  barra: number; // largura da barra de rolagem (offsetWidth - clientWidth - bordas)
}
const rolagem = (page: Page, selector: string): Promise<Rolagem> =>
  page.locator(selector).evaluate((el) => {
    const c = getComputedStyle(el);
    const bordas = parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth);
    const h = el as HTMLElement;
    return { top: h.scrollTop, client: h.clientHeight, scroll: h.scrollHeight, barra: h.offsetWidth - h.clientWidth - bordas };
  });

const TOPO = ["#dashboard-page > :first-child", "#patient-search", "#month-filter-bar", "#btn-nova-prestacao"];

test.describe("Lista de /prestacao ocupa o resto da tela (lg+)", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "1024x768", width: 1024, height: 768, poucas: DUAS },
    { name: "1280x800", width: 1280, height: 800, poucas: DUAS },
    { name: "1440x900", width: 1440, height: 900, poucas: POUCAS },
    { name: "1920x1080", width: 1920, height: 1080, poucas: POUCAS },
    { name: "1280x600", width: 1280, height: 600, poucas: DUAS },
  ]) {
    test.describe(viewport.name, () => {
      test("com 45 prestações: a lista vai até o fim da tela, rola sozinha e a página não rola", async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport, MUITAS);

        // a base da lista fica no fim da área visível (a do <main>, que é a tela toda) — tolerância de 2px
        const main = await box(page, "#app-main-content");
        const lista = await box(page, "#patient-table-scroll");
        expect(Math.abs(lista.y + lista.height - (main.y + main.height))).toBeLessThanOrEqual(2);
        expect(Math.abs(lista.y + lista.height - viewport.height)).toBeLessThanOrEqual(2);
        // a lista começa logo abaixo da busca/chips (não foi empurrada) e tem altura de sobra
        expect(lista.height).toBeGreaterThan(300);

        // a lista é o contêiner de rolagem, e a barra existe
        const l = await rolagem(page, "#patient-table-scroll");
        expect(l.scroll).toBeGreaterThan(l.client + 100);
        expect(await page.locator("#patient-table-scroll").evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
        if (process.platform !== "darwin") expect(l.barra, "largura da barra de rolagem da lista").toBeGreaterThan(0);
        // sem teto de 4 cards (o max-height inline é anulado em lg+)
        expect(await page.locator("#patient-table-scroll").evaluate((el) => getComputedStyle(el).maxHeight)).toBe("none");

        // o <main> não rola: sem barra de rolagem dupla
        const m = await rolagem(page, "#app-main-content");
        expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
        const raiz = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
        expect(raiz).toBeLessThanOrEqual(1);
      });

      test("a roda sobre a lista rola a lista, não o <main>; cabeçalho, busca e chips ficam parados", async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport, MUITAS);

        const antes = new Map<string, Awaited<ReturnType<typeof box>>>();
        for (const s of TOPO) antes.set(s, await box(page, s));

        const lista = await box(page, "#patient-table-scroll");
        await page.mouse.move(lista.x + lista.width / 2, lista.y + lista.height / 2);
        await page.mouse.wheel(0, 700);
        await expect.poll(async () => (await rolagem(page, "#patient-table-scroll")).top).toBeGreaterThan(300);

        expect((await rolagem(page, "#app-main-content")).top).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
        for (const s of TOPO) {
          const depois = await box(page, s);
          const a = antes.get(s)!;
          expect(Math.abs(depois.y - a.y), `${s}: y`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(depois.x - a.x), `${s}: x`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(depois.height - a.height), `${s}: altura`).toBeLessThanOrEqual(0.5);
        }
        // a lista não se moveu nem mudou de tamanho: só o conteúdo rolou
        const lista2 = await box(page, "#patient-table-scroll");
        expect(Math.abs(lista2.y - lista.y)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(lista2.height - lista.height)).toBeLessThanOrEqual(0.5);
      });

      test("no fim da rolagem o último card fica inteiro, com respiro dentro da lista", async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport, MUITAS);

        await page.locator("#patient-table-scroll").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        // o último card do DOM (a página ordena a lista; a ordem do array injetado não vale)
        const ultimo = await box(page, "#patient-table-scroll > :last-child > [id^=patient-row-]");
        const lista = await box(page, "#patient-table-scroll");
        expect(ultimo.y).toBeGreaterThanOrEqual(lista.y - 0.5); // inteiro: não cortado em cima…
        const respiro = lista.y + lista.height - (ultimo.y + ultimo.height);
        expect(respiro, "respiro entre o último card e o fim da tela").toBeGreaterThanOrEqual(16); // …nem colado embaixo
        // e a barra chega ao fim da tela: a lista termina onde a tela termina
        expect(Math.abs(lista.y + lista.height - viewport.height)).toBeLessThanOrEqual(2);
      });

      test(`com ${viewport.poucas.length} prestações (cabem na tela) não há barra de rolagem na lista nem no <main>`, async ({
        page,
      }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoPrestacao(page, viewport, viewport.poucas);

        const l = await rolagem(page, "#patient-table-scroll");
        expect(l.scroll).toBeLessThanOrEqual(l.client + 1);
        expect(l.barra).toBeLessThanOrEqual(0);
        const m = await rolagem(page, "#app-main-content");
        expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
        expect(m.barra).toBeLessThanOrEqual(0);
      });
    });
  }

  test("redimensionar a janela (900 -> 600 de altura) reajusta a lista sem recarregar", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoPrestacao(page, { width: 1280, height: 900 }, MUITAS);
    const fimDaLista = async () => {
      const b = await box(page, "#patient-table-scroll");
      return b.y + b.height;
    };
    expect(Math.abs((await fimDaLista()) - 900)).toBeLessThanOrEqual(2);
    const marca = await page.evaluate(() => {
      (window as unknown as { __marca: number }).__marca = 1;
      return 1;
    });

    await page.setViewportSize({ width: 1280, height: 600 });
    await expect.poll(fimDaLista).toBeGreaterThan(597);
    expect(Math.abs((await fimDaLista()) - 600)).toBeLessThanOrEqual(2);
    expect((await rolagem(page, "#app-main-content")).scroll).toBeLessThanOrEqual(600 + 1);

    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect.poll(fimDaLista).toBeGreaterThan(997);
    // sem recarregar a página (a marca do window continua lá)
    expect(await page.evaluate(() => (window as unknown as { __marca?: number }).__marca)).toBe(marca);
  });
});

test.describe("Abaixo de lg a lista e a rolagem são as de sempre", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 667 },
    { name: "768px", width: 768, height: 1024 },
    { name: "1023px", width: 1023, height: 768 },
  ]) {
    test(`${viewport.name}: lista com teto de 4 cards, raiz em bloco e travas do painel e do modal intactas`, async ({
      page,
    }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
      await gotoPrestacao(page, viewport, MUITAS);

      // layout de hoje: raiz em bloco (não flex), lista com max-height inline (px) e sem flex-1. O <main> segue sendo
      // quem rola a página quando o conteúdo passa da tela (em 768x1024 os 4 cards cabem e nem rola).
      expect(await page.locator("#dashboard-page").evaluate((el) => getComputedStyle(el).display)).toBe("block");
      expect(await page.locator("#app-main-content").evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
      const estiloLista = await page.locator("#patient-table-scroll").evaluate((el) => {
        const c = getComputedStyle(el);
        return { maxHeight: c.maxHeight, flexGrow: c.flexGrow, inline: (el as HTMLElement).style.maxHeight };
      });
      expect(estiloLista.maxHeight).toMatch(/^\d+(\.\d+)?px$/);
      expect(estiloLista.inline).toMatch(/px$/);
      expect(estiloLista.flexGrow).toBe("0");

      // travas: com o painel de filtros aberto e com o modal do formulário aberto, a lista não rola por trás
      const overflowDaLista = () => page.locator("#patient-table-scroll").evaluate((el) => getComputedStyle(el).overflowY);
      expect(await overflowDaLista()).toBe("auto");
      await page.locator("#btn-filtros-prestacao").click();
      await expect(page.locator("#prestacao-filtros-sheet")).toBeVisible();
      expect(await overflowDaLista()).toBe("hidden");
      await page.keyboard.press("Escape");
      await expect(page.locator("#prestacao-filtros-sheet")).toHaveCount(0);
      expect(await overflowDaLista()).toBe("auto");

      await page.locator("#fab-nova-prestacao").click();
      await expect(page.locator("#patient-form")).toBeVisible();
      expect(await overflowDaLista()).toBe("hidden");
    });
  }
});

test.describe("Ícone de calendário ao lado da data do card", () => {
  test.describe.configure({ retries: 2 });

  // d do SVG de calendário do card de Follow-Up (ProcessoRow) — o glifo de documento antigo começava com "M19.5 14.25"
  const CALENDARIO = /^M6\.75 3v2\.25M17\.25 3v2\.25/;

  for (const viewport of [
    { name: "largo (>= 1180 de card)", width: 1920, height: 1080 },
    { name: "médio (640 a 1179 de card)", width: 1280, height: 800 },
    { name: "estreito (< 640 de card)", width: 375, height: 667 },
  ]) {
    test(`modo ${viewport.name}: calendário decorativo, quadradinho 28px e data em texto`, async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
      await gotoPrestacao(page, viewport, POUCAS);

      const id = POUCAS[0]!.id;
      const tile = page.locator(`#patient-data-${id} span[aria-hidden="true"]`);
      await expect(tile).toBeVisible();
      const t = await tile.boundingBox();
      expect(Math.abs(t!.width - 28)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(t!.height - 28)).toBeLessThanOrEqual(0.5);

      const svg = tile.locator("svg");
      const s = await svg.boundingBox();
      expect(Math.abs(s!.width - 16)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s!.height - 16)).toBeLessThanOrEqual(0.5);
      expect(await svg.locator("path").getAttribute("d")).toMatch(CALENDARIO);
      // quadradinho com fundo claro e ícone na cor da empresa (Farmaurora = azul)
      expect(await tile.evaluate((el) => el.className)).toMatch(/bg-farm-blue-soft/);
      expect(await tile.evaluate((el) => el.className)).toMatch(/text-farm-blue/);
      // centralizado no quadradinho
      expect(Math.abs(s!.x + s!.width / 2 - (t!.x + t!.width / 2))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s!.y + s!.height / 2 - (t!.y + t!.height / 2))).toBeLessThanOrEqual(0.5);

      // a data continua como texto, ao lado do ícone
      await expect(page.locator(`#patient-data-${id}`)).toContainText(POUCAS[0]!.data);
    });
  }
});

test("sem aviso de hydration vindo da lista nem do ícone (desktop e mobile)", async ({ page }) => {
  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
  // Os avisos de /prestacao que já existem (FloatingAddButton x cargo) ficam de fora: aqui só se exige que nenhum
  // aviso aponte para a lista, o card ou o ícone.
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 667 },
  ]) {
    const avisos: string[] = [];
    const pagina = await page.context().newPage();
    await gotoPrestacao(pagina, viewport, MUITAS, avisos);
    const nossos = avisos.filter((texto) => /PatientTable|PatientRow|patient-table|patient-row/.test(texto));
    expect(nossos, `avisos de hydration da lista em ${viewport.width}px`).toEqual([]);
    await pagina.close();
  }
});
