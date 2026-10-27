import { test, expect, type Locator, type Page } from "@playwright/test";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";

// Card de /prestacao (data + divisória | nome e medicamento | valores | selo de status | ações) e o status manual
// "Em andamento" / "Concluída" (PATCH /api/patients/:id/status). Roda só no Supabase falso do harness (a guarda
// aborta fora de loopback). Os dados são criados e apagados pela API; o nome leva um RUN numérico.
//
// Desenhos por largura do CARD (não da janela — a sidebar come ~240px): estreito < 640 (celular), médio
// 640–1179 (tablet e desktop apertado), largo >= 1180 (linha única). Com a sidebar: 1440px => card 1196 (largo);
// 1280px => 1036 e 1024px => 780 (médio); 768px => 716 (médio); 390px => 338 e 375px => 323 (estreito).
//
// Contas (env): E2E_ADMIN_* escreve; E2E_OPERACIONAL_* e E2E_CONSULTOR_* não têm acesso a /api/patients (403).
// O ramo `readonly` do card é inalcançável por cargo real (quem lê Prestação também escreve), então não há
// asserção de UI para ele aqui.

assertSupabaseLocal();

const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
const operacional = { email: process.env.E2E_OPERACIONAL_EMAIL ?? "", password: process.env.E2E_OPERACIONAL_PASSWORD ?? "" };
const consultor = { email: process.env.E2E_CONSULTOR_EMAIL ?? "", password: process.env.E2E_CONSULTOR_PASSWORD ?? "" };
const hasAdmin = Boolean(admin.email && admin.password);

const RUN = String(Date.now()).slice(-9);
const NOME_NORMAL = `Ana Cartao ${RUN}`;
// 52 caracteres + RUN: passa dos ~40 que o desenho precisa acomodar sem truncar.
const NOME_LONGO = `Maria Aparecida Conceição de Albuquerque Montenegro ${RUN}`;
const NOME_PREJUIZO = `Beatriz Prejuizo ${RUN}`;

const base = {
  descricaoCompra: "Compra de medicamentos importados",
  medicamentos: [{ qtd: "1", medicamento: "Pembrolizumabe 100mg" }],
  empresa: "FARMAURORA",
  despesaTotal: 0,
  transporteTotal: 0,
  despachanteRemessas: 0,
  transporteRemessas: 0,
  despesasPorRemessa: [] as string[],
  transportesPorRemessa: [] as string[],
  remessas: 1,
};

interface Semente {
  id: string;
  nome: string;
}
const criados: Semente[] = [];
let idNormal = "";
let idLongo = "";
let idPrejuizo = "";

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function semear(page: Page, nome: string, extra: Record<string, unknown>): Promise<string> {
  const res = await page.request.post("/api/patients", { data: { ...base, paciente: nome, ...extra } });
  expect(res.ok(), `criar ${nome}`).toBeTruthy();
  const { id } = (await res.json()) as { id: string };
  criados.push({ id, nome });
  return id;
}

async function abrir(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/prestacao", { waitUntil: "networkidle" });
  await expect(page.locator(`#patient-row-${idNormal}`)).toBeVisible();
  // abaixo de lg a lista tem altura máxima de 4 cards e rolagem própria: solta para medir todos os cards. Em lg+ ela
  // ocupa o resto da tela (flex-1) e esta injeção não a libera — sem efeito aqui: o boundingBox é o do layout e vale
  // também para cards fora da área visível (e estes poucos cards cabem na tela).
  await page.addStyleTag({ content: "#patient-table-scroll{max-height:none !important}" });
}

interface Caixa {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(locator: Locator): Promise<Caixa> {
  const b = await locator.boundingBox();
  expect(b, "boundingBox").not.toBeNull();
  return b!;
}
const centroY = (b: Caixa) => b.y + b.height / 2;

// Caixa do TEXTO renderizado (Range): detecta texto que vaza do elemento mesmo com overflow visível.
async function caixaDoTexto(locator: Locator): Promise<Caixa> {
  return locator.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

async function semRolagemHorizontal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    const main = document.querySelector("#app-main-content");
    const lista = document.querySelector("#patient-table-scroll");
    const estoura = (el: Element | null) => (el ? el.scrollWidth > el.clientWidth + 1 : false);
    return !(raiz.scrollWidth > window.innerWidth + 1 || estoura(main) || estoura(lista));
  });
}

