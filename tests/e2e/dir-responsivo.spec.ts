import { test, expect, type Page } from "@playwright/test";

// Responsividade de /dir. Abaixo de lg: cartões, filtros no painel aberto pelo ícone da busca e
// criação pelo "+" flutuante (id fab-novo-dir). Em lg+: tabela, filtros inline e o botão com texto.
// Também confere o BottomNav com o item DIR (administrador: 4 fixos + "Mais" = Prestações +
// Configurações; operacional: 4 fixos, sem "Mais").
//
// Cria 1 registro de teste pela API e apaga no fim — só roda no Supabase falso do harness
// (a guarda tests/e2e/_guards/globalSetup.ts aborta a suíte fora de loopback). Nunca em produção.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const operacional = cred("OPERACIONAL");
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);
const escritor = tem(admin) ? admin : operacional;

const PO = "PO26-12-9101";

const DTO = {
  po: PO,
  paciente: "E2E DIR RESPONSIVO",
  conferido: false,
  vendedor: "ASD",
  responsavel: "Bruno",
  exigencia: true,
  dataEmissao: "2026-12-01",
  dataCobrancaFornecedores: "2026-12-04",
  receita: "Original",
  medicamento: "MEDICAMENTO COM NOME BEM LONGO PARA TESTAR O TRUNCAMENTO DA COLUNA",
  temperatura: "Ambiente",
  fornecedor: "Care Pharma",
  envio: "Air Cargo",
  awb: "Lufthansa: 020-00000000",
  despachante: "STAR CUSTOMS",
  status: "on_going",
  dataEntrega: "",
  contratoCambio: "123456789",
  observacao: "TUDO OK",
  banco: "Sicoob",
  dataPagamento: "",
  operacaoEncerrada: false,
  fechamentoRestante: false,
  dactes: true,
  dsiDirDuimp: false,
  logger: false,
  fechamento: false,
  numerario: false,
  protocoloAssinado: false,
  swift: false,
  termometro: false,
};

async function login(page: Page, c: { email: string; password: string }): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(c.email);
    await page.locator("#login-password").fill(c.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function limpar(page: Page): Promise<void> {
  const todos = (await (await page.request.get("/api/dir")).json()) as Array<{ id: string; po: string }>;
  for (const r of todos.filter((d) => d.po === PO)) await page.request.delete(`/api/dir/${r.id}`);
}

async function abrirDir(page: Page, viewport: { width: number; height: number }, c = escritor): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page, c);
  await limpar(page);
  const criado = await page.request.post("/api/dir", { data: DTO });
  expect(criado.status()).toBe(200);
  await page.goto("/dir", { waitUntil: "networkidle" });
}

test.describe("Responsividade de /dir", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!tem(escritor), "defina E2E_ADMIN_* ou E2E_OPERACIONAL_*");

  test.afterEach(async ({ page }) => {
    await limpar(page);
  });

  test("lg+ (1280): tabela, filtros inline, botão com texto, sem '+' flutuante e sem painel de filtros", async ({ page }) => {
    await abrirDir(page, { width: 1280, height: 800 });

    await expect(page.locator("#sidebar-nav")).toBeVisible();
    await expect(page.locator("#bottom-nav")).toBeHidden();
    await expect(page.locator("#btn-novo-dir")).toBeVisible();
    await expect(page.locator("#fab-novo-dir")).toBeHidden();
    await expect(page.locator("#btn-filtros-dir")).toBeHidden();
    await expect(page.locator("#filtro-dir-banco")).toBeVisible();
    await expect(page.locator("#filtro-dir-checklist")).toBeVisible();

    await expect(page.locator("#dir-list-header")).toBeVisible();
    await expect(page.locator(`[id^='dir-row-']`, { hasText: PO })).toBeVisible();
    await expect(page.locator("[id^='dir-card-']").first()).toBeHidden();
    // chip de checklist com exigência: "! 1/8"
    await expect(page.locator(`[id^='dir-row-']`, { hasText: PO })).toContainText("! 1/8");
    // Banco como chip (ponto colorido + nome escrito), no lugar do texto da coluna.
    await expect(page.locator(`[id^='dir-row-']`, { hasText: PO }).locator("[id^='dir-banco-']")).toHaveText("Sicoob");
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("abaixo de lg (375): cartões, '+' flutuante, ícone de filtros dentro da busca; tabela e filtros inline somem", async ({ page }) => {
    await abrirDir(page, { width: 375, height: 667 });

    await expect(page.locator("#sidebar-nav")).toBeHidden();
    await expect(page.locator("#bottom-nav")).toBeVisible();
    await expect(page.locator("#fab-novo-dir")).toBeVisible();
    await expect(page.locator("#btn-novo-dir")).toBeHidden();
    await expect(page.locator("#btn-filtros-dir")).toBeVisible();
    await expect(page.locator("#filtro-dir-banco")).toBeHidden();
    await expect(page.locator("#dir-list-header")).toBeHidden();

    const cartao = page.locator("[id^='dir-card-']", { hasText: PO }).first();
    await expect(cartao).toBeVisible();
    await expect(cartao).toContainText("! 1/8");
    await expect(cartao.locator("[id^='dir-card-banco-']")).toHaveText("Sicoob");
    expect(await hasHorizontalOverflow(page)).toBe(false);

    // O "+" é um alvo de toque grande e fica acima do BottomNav.
    const fab = (await page.locator("#fab-novo-dir").boundingBox())!;
    const nav = (await page.locator("#bottom-nav").boundingBox())!;
    expect(fab.width).toBeGreaterThanOrEqual(44);
    expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y);

    // Conferido do cartão: alvo de toque >= 44px (o <label> que envolve a caixa).
    const alvo = (await cartao.locator("label").boundingBox())!;
    expect(alvo.width).toBeGreaterThanOrEqual(44);
    expect(alvo.height).toBeGreaterThanOrEqual(44);
  });

  test("abaixo de lg: painel de filtros abre pelo ícone, filtra na hora e a bolinha conta os ativos", async ({ page }) => {
    await abrirDir(page, { width: 375, height: 667 });

    await page.locator("#btn-filtros-dir").click();
    await expect(page.locator("#dir-filtros-sheet")).toBeVisible();

    await page.locator("#sheet-filtro-dir-banco").click();
    await page.locator("#sheet-filtro-dir-banco-listbox [role='option']", { hasText: "Sicoob" }).click();
    await page.locator("#btn-dir-filtros-aplicar").click();
    await expect(page.locator("#dir-filtros-sheet")).toHaveCount(0);

    await expect(page.locator("#badge-dir-filtros-ativos")).toHaveText("1");
    await expect(page.locator("[id^='dir-card-']", { hasText: PO }).first()).toBeVisible();

    // Limpar zera os filtros.
    await page.locator("#btn-filtros-dir").click();
    await page.locator("#btn-dir-filtros-limpar").click();
    await page.locator("#btn-dir-filtros-aplicar").click();
    await expect(page.locator("#badge-dir-filtros-ativos")).toHaveCount(0);
  });

  test("abaixo de lg: '+' abre o formulário em tela cheia", async ({ page }) => {
    await abrirDir(page, { width: 375, height: 667 });
    await page.locator("#fab-novo-dir").click();
    await expect(page.locator("#dir-form")).toBeVisible();
    const modal = (await page.locator("#dir-form-modal-overlay > div").boundingBox())!;
    expect(Math.round(modal.width)).toBe(375);
    expect(Math.round(modal.height)).toBe(667);
    await expect(page.locator("#btn-save-dir")).toBeVisible();
  });

  // Logística: "Cia aérea" e "AWB" lado a lado (meia largura cada) a partir de sm (640); abaixo de sm, um embaixo do outro
  // em largura total. A conta da sobra (tests/unit/dirFormLogisticaLayout.spec.ts) diz que o AWB cabe em meia largura; aqui
  // a medida no navegador: o texto mais largo (AWB de FedEx e o texto bruto antigo) não corta e o placeholder tem sobra.
  const LARGURAS_LOGISTICA = [
    { largura: 360, lado: false },
    { largura: 639, lado: false },
    { largura: 640, lado: true },
    { largura: 768, lado: true },
    { largura: 1023, lado: true },
    { largura: 1024, lado: true },
    { largura: 1280, lado: true },
  ];

  test("formulário: Cia aérea e AWB lado a lado a partir de sm, um embaixo do outro abaixo; AWB sem cortar", async ({ page }) => {
    await abrirDir(page, { width: 1280, height: 900 });

    for (const { largura, lado } of LARGURAS_LOGISTICA) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.locator(largura >= 1024 ? "#btn-novo-dir" : "#fab-novo-dir").click();
      await expect(page.locator("#dir-form")).toBeVisible();

      const caixa = async (seletor: string) => (await page.locator(seletor).boundingBox())!;
      const grade = await caixa("#dir-secao-logistica .grid");
      const rotuloCia = await caixa("label[for='df-companhia-aerea']");
      const rotuloAwb = await caixa("label[for='df-awb']");
      const cia = await caixa("#df-companhia-aerea");
      const awb = await caixa("#df-awb");
      const quando = `a ${largura}px`;

      if (lado) {
        const meia = (grade.width - 10) / 2; // 2 colunas, gap de 10px
        expect(Math.abs(rotuloCia.y - rotuloAwb.y), `mesma linha ${quando}`).toBeLessThanOrEqual(1);
        expect(cia.x, `Cia antes do AWB ${quando}`).toBeLessThan(awb.x);
        expect(Math.abs(cia.width - meia), `Cia com meia largura ${quando}`).toBeLessThanOrEqual(1);
        expect(Math.abs(awb.width - meia), `AWB com meia largura ${quando}`).toBeLessThanOrEqual(1);
        expect(Math.abs(awb.x + awb.width - (grade.x + grade.width)), `AWB termina na borda da seção ${quando}`).toBeLessThanOrEqual(1);
      } else {
        expect(awb.y, `AWB embaixo da Cia ${quando}`).toBeGreaterThan(cia.y + cia.height - 1);
        expect(Math.abs(cia.width - grade.width), `Cia em largura total ${quando}`).toBeLessThanOrEqual(1);
        expect(Math.abs(awb.width - grade.width), `AWB em largura total ${quando}`).toBeLessThanOrEqual(1);
      }

      // Sem a Origem, o Fornecedor ocupa a linha inteira e Envio | Despachante seguem em pares (sem célula vazia).
      await expect(page.locator("#df-origem")).toHaveCount(0);
      const fornecedor = await caixa("#df-fornecedor");
      const envio = await caixa("#df-envio");
      const despachante = await caixa("#df-despachante");
      expect(Math.abs(fornecedor.width - grade.width), `Fornecedor em largura total ${quando}`).toBeLessThanOrEqual(1);
      if (lado) {
        expect(Math.abs(envio.y - despachante.y), `Envio e Despachante na mesma linha ${quando}`).toBeLessThanOrEqual(1);
        expect(envio.x, `Envio antes do Despachante ${quando}`).toBeLessThan(despachante.x);
        expect(Math.abs(envio.width - (grade.width - 10) / 2), `Envio com meia largura ${quando}`).toBeLessThanOrEqual(1);
      } else {
        expect(despachante.y, `Despachante embaixo do Envio ${quando}`).toBeGreaterThan(envio.y + envio.height - 1);
      }
      expect(envio.y, `Envio abaixo do Fornecedor ${quando}`).toBeGreaterThan(fornecedor.y + fornecedor.height - 1);

      // O texto mais largo cabe: sem rolagem do texto e com sobra (medida com a fonte real do campo).
      for (const texto of ["8789 1818 0440", "Lufthansa: 020-01045494"]) {
        await page.locator("#df-awb").fill(texto);
        const m = await page.locator("#df-awb").evaluate((el: HTMLInputElement) => {
          const cs = getComputedStyle(el);
          const ctx = document.createElement("canvas").getContext("2d")!;
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const moldura =
            parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
          return {
            cortado: el.scrollWidth > el.clientWidth + 0.5,
            sobra: el.getBoundingClientRect().width - (ctx.measureText(el.value).width + moldura),
          };
        });
        expect(m.cortado, `"${texto}" cortado ${quando}`).toBe(false);
        expect(m.sobra, `sobra de "${texto}" ${quando}`).toBeGreaterThan(30);
      }
      await page.locator("#df-awb").fill("");
      const folga = await page.locator("#df-awb").evaluate((el: HTMLInputElement) => {
        const cs = getComputedStyle(el);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const moldura =
          parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        return el.getBoundingClientRect().width - (ctx.measureText(el.placeholder).width + moldura);
      });
      expect(folga, `sobra do placeholder ${quando}`).toBeGreaterThan(30);

      expect(await hasHorizontalOverflow(page), `sem rolagem horizontal ${quando}`).toBe(false);

      await page.keyboard.press("Escape");
      await expect(page.locator("#dir-form")).toHaveCount(0);
    }
  });
});