const VALORES = ["alvara", "custo", "nota", "imposto"] as const;

test.describe("Prestação — card e status", () => {
  // Mesmo recurso dos outros specs: o dev server às vezes derruba o worker no meio da suíte.
  test.describe.configure({ retries: 2 });

  test.beforeAll(async ({ browser }) => {
    if (!hasAdmin) return;
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    await login(page, admin.email, admin.password);
    idNormal = await semear(page, NOME_NORMAL, {
      data: "15/10/2026",
      descricaoResumo: "Enhertu 100mg",
      consultor: "",
      alvara: 80000,
      custoImportacao: 20000,
    });
    idLongo = await semear(page, NOME_LONGO, {
      data: "10/10/2026",
      descricaoResumo: "Pembrolizumabe 100mg/4mL + Ipilimumabe 50mg + Atezolizumabe 1200mg para teste de texto longo",
      consultor: "Gabriela Santana",
      alvara: 1234567.89,
      custoImportacao: 345678.9,
      despesaTotal: 12345.67,
      transporteTotal: 4321.09,
      despachanteRemessas: 1,
      transporteRemessas: 1,
      despesasPorRemessa: ["12345.67"],
      transportesPorRemessa: ["4321.09"],
    });
    idPrejuizo = await semear(page, NOME_PREJUIZO, {
      data: "22/10/2026",
      descricaoResumo: "Keytruda 100mg",
      consultor: "Paulo Braga",
      alvara: 10000,
      custoImportacao: 15000,
    });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!hasAdmin || criados.length === 0) return;
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    await login(page, admin.email, admin.password);
    for (const { id } of criados) await page.request.delete(`/api/patients/${id}`);
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL/PASSWORD");
    await login(page, admin.email, admin.password);
  });

  test("desktop largo (1440): data sem dia da semana, divisória, nome e medicamento, 4 valores, selo e 4 botões em UMA linha", async ({
    page,
  }) => {
    await abrir(page, 1440, 900);
    const card = page.locator(`#patient-row-${idNormal}`);
    const cardBox = await box(card);
    expect(cardBox.width).toBeGreaterThanOrEqual(1180);

    // data: só DD/MM/AAAA, sem dia da semana, sem consultor (este paciente não tem)
    const dataCel = page.locator(`#patient-data-${idNormal}`);
    const textoData = ((await dataCel.innerText()) ?? "").trim();
    expect(textoData).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(textoData).not.toMatch(/segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|\b(seg|ter|qua|qui|sex|sáb|sab|dom)\b/i);

    // divisória vertical à direita do bloco da data, antes do nome
    const dataBox = await box(dataCel);
    const nomeBox = await box(page.locator(`#patient-nome-${idNormal}`));
    expect(await dataCel.evaluate((el) => parseFloat(getComputedStyle(el).borderRightWidth))).toBeGreaterThan(0);
    expect(dataBox.x + dataBox.width).toBeLessThanOrEqual(nomeBox.x + 0.5);

    // nome em negrito + medicamento cinza logo abaixo
    const nome = page.locator(`#patient-nome-${idNormal} > span`).nth(0);
    const medicamento = page.locator(`#patient-nome-${idNormal} > span`).nth(1);
    await expect(nome).toHaveText(NOME_NORMAL);
    await expect(medicamento).toHaveText("Enhertu 100mg");
    expect(Number(await nome.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
    expect((await box(medicamento)).y).toBeGreaterThanOrEqual((await box(nome)).y + (await box(nome)).height - 1);

    // 4 valores: rótulo pequeno em cima, valor embaixo; ordem da esquerda para a direita
    let xAnterior = -1;
    for (const chave of VALORES) {
      const celula = page.locator(`#patient-valor-${chave}-${idNormal}`);
      const rotulo = celula.locator("span").nth(0);
      const valor = celula.locator("span").nth(1);
      const rotuloBox = await box(rotulo);
      const valorBox = await box(valor);
      expect(valorBox.y, `${chave}: valor abaixo do rótulo`).toBeGreaterThan(rotuloBox.y);
      const celBox = await box(celula);
      expect(celBox.x, `${chave}: ordem`).toBeGreaterThan(xAnterior);
      xAnterior = celBox.x;
    }
    await expect(page.locator(`#patient-valor-alvara-${idNormal} span`).nth(0)).toHaveText("Alvará");
    await expect(page.locator(`#patient-valor-custo-${idNormal} span`).nth(0)).toHaveText("Custo");
    await expect(page.locator(`#patient-valor-nota-${idNormal} span`).nth(0)).toHaveText("Nota");
    await expect(page.locator(`#patient-valor-imposto-${idNormal} span`).nth(0)).toHaveText("Imposto");
    await expect(page.locator(`#patient-valor-alvara-${idNormal} span`).nth(1)).toHaveText("R$80.000,00");

    // sem divisórias entre os valores: nenhuma célula de valor tem borda
    for (const chave of VALORES) {
      const celula = page.locator(`#patient-valor-${chave}-${idNormal}`);
      expect(
        await celula.evaluate((el) => {
          const s = getComputedStyle(el);
          return [s.borderLeftWidth, s.borderRightWidth, s.borderTopWidth, s.borderBottomWidth].every((w) => parseFloat(w) === 0);
        }),
        `${chave}: sem borda`,
      ).toBe(true);
    }

    // selo + 4 botões, na ordem data | nome | valores | selo | botões, todos na mesma linha
    const status = page.locator(`#patient-status-${idNormal}`);
    const word = page.locator(`#btn-generate-word-${idNormal}`);
    const whats = page.locator(`#btn-copy-whatsapp-${idNormal}`);
    const editar = page.locator(`#btn-edit-patient-${idNormal}`);
    const excluir = page.locator(`#btn-delete-patient-${idNormal}`);
    for (const el of [status, word, whats, editar, excluir]) await expect(el).toBeVisible();
    const valoresBox = await box(page.locator(`#patient-valores-${idNormal}`));
    const statusBox = await box(status);
    const botoes = [await box(word), await box(whats), await box(editar), await box(excluir)];
    expect(nomeBox.x + nomeBox.width).toBeLessThanOrEqual(valoresBox.x + 0.5);
    expect(valoresBox.x + valoresBox.width).toBeLessThanOrEqual(statusBox.x + 0.5);
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(botoes[0]!.x + 0.5);
    for (let i = 1; i < botoes.length; i++) expect(botoes[i]!.x).toBeGreaterThan(botoes[i - 1]!.x);
    expect(botoes[3]!.x + botoes[3]!.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);

    // centralizados verticalmente em relação ao card
    const centroCard = centroY(cardBox);
    const dataTexto = await caixaDoTexto(dataCel.locator("span.font-mono"));
    for (const [rotulo, b] of [
      ["data", dataTexto],
      ["nome+medicamento", nomeBox],
      ["valores", valoresBox],
      ["selo", statusBox],
      ["botões", botoes[0]!],
    ] as const) {
      expect(Math.abs(centroY(b) - centroCard), `${rotulo} centrado verticalmente`).toBeLessThanOrEqual(3);
    }

    // faixa de destaque na borda esquerda (como hoje)
    const faixa = card.locator("> div").first();
    const faixaBox = await box(faixa);
    expect(Math.round(faixaBox.width)).toBe(4);
    expect(Math.round(faixaBox.height)).toBe(Math.round(cardBox.height - 2));
  });

  test("o que NÃO entra: sem ícone ao lado do nome, sem selo Convênio/Judicial, sem menu de três pontos", async ({ page }) => {
    await abrir(page, 1440, 900);
    const card = page.locator(`#patient-row-${idLongo}`);

    // nenhum ícone/imagem dentro do bloco do nome
    expect(await page.locator(`#patient-nome-${idLongo} svg, #patient-nome-${idLongo} img`).count()).toBe(0);
    // nada entre a divisória e o nome: o bloco do nome começa logo depois da célula da data
    const dataBox = await box(page.locator(`#patient-data-${idLongo}`));
    const nomeBox = await box(page.locator(`#patient-nome-${idLongo}`));
    expect(nomeBox.x - (dataBox.x + dataBox.width)).toBeLessThanOrEqual(24);

    const texto = (await card.innerText()).toLowerCase();
    expect(texto).not.toContain("convênio");
    expect(texto).not.toContain("convenio");
    expect(texto).not.toContain("judicial");

    // só os botões esperados: selo + Word + WhatsApp + editar + excluir (nenhum "⋮")
    const rotulos = await card.locator("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(rotulos).toHaveLength(5);
    expect(rotulos[0]).toMatch(/^Status: /);
    expect(rotulos.slice(1)).toEqual(["Gerar Word", "Copiar mensagem do WhatsApp", "Editar", "Excluir"]);
    expect(texto).not.toContain("⋮");
    expect(texto).not.toContain("⋯");
  });

  test("nome de 40+ caracteres e valores de 7 dígitos sem truncar (largo, médio e estreito)", async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [375, 667],
    ] as const) {
      await abrir(page, width, height);
      const card = page.locator(`#patient-row-${idLongo}`);
      const cardBox = await box(card);

      // nome inteiro, quebrando em linhas (até 2 no largo), sem reticências nem corte
      const nome = page.locator(`#patient-nome-${idLongo} > span`).nth(0);
      await expect(nome).toHaveText(NOME_LONGO);
      expect(await nome.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}: nome sem corte`).toBe(true);
      expect(await nome.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
      const linhas = Math.round((await box(nome)).height / (await nome.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))));
      // Este paciente tem 6 valores. No desenho largo o bloco de 6 valores ocupa o mesmo espaço do de 4 (colunas nos
      // mesmos x — prestacao-card-valores.spec.ts), então o nome perde 120px: em 1440 (card de 1196) a coluna do nome
      // tem 234px e o nome de 52+ caracteres quebra em 3 linhas; em 1920 (card de 1396) segue em até 2.
      const maxLinhas = cardBox.width >= 1300 ? 2 : 3;
      if (cardBox.width >= 1180) expect(linhas, `${width}: nome em até ${maxLinhas} linhas no largo`).toBeLessThanOrEqual(maxLinhas);

      // seis valores (Despachante/Transporte entram), todos inteiros e dentro do card, sem colidir com o próximo
      const chaves = ["alvara", "custo", "despachante", "transporte", "nota", "imposto"];
      const textos: Caixa[] = [];
      for (const chave of chaves) {
        const valor = page.locator(`#patient-valor-${chave}-${idLongo} span`).nth(1);
        const t = await caixaDoTexto(valor);
        expect(t.x + t.width, `${width} ${chave}: dentro do card`).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        expect(t.x, `${width} ${chave}: dentro do card`).toBeGreaterThanOrEqual(cardBox.x);
        textos.push(t);
      }
      await expect(page.locator(`#patient-valor-alvara-${idLongo} span`).nth(1)).toHaveText("R$1.234.567,89");
      await expect(page.locator(`#patient-valor-imposto-${idLongo} span`).nth(1)).toHaveText("R$197.530,86");
      // nenhum valor se sobrepõe a outro
      for (let i = 0; i < textos.length; i++) {
        for (let j = i + 1; j < textos.length; j++) {
          const a = textos[i]!;
          const b = textos[j]!;
          const sobrepoe = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(sobrepoe, `${width}: ${chaves[i]} × ${chaves[j]}`).toBe(false);
        }
      }
      expect(await semRolagemHorizontal(page), `${width}: sem rolagem horizontal`).toBe(true);
    }
  });

  test("ponto de quebra pela largura do card: largo (linha única) >= 1180, médio e estreito empilham", async ({ page }) => {
    const esperado: Array<[number, number, "largo" | "medio" | "estreito"]> = [
      [1920, 900, "largo"],
      [1440, 900, "largo"],
      [1280, 800, "medio"],
      [1024, 768, "medio"],
      [768, 1024, "medio"],
      [390, 844, "estreito"],
      [375, 667, "estreito"],
    ];
    for (const [width, height, modo] of esperado) {
      await abrir(page, width, height);
      const cardBox = await box(page.locator(`#patient-row-${idNormal}`));
      const nome = await box(page.locator(`#patient-nome-${idNormal}`));
      const valores = await box(page.locator(`#patient-valores-${idNormal}`));
      const status = await box(page.locator(`#patient-status-${idNormal}`));
      const botao = await box(page.locator(`#btn-generate-word-${idNormal}`));
      const rotulo = `${width}px (card ${Math.round(cardBox.width)})`;

      if (modo === "largo") {
        expect(cardBox.width, rotulo).toBeGreaterThanOrEqual(1180);
        // tudo na mesma linha
        expect(valores.y, `${rotulo}: valores na linha do nome`).toBeLessThan(nome.y + nome.height);
        expect(status.y, rotulo).toBeLessThan(nome.y + nome.height);
      } else if (modo === "medio") {
        expect(cardBox.width, rotulo).toBeGreaterThanOrEqual(640);
        expect(cardBox.width, rotulo).toBeLessThan(1180);
        // valores numa 2ª linha, abaixo do nome; selo e botões na linha do nome
        expect(valores.y, `${rotulo}: valores abaixo do nome`).toBeGreaterThanOrEqual(nome.y + nome.height - 1);
        expect(status.y + status.height, rotulo).toBeLessThanOrEqual(valores.y);
        expect(botao.y + botao.height, rotulo).toBeLessThanOrEqual(valores.y);
      } else {
        expect(cardBox.width, rotulo).toBeLessThan(640);
        // cabeçalho (data + selo), nome, valores e botões, de cima para baixo
        const data = await box(page.locator(`#patient-data-${idNormal}`));
        expect(status.y, `${rotulo}: selo no cabeçalho, ao lado da data`).toBeLessThan(data.y + data.height);
        expect(nome.y, rotulo).toBeGreaterThanOrEqual(data.y + data.height - 1);
        expect(valores.y, rotulo).toBeGreaterThanOrEqual(nome.y + nome.height - 1);
        expect(botao.y, rotulo).toBeGreaterThanOrEqual(valores.y + valores.height - 1);
      }
      expect(await semRolagemHorizontal(page), `${rotulo}: sem rolagem horizontal`).toBe(true);
    }
  });

  test("mobile/tablet: 4 valores inteiros em grade, selo visível sem sobreposição, toque dos botões e nome sem truncar", async ({ page }) => {
    for (const [width, height] of [
      [375, 667],
      [390, 844],
      [768, 1024],
    ] as const) {
      await abrir(page, width, height);
      for (const id of [idNormal, idLongo, idPrejuizo]) {
        const card = page.locator(`#patient-row-${id}`);
        const cardBox = await box(card);
        const rotulo = `${width}px #${id}`;

        // selo visível, dentro do card, sem sobrepor botões, nome nem valores
        const status = await box(page.locator(`#patient-status-${id}`));
        expect(status.x, rotulo).toBeGreaterThanOrEqual(cardBox.x);
        expect(status.x + status.width, rotulo).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        const outros = [
          ...(await Promise.all(
            [`#btn-generate-word-${id}`, `#btn-copy-whatsapp-${id}`, `#btn-edit-patient-${id}`, `#btn-delete-patient-${id}`].map((s) => box(page.locator(s))),
          )),
          await box(page.locator(`#patient-nome-${id}`)),
          await box(page.locator(`#patient-valores-${id}`)),
        ];
        for (const o of outros) {
          const sobrepoe = status.x < o.x + o.width && o.x < status.x + status.width && status.y < o.y + o.height && o.y < status.y + status.height;
          expect(sobrepoe, `${rotulo}: selo não sobrepõe`).toBe(false);
        }

        // valores inteiros: dentro do card e das caixas das suas células
        const chaves = id === idLongo ? ["alvara", "custo", "despachante", "transporte", "nota", "imposto"] : [...VALORES];
        for (const chave of chaves) {
          const valor = page.locator(`#patient-valor-${chave}-${id} span`).nth(1);
          const t = await caixaDoTexto(valor);
          expect(t.x + t.width, `${rotulo} ${chave}`).toBeLessThanOrEqual(cardBox.x + cardBox.width - 4);
          const cel = await box(page.locator(`#patient-valor-${chave}-${id}`));
          expect(t.x + t.width, `${rotulo} ${chave}: não vaza da célula`).toBeLessThanOrEqual(cel.x + cel.width + 1);
        }

        // nome sem truncar
        const nome = page.locator(`#patient-nome-${id} > span`).nth(0);
        expect(await nome.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${rotulo}: nome`).toBe(true);
        expect(await nome.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");

        // toque dos botões: abaixo de md (768, desenho estreito) 40 de altura (exceção consciente ao 44) e largura >= 44
        // (cada um tem ~68px); de md em diante 33px, o mesmo de antes
        const minimoAltura = width < 768 ? 40 : 33;
        const minimoLargura = width < 768 ? 44 : 33;
        const botoesToque = [`#btn-generate-word-${id}`, `#btn-copy-whatsapp-${id}`, `#btn-edit-patient-${id}`, `#btn-delete-patient-${id}`];
        const caixasToque: Caixa[] = [];
        for (const s of botoesToque) {
          const b = await box(page.locator(s));
          expect(b.width, `${rotulo} ${s}`).toBeGreaterThanOrEqual(minimoLargura);
          expect(b.height, `${rotulo} ${s}`).toBeGreaterThanOrEqual(minimoAltura);
          caixasToque.push(b);
        }
        // estreito: os quatro dividem a largura do card por igual (diferença <= 1px), com 8px entre eles
        if (width < 768) {
          const larguras = caixasToque.map((b) => b.width);
          expect(Math.max(...larguras) - Math.min(...larguras), `${rotulo}: larguras iguais`).toBeLessThanOrEqual(1);
          for (const b of caixasToque) expect(Math.round(b.height), `${rotulo}: altura 40`).toBe(40);
          for (let i = 1; i < caixasToque.length; i++) {
            const gap = caixasToque[i]!.x - (caixasToque[i - 1]!.x + caixasToque[i - 1]!.width);
            expect(Math.abs(gap - 8), `${rotulo}: 8px entre botões`).toBeLessThanOrEqual(1);
          }
        }
        // o selo também tem área de toque de 44px abaixo de md (pseudo-elemento)
        if (width < 768) {
          const area = await page.locator(`#patient-status-${id}`).evaluate((el) => {
            const s = getComputedStyle(el, "::before");
            return { h: parseFloat(s.height), pos: s.position };
          });
          expect(area.pos).toBe("absolute");
          expect(area.h).toBeGreaterThanOrEqual(44);
        }
      }
      expect(await semRolagemHorizontal(page), `${width}: sem rolagem horizontal`).toBe(true);
    }
  });

  test("selo: aria-label, foco visível e clique alterna e PERSISTE após recarregar", async ({ page }) => {
    await abrir(page, 1440, 900);
    const selo = page.locator(`#patient-status-${idNormal}`);

    // padrão de prestação criada pela API sem status: Em andamento
    await expect(selo).toHaveText("Em andamento");
    await expect(selo).toHaveAttribute("aria-label", "Status: Em andamento. Alterar para Concluída");
    expect(await selo.evaluate((el) => el.tagName)).toBe("BUTTON");

    // foco visível (anel)
    await selo.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(selo).toBeFocused();
    const anel = await selo.evaluate((el) => {
      const s = getComputedStyle(el);
      return { estilo: s.outlineStyle, largura: parseFloat(s.outlineWidth) };
    });
    expect(anel.estilo).not.toBe("none");
    expect(anel.largura).toBeGreaterThanOrEqual(2);

    // alterna por teclado (Enter) -> Concluída, e persiste
    await page.keyboard.press("Enter");
    await expect(selo).toHaveText("Concluída");
    await expect(selo).toHaveAttribute("aria-label", "Status: Concluída. Alterar para Em andamento");
    await expect(selo).toBeEnabled();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#patient-status-${idNormal}`)).toHaveText("Concluída");
    const doServidor = await (await page.request.get(`/api/patients/${idNormal}`)).json();
    expect(doServidor.status).toBe("concluida");

    // clique volta para Em andamento e persiste
    await page.locator(`#patient-status-${idNormal}`).click();
    await expect(page.locator(`#patient-status-${idNormal}`)).toHaveText("Em andamento");
    await expect(page.locator(`#patient-status-${idNormal}`)).toBeEnabled();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#patient-status-${idNormal}`)).toHaveText("Em andamento");
    expect((await (await page.request.get(`/api/patients/${idNormal}`)).json()).status).toBe("em_andamento");
  });

  test("falha do servidor: o selo volta ao valor anterior, mostra mensagem clara e fica travado só durante o envio", async ({ page }) => {
    await abrir(page, 1440, 900);
    const selo = page.locator(`#patient-status-${idPrejuizo}`);
    await expect(selo).toHaveText("Em andamento");

    await page.route(`**/api/patients/${idPrejuizo}/status`, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ statusMessage: "Falha forçada" }) });
    });
    await selo.click();
    // otimista: troca na hora e trava enquanto o PATCH está em voo (um 2º clique não dispara outro)
    await expect(selo).toHaveText("Concluída");
    await expect(selo).toBeDisabled();
    await expect(selo).toHaveAttribute("aria-busy", "true");

    // falhou: reverte e avisa
    await expect(selo).toHaveText("Em andamento", { timeout: 5000 });
    await expect(selo).toBeEnabled();
    await expect(page.locator("#toast-notice")).toContainText("Não foi possível alterar o status");
    await expect(page.locator("#toast-notice")).toContainText("Falha forçada");
    await page.unroute(`**/api/patients/${idPrejuizo}/status`);
    expect((await (await page.request.get(`/api/patients/${idPrejuizo}`)).json()).status).toBe("em_andamento");
  });

  test("API: PATCH valida o enum (400), id inexistente (404); PUT de edição e POST não mexem no status", async ({ page }) => {
    const url = `/api/patients/${idLongo}/status`;
    for (const corpo of [{ status: "cancelada" }, { status: "concluída" }, {}, { status: 1 }]) {
      const res = await page.request.patch(url, { data: corpo });
      expect(res.status(), JSON.stringify(corpo)).toBe(400);
    }
    expect((await page.request.patch("/api/patients/p_inexistente/status", { data: { status: "concluida" } })).status()).toBe(404);

    // POST sem status: vale o padrão do banco
    const criado = await page.request.post("/api/patients", {
      data: { ...base, paciente: `Post Sem Status ${RUN}`, data: "01/10/2026", descricaoResumo: "X", consultor: "", alvara: 1, custoImportacao: 0 },
    });
    expect(criado.ok()).toBeTruthy();
    const nova = (await criado.json()) as { id: string; status: string };
    criados.push({ id: nova.id, nome: "post" });
    expect(nova.status).toBe("em_andamento");

    // PUT de edição (mesmo com status no corpo) não altera o status gravado
    expect((await page.request.patch(url, { data: { status: "concluida" } })).ok()).toBeTruthy();
    const atual = await (await page.request.get(`/api/patients/${idLongo}`)).json();
    const put = await page.request.put(`/api/patients/${idLongo}`, {
      data: { ...atual, descricaoResumo: `${atual.descricaoResumo} (editado)`, status: "em_andamento" },
    });
    expect(put.ok()).toBeTruthy();
    const depois = await (await page.request.get(`/api/patients/${idLongo}`)).json();
    expect(depois.status).toBe("concluida");
    expect(depois.descricaoResumo).toContain("(editado)");

    // devolve ao estado original (e o texto editado)
    await page.request.put(`/api/patients/${idLongo}`, { data: { ...depois, descricaoResumo: atual.descricaoResumo } });
    await page.request.patch(url, { data: { status: "em_andamento" } });
  });

  for (const [nome, conta] of [
    ["operacional", operacional],
    ["consultor", consultor],
  ] as const) {
    test(`cargo sem escrita em Prestação (${nome}): PATCH /status e PUT dão 403 e o status não muda`, async ({ page }) => {
      test.skip(!(conta.email && conta.password), `defina E2E_${nome.toUpperCase()}_EMAIL/PASSWORD`);
      await login(page, conta.email, conta.password);

      const patch = await page.request.patch(`/api/patients/${idNormal}/status`, { data: { status: "concluida" } });
      expect(patch.status()).toBe(403);
      const put = await page.request.put(`/api/patients/${idNormal}`, { data: { paciente: "x" } });
      expect(put.status()).toBe(403);

      // confere com o administrador que nada mudou
      await login(page, admin.email, admin.password);
      expect((await (await page.request.get(`/api/patients/${idNormal}`)).json()).status).toBe("em_andamento");
    });
  }

  test("sem aviso NOVO de hydration: só os dois conhecidos (botão + Nova prestação e o FAB), nunca o card", async ({ page }) => {
    const avisos: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "warning" || m.type() === "error") avisos.push(m.text());
    });
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await abrir(page, width, height);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(`#patient-status-${idNormal}`)).toBeVisible();
    }
    const hidratacao = avisos.filter((t) => /hydrat/i.test(t));
    for (const aviso of hidratacao) {
      expect(aviso, "o card não pode aparecer em aviso de hydration").not.toMatch(/PatientRow|PatientStatusBadge|PatientTable|patient-row|patient-status/);
    }
  });
});