test.describe("BottomNav com o item DIR", () => {
  test.describe.configure({ retries: 2 });

  test("administrador: fixos Follow-Up, Recados, Pagamentos e DIR; 'Mais' = Prestações + Configurações", async ({ page }) => {
    test.skip(!tem(admin), "defina E2E_ADMIN_*");
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, admin);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const fixos = await page.locator("#bottom-nav a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(fixos).toEqual(["/processos", "/recados", "/pagamentos", "/dir"]);

    await page.locator("#btn-bottom-nav-more").click();
    const noMais = await page.locator("#nav-more-sheet a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(noMais).toEqual(["/prestacao", "/configuracoes"]);
  });

  test("operacional: Follow-Up, Recados, Pagamentos, DIR e Configurações, tudo fixo e sem 'Mais'", async ({ page }) => {
    test.skip(!tem(operacional), "defina E2E_OPERACIONAL_*");
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, operacional);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const fixos = await page.locator("#bottom-nav a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    // Configurações passou a ser de todos os cargos ("Minha conta"): 5 itens ainda cabem fixos.
    expect(fixos).toEqual(["/processos", "/recados", "/pagamentos", "/dir", "/configuracoes"]);
    await expect(page.locator("#btn-bottom-nav-more")).toHaveCount(0);
  });
});
