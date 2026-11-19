import { test, expect, type Page } from "@playwright/test";
import { CONSULTOR_E2E, garantirConsultorAtivo } from "./_helpers/consultoresDir";

// Página DIR (/dir): acesso por cargo e fluxo completo (criar, editar, toggles que gravam na hora,
// filtros, abas pela operação, PO repetido, excluir).
//
// Credenciais por env (mesmos nomes de rbac.spec.ts); cada teste é pulado sem elas:
//   E2E_ADMIN_EMAIL / _PASSWORD, E2E_OPERACIONAL_EMAIL / _PASSWORD,
//   E2E_SOCIO_EMAIL / _PASSWORD, E2E_CONSULTOR_EMAIL / _PASSWORD / _NOME
//
// ATENÇÃO: o fluxo CRIA e APAGA registros. Só roda no Supabase falso do harness local — a guarda
// tests/e2e/_guards/globalSetup.ts aborta a suíte se a URL do Supabase não for de loopback.
// Nunca rodar contra produção.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const operacional = cred("OPERACIONAL");
const socio = cred("SOCIO");
const consultor = {
  ...cred("CONSULTOR"),
  nome: process.env.E2E_CONSULTOR_NOME ?? "",
};
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);

// Quem escreve na DIR: administrador (preferido) ou operacional.
const escritor = tem(admin) ? admin : operacional;

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

async function escolher(page: Page, idSelect: string, opcao: string): Promise<void> {
  await page.locator(`#${idSelect}`).click();
  await page.locator(`#${idSelect}-listbox [role='option']`, { hasText: opcao }).first().click();
}

// Escolhe uma data (AAAA-MM-DD) no calendário próprio (AppDatePicker, formato "iso"): abre o campo, vai ao ano e
// ao mês pelo título e clica no dia. Mesmo caminho de pagamentos-fluxo.spec.ts (data-acao / data-ano / data-mes / data-iso).
async function escolherDataNoCalendario(page: Page, id: string, iso: string): Promise<void> {
  const [ano, mes] = iso.split("-").map(Number) as [number, number];
  await page.locator(`#${id}`).click();
  const painel = page.locator(`#${id}-calendario`);
  await painel.locator('[data-acao="ano"]').click();
  const alvo = painel.locator(`[data-ano="${ano}"]`);
  for (let i = 0; i < 10 && (await alvo.count()) === 0; i++) {
    await painel.locator('[data-acao="anos-anteriores"]').click();
  }
  await alvo.click();
  await painel.locator('[data-acao="mes"]').click();
  await painel.locator(`[data-mes="${mes}"]`).click();
  await painel.locator(`[data-iso="${iso}"]`).click();
  await expect(painel).toHaveCount(0); // escolher fecha o painel
}

test.describe("DIR — acesso por cargo", () => {
  test.describe.configure({ retries: 2 });

  test("sem sessão: /dir vai para /login e a API responde 401", async ({ page }) => {
    await page.goto("/dir");
    await expect(page).toHaveURL(/\/login(\?|$)/);
    expect((await page.request.get("/api/dir")).status()).toBe(401);
  });

  for (const [nome, c] of [
    ["administrador", admin],
    ["operacional", operacional],
  ] as const) {
    test(`${nome}: vê o item DIR no menu, abre a página e lê a API`, async ({ page }) => {
      test.skip(!tem(c), `defina E2E_${nome === "administrador" ? "ADMIN" : "OPERACIONAL"}_EMAIL/PASSWORD`);
      await page.setViewportSize({ width: 1280, height: 800 });
      await login(page, c.email, c.password);

      await expect(page.locator("#sidebar-nav a[href='/dir']")).toBeVisible();
      await expect(page.locator("#sidebar-nav a[href='/dir']")).toHaveText(/DIR/);
      await page.goto("/dir", { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/dir$/);
      await expect(page.locator("#dir-page")).toBeVisible();
      await expect(page.locator("#btn-novo-dir")).toBeVisible();
      expect((await page.request.get("/api/dir")).status()).toBe(200);
    });
  }

  for (const [nome, c] of [
    ["socio", socio],
    ["consultor", consultor],
  ] as const) {
    test(`${nome}: sem item de menu, /dir redireciona para /processos e a API devolve 403`, async ({ page }) => {
      test.skip(!tem(c), `defina as credenciais E2E do cargo ${nome}`);
      await page.setViewportSize({ width: 1280, height: 800 });
      await login(page, c.email, c.password);
      await expect(page).toHaveURL(/\/processos$/);

      await expect(page.locator("#sidebar-nav a[href='/dir']")).toHaveCount(0);
      await page.goto("/dir");
      await expect(page).toHaveURL(/\/processos$/);

      expect((await page.request.get("/api/dir")).status()).toBe(403);
      expect((await page.request.post("/api/dir", { data: {} })).status()).toBe(403);
      expect((await page.request.patch("/api/dir/qualquer", { data: { conferido: true } })).status()).toBe(403);
      expect((await page.request.delete("/api/dir/qualquer")).status()).toBe(403);
    });
  }

  test("rotas parecidas continuam negadas (/api/directory)", async ({ page }) => {
    test.skip(!tem(escritor), "defina E2E_ADMIN_* ou E2E_OPERACIONAL_*");
    await login(page, escritor.email, escritor.password);
    expect((await page.request.get("/api/directory")).status()).toBe(403);
    expect((await page.request.get("/api/dirx")).status()).toBe(403);
  });
});

test.describe("DIR — fluxo (cria, edita, grava na hora, filtra, exclui)", () => {
  test.describe.configure({ retries: 1, mode: "serial" });

  const PO = "PO26-12-9001";
  const PACIENTE = "E2E DIR TESTE";

  test.beforeEach(async ({ page }) => {
    test.skip(!tem(escritor), "defina E2E_ADMIN_* ou E2E_OPERACIONAL_*");
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, escritor.email, escritor.password);
    // O Consultor do formulário lê os consultores ATIVOS do Cadastro: garante o de teste antes de abrir a página.
    await garantirConsultorAtivo(page.request);
    await page.goto("/dir", { waitUntil: "networkidle" });
  });

  // Apaga qualquer registro de teste que tenha sobrado (mesmo se um teste anterior falhou no meio).
  async function limpar(page: Page): Promise<void> {
    const todos = (await (await page.request.get("/api/dir")).json()) as Array<{ id: string; po: string }>;
    for (const r of todos.filter((d) => d.po === PO)) await page.request.delete(`/api/dir/${r.id}`);
  }

  test.afterAll(async ({ browser }) => {
    if (!tem(escritor)) return;
    const page = await browser.newPage();
    try {
      await login(page, escritor.email, escritor.password);
      await limpar(page);
    } finally {
      await page.close();
    }
  });

  const linha = (page: Page) => page.locator("[id^='dir-row-']", { hasText: PO });

  test("1. cria um PO pelo modal (validação, listas com Outro e linha na lista)", async ({ page }) => {
    await limpar(page);
    await page.reload({ waitUntil: "networkidle" });

    await page.locator("#btn-novo-dir").click();
    await expect(page.locator("#dir-form")).toBeVisible();

    // PO inválido é barrado com aviso (toast), o modal continua aberto.
    await page.locator("#df-po").fill("PO-errado");
    await page.locator("#btn-save-dir").click();
    await expect(page.locator("#toast-notice")).toContainText("PO26-MM-NNNN");
    await expect(page.locator("#dir-form")).toBeVisible();

    // A máscara do PO é a do Follow-Up: sem prefixo nem hífens vira PO26-12-9001 (maiúsculas e hífens automáticos).
    await page.locator("#df-po").fill("26129001");
    await expect(page.locator("#df-po")).toHaveValue(PO);
    await page.locator("#df-po").fill(PO.toLowerCase());
    await expect(page.locator("#df-po")).toHaveValue(PO);
    await page.locator("#df-paciente").fill(PACIENTE);
    await page.locator("#btn-save-dir").click();
    await expect(page.locator("#toast-notice")).toContainText("consultor");

    await escolher(page, "df-vendedor", CONSULTOR_E2E);
    // "Outro" digitável no fornecedor
    await escolher(page, "df-fornecedor", "Outro");
    await page.locator("#df-fornecedor-outro").fill("Fornecedor E2E");
    await page.locator("#df-medicamento").fill("MEDICAMENTO E2E");
    await page.locator("#btn-save-dir").click();

    await expect(page.locator("#dir-form")).toHaveCount(0);
    await expect(linha(page)).toHaveCount(1);
    await expect(linha(page)).toContainText("Mateus Morais");
    await expect(linha(page)).toContainText("Fornecedor E2E");
    await expect(linha(page)).toContainText("—"); // status nulo aparece como "—"
  });

  test("2. PO repetido só avisa, não bloqueia", async ({ page }) => {
    await page.locator("#btn-novo-dir").click();
    await page.locator("#df-po").fill(PO);
    await expect(page.locator("#dir-po-aviso")).toContainText("Já existe");
    await page.locator("#df-po").fill("PO26-12-9002");
    await expect(page.locator("#dir-po-aviso")).toHaveCount(0);
  });

  test("3. Conferido da lista grava na hora e sobrevive ao reload", async ({ page }) => {
    const caixa = linha(page).locator("input[type='checkbox']").first();
    await expect(caixa).not.toBeChecked();
    await caixa.click();
    await expect(caixa).toBeChecked();
    await page.reload({ waitUntil: "networkidle" });
    await expect(linha(page).locator("input[type='checkbox']").first()).toBeChecked();
  });

  test("4. modal de edição: checklist grava na hora; salvar altera os demais campos", async ({ page }) => {
    await linha(page).click();
    await expect(page.locator("#dir-form")).toBeVisible();

    await page.locator("#dir-check-dactes").click();
    await page.locator("#dir-check-swift").click();
    await expect(page.locator("#dir-check-dactes")).toBeChecked();
    await expect(page.locator("#dir-check-swift")).toBeChecked();
    await expect(page.locator("#dir-check-logger")).not.toBeChecked();

    await escolher(page, "df-status", "Entregue");
    // Datas pelo calendário próprio (nenhum <input type="date"> nativo no formulário).
    await expect(page.locator("#dir-form input[type='date']")).toHaveCount(0);
    await escolherDataNoCalendario(page, "df-data-entrega", "2026-12-10");
    await expect(page.locator("#df-data-entrega")).toContainText("10/12/2026");
    await page.locator("#df-medicamento").fill("MEDICAMENTO E2E 2");
    await page.locator("#btn-save-dir").click();
    await expect(page.locator("#dir-form")).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });
    await expect(linha(page)).toContainText("MEDICAMENTO E2E 2");
    await expect(linha(page)).toContainText("Entregue");
    await expect(linha(page)).toContainText("10/12/2026");
    await expect(linha(page)).toContainText("2/8"); // chip: DACTES + SWIFT
  });

  test("5. busca e filtros", async ({ page }) => {
    await page.locator("#dir-search").fill("medicamento e2e 2");
    await expect(linha(page)).toHaveCount(1);
    await page.locator("#dir-search").fill("zzz-nao-existe");
    await expect(page.locator("#dir-vazio")).toBeVisible();
    await page.locator("#btn-clear-dir-search").click();

    await page.locator("#dir-search").fill(PO);
    await escolher(page, "filtro-dir-status", "Entregue");
    await expect(linha(page)).toHaveCount(1);
    await escolher(page, "filtro-dir-conferido", "Não conferidos");
    await expect(page.locator("#dir-vazio")).toBeVisible(); // o PO de teste está conferido
    await escolher(page, "filtro-dir-conferido", "Conferidos");
    await expect(linha(page)).toHaveCount(1);
    await escolher(page, "filtro-dir-checklist", "FECHAMENTO pendente");
    await expect(linha(page)).toHaveCount(1); // FECHAMENTO está desmarcado
    await escolher(page, "filtro-dir-checklist", "DACTES pendente");
    await expect(page.locator("#dir-vazio")).toBeVisible(); // DACTES está marcado
  });

  test("6. Operação encerrada move o PO da aba 'Em aberto' para 'Encerradas'", async ({ page }) => {
    await page.locator("#dir-search").fill(PO);
    await expect(linha(page)).toHaveCount(1);
    await expect(page.locator("#tab-dir-em-aberto")).toContainText("(1)");

    await linha(page).click();
    await page.locator("#df-operacao-encerrada").click();
    await expect(page.locator("#df-operacao-encerrada")).toBeChecked();
    await page.locator("#btn-close-dir-form").click();

    await expect(linha(page)).toHaveCount(0);
    await expect(page.locator("#tab-dir-encerradas")).toContainText("(1)");
    await page.locator("#tab-dir-encerradas").click();
    await expect(linha(page)).toHaveCount(1);
  });

  test("7. exclui o PO (com confirmação)", async ({ page }) => {
    await page.locator("#dir-search").fill(PO);
    await page.locator("#tab-dir-encerradas").click();
    await linha(page).click();
    await page.locator("#btn-excluir-dir").click();
    await page.getByRole("button", { name: "Excluir", exact: true }).last().click();
    await expect(linha(page)).toHaveCount(0);
    const restantes = (await (await page.request.get("/api/dir")).json()) as Array<{ po: string }>;
    expect(restantes.filter((d) => d.po === PO)).toHaveLength(0);
  });
});

// ── Lista "Fechamentos restantes" (marcação no PO) ──────────────────────────────────────────────
// Entrada manual (incluir/remover), saída AUTOMÁTICA ao encerrar a operação (a marca não é apagada),
// PO encerrado não se marca (toggle desabilitado + 400 da API), mobile com FAB e sheet "⋯".
// Mesmos cuidados do fluxo acima: cria e apaga registros, só no Supabase falso do harness.

const FECH = {
  PO1: "PO26-12-9201", // paciente "(1)", banco Sicoob
  PO2: "PO26-12-9202", // paciente "(2)", banco Pendente
  PO3: "PO26-12-9203", // outro paciente, operação ENCERRADA
  BUSCA: "E2E FECH",
};

function dtoFech(po: string, paciente: string, extra: Record<string, unknown> = {}) {
  return {
    po,
    paciente,
    conferido: false,
    vendedor: CONSULTOR_E2E, // consultor ativo do Cadastro (garantirConsultorAtivo, em criarFech)
    responsavel: "Bruno",
    exigencia: false,
    dataEmissao: "2026-12-01",
    dataCobrancaFornecedores: "2026-12-04",
    receita: "Original",
    medicamento: "MEDICAMENTO FECH",
    temperatura: "Ambiente",
    fornecedor: "Care Pharma",
    envio: "Air Cargo",
    awb: "",
    despachante: "STAR CUSTOMS",
    status: "on_going",
    dataEntrega: "",
    contratoCambio: "",
    observacao: "TUDO OK",
    banco: "XP",
    dataPagamento: "",
    operacaoEncerrada: false,
    fechamentoRestante: false,
    dactes: false,
    dsiDirDuimp: false,
    logger: false,
    fechamento: false,
    numerario: false,
    protocoloAssinado: false,
    swift: false,
    termometro: false,
    ...extra,
  };
}

async function limparFech(page: Page): Promise<void> {
  const todos = (await (await page.request.get("/api/dir")).json()) as Array<{ id: string; po: string }>;
  for (const r of todos.filter((d) => [FECH.PO1, FECH.PO2, FECH.PO3].includes(d.po))) {
    await page.request.delete(`/api/dir/${r.id}`);
  }
}

async function criarFech(page: Page): Promise<Record<string, string>> {
  await limparFech(page);
  await garantirConsultorAtivo(page.request);
  const ids: Record<string, string> = {};
  const dados: Array<[string, string, Record<string, unknown>]> = [
    [FECH.PO1, "E2E FECH TESTE (1)", { banco: "Sicoob" }],
    [FECH.PO2, "E2E FECH TESTE (2)", { banco: "Pendente" }],
    [FECH.PO3, "E2E FECH ENCERRADO", { operacaoEncerrada: true, banco: "XP" }],
  ];
  for (const [po, paciente, extra] of dados) {
    const r = await page.request.post("/api/dir", { data: dtoFech(po, paciente, extra) });
    expect(r.status(), `criar ${po}`).toBe(200);
    ids[po] = ((await r.json()) as { id: string }).id;
  }
  return ids;
}

async function abrirAbaFechamentos(page: Page): Promise<void> {
  await page.goto("/dir", { waitUntil: "networkidle" });
  await page.locator("#tab-dir-fechamentos").click();
  await page.locator("#dir-search").fill(FECH.BUSCA);
}

test.describe("DIR — Fechamentos restantes (desktop)", () => {
  test.describe.configure({ retries: 1, mode: "serial" });
  let ids: Record<string, string> = {};

  test.beforeAll(async ({ browser }) => {
    if (!tem(escritor)) return;
    const page = await browser.newPage();
    try {
      await login(page, escritor.email, escritor.password);
      ids = await criarFech(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!tem(escritor)) return;
    const page = await browser.newPage();
    try {
      await login(page, escritor.email, escritor.password);
      await limparFech(page);
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!tem(escritor), "defina E2E_ADMIN_* ou E2E_OPERACIONAL_*");
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, escritor.email, escritor.password);
  });

  const linhaFech = (page: Page, po: string) => page.locator("[id^='dir-fech-row-']", { hasText: po });

  test("1. a aba existe, começa sem os POs de teste e o filtro 'Fechamento restante' some nela", async ({ page }) => {
    await page.goto("/dir", { waitUntil: "networkidle" });
    await expect(page.locator("#tab-dir-fechamentos")).toBeVisible();
    await expect(page.locator("#tab-dir-fechamentos")).toContainText("Fechamentos restantes");
    // Em "Em aberto" o filtro existe; na aba Fechamentos restantes não (a aba já é a visão).
    await expect(page.locator("#filtro-dir-fechamento-restante")).toBeVisible();
    await page.locator("#tab-dir-fechamentos").click();
    await expect(page.locator("#filtro-dir-fechamento-restante")).toHaveCount(0);
    await page.locator("#dir-search").fill(FECH.BUSCA);
    await expect(page.locator("#dir-fech-vazio")).toBeVisible();
    await expect(page.locator("#btn-dir-incluir-fechamento")).toBeVisible();
    await expect(page.locator("#fab-incluir-fechamento")).toBeHidden();
  });

  test("2. incluir pela busca: só PO em andamento e ainda não incluído; clicar inclui na hora", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await page.locator("#btn-dir-incluir-fechamento").click();
    await expect(page.locator("#dir-incluir-modal")).toBeVisible();
    await expect(page.locator("#dir-incluir-dica")).toBeVisible(); // sem busca: pede para digitar

    await page.locator("#dir-incluir-busca").fill(FECH.BUSCA);
    // O PO encerrado NÃO aparece; os dois em andamento sim, cada um com o chip do banco.
    await expect(page.locator(`#dir-incluir-item-${ids[FECH.PO1]}`)).toContainText("Sicoob");
    await expect(page.locator(`#dir-incluir-item-${ids[FECH.PO2]}`)).toContainText("Pendente");
    await expect(page.locator(`#dir-incluir-item-${ids[FECH.PO3]}`)).toHaveCount(0);
    await expect(page.locator("[id^='dir-incluir-item-']")).toHaveCount(2);

    await page.locator(`#dir-incluir-item-${ids[FECH.PO2]}`).click();
    await expect(page.locator("#toast-notice")).toContainText(`${FECH.PO2} incluído`);
    await expect(page.locator(`#dir-incluir-item-${ids[FECH.PO2]}`)).toHaveCount(0); // já incluído: sai dos resultados
    await page.locator(`#dir-incluir-item-${ids[FECH.PO1]}`).click();
    await expect(page.locator("[id^='dir-incluir-item-']")).toHaveCount(0);
    await expect(page.locator("#dir-incluir-vazio")).toBeVisible();

    await page.locator("#btn-close-dir-incluir").click();
    await expect(page.locator("#dir-incluir-modal")).toHaveCount(0);

    // O servidor registrou quem e quando marcou.
    const todos = (await (await page.request.get("/api/dir")).json()) as Array<Record<string, unknown>>;
    const po1 = todos.find((d) => d.po === FECH.PO1)!;
    expect(po1.fechamentoRestante).toBe(true);
    expect(String(po1.fechamentoRestantePor)).not.toBe("");
    expect(String(po1.fechamentoRestantePor)).not.toBe("desconhecido");
    expect(Number.isNaN(Date.parse(String(po1.fechamentoRestanteEm)))).toBe(false);
  });

  test("3. lista agrupada por paciente: '(N)' como escrito, chip do banco, borda na cor do banco, resumo e contagem", async ({ page }) => {
    await abrirAbaFechamentos(page);

    // Um grupo só (o mesmo paciente com "(1)" e "(2)"), com "2 ordens".
    const grupo = page.locator("[id^='dir-fech-grupo-btn-']");
    await expect(grupo).toHaveCount(1);
    await expect(grupo).toContainText("E2E FECH TESTE");
    await expect(grupo).not.toContainText("(1)");
    await expect(grupo).toContainText("2 ordens");

    const l1 = linhaFech(page, FECH.PO1);
    const l2 = linhaFech(page, FECH.PO2);
    await expect(l1).toContainText("(1)");
    await expect(l2).toContainText("(2)");
    await expect(l1).toContainText("MEDICAMENTO FECH");
    await expect(l1).toContainText("On going");
    await expect(l1).toContainText("0/8");
    await expect(l1.locator("[id^='dir-fech-banco-']")).toHaveText("Sicoob");
    await expect(l2.locator("[id^='dir-fech-banco-']")).toHaveText("Pendente");
    await expect(l1.locator("[id^='btn-dir-fech-remover-']")).toBeVisible();

    // "Célula pintada": borda esquerda de 4px na cor do banco (Sicoob #0D9488, Pendente #6B7280).
    const borda = (loc: ReturnType<typeof linhaFech>) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return { cor: s.borderLeftColor, largura: s.borderLeftWidth };
      });
    expect(await borda(l1)).toEqual({ cor: "rgb(13, 148, 136)", largura: "4px" });
    expect(await borda(l2)).toEqual({ cor: "rgb(107, 114, 128)", largura: "4px" });

    // Resumo no subtítulo e contagem na aba.
    await expect(page.getByText("2 POs · 1 paciente", { exact: true })).toBeVisible();
    await expect(page.locator("#tab-dir-fechamentos")).toContainText("(2)");

    // A faixa de chips por banco conta e ordena.
    await expect(page.locator("#dir-fech-chip-sicoob")).toContainText("1");
    await expect(page.locator("#dir-fech-chip-pendente")).toContainText("1");
    await expect(page.locator("#dir-fech-header")).toBeVisible();
    await expect(page.locator("[id^='dir-fech-card-']").first()).toBeHidden();
  });

  test("4. os chips por banco filtram (e desfiltram ao clicar de novo); os grupos recolhem", async ({ page }) => {
    await abrirAbaFechamentos(page);
    const chip = page.locator("#dir-fech-chip-sicoob");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(linhaFech(page, FECH.PO1)).toHaveCount(1);
    await expect(linhaFech(page, FECH.PO2)).toHaveCount(0);
    // Os outros chips continuam na faixa (contam sem o próprio filtro de banco).
    await expect(page.locator("#dir-fech-chip-pendente")).toBeVisible();
    await expect(page.getByText("1 PO · 1 paciente", { exact: true })).toBeVisible();

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(linhaFech(page, FECH.PO2)).toHaveCount(1);

    // Recolher o grupo esconde as linhas; expandir devolve.
    await page.locator("[id^='dir-fech-grupo-btn-']").click();
    await expect(linhaFech(page, FECH.PO1)).toHaveCount(0);
    await page.locator("[id^='dir-fech-grupo-btn-']").click();
    await expect(linhaFech(page, FECH.PO1)).toHaveCount(1);
  });

  test("5. modal do PO: chip do banco no cabeçalho e toggle com 'incluído por X, dd/mm hh:mm'", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await linhaFech(page, FECH.PO1).click();
    await expect(page.locator("#dir-form")).toBeVisible();
    await expect(page.locator("#dir-form-banco-chip")).toHaveText("Sicoob");
    await expect(page.locator("#df-fechamento-restante")).toBeChecked();
    await expect(page.locator("#df-fechamento-restante")).toBeEnabled();
    await expect(page.locator("#df-fechamento-restante-nota")).toHaveText(/^\(incluído por .+, \d{2}\/\d{2} \d{2}:\d{2}\)$/);
    await page.locator("#btn-close-dir-form").click();
  });

  test("6. saída AUTOMÁTICA ao encerrar a operação (a marca fica) e retorno ao reabrir", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await expect(page.locator("#tab-dir-fechamentos")).toContainText("(2)");

    await linhaFech(page, FECH.PO1).click();
    await page.locator("#df-operacao-encerrada").click();
    await expect(page.locator("#df-operacao-encerrada")).toBeChecked();
    // Já marcado + encerrado: o toggle continua checado (a marca é guardada) e a nota explica.
    await expect(page.locator("#df-fechamento-restante")).toBeChecked();
    await expect(page.locator("#df-fechamento-restante-nota")).toContainText("fora da lista");
    await page.locator("#btn-close-dir-form").click();

    await expect(linhaFech(page, FECH.PO1)).toHaveCount(0); // saiu da aba sozinho
    await expect(page.locator("#tab-dir-fechamentos")).toContainText("(1)");
    const apos = ((await (await page.request.get("/api/dir")).json()) as Array<Record<string, unknown>>).find((d) => d.po === FECH.PO1)!;
    expect(apos.fechamentoRestante).toBe(true); // a marca NÃO foi apagada
    expect(String(apos.fechamentoRestantePor)).not.toBe("");

    // Na aba Encerradas, o filtro "Fechamento restante: sim" ainda enxerga a marca guardada.
    await page.locator("#tab-dir-encerradas").click();
    await escolher(page, "filtro-dir-fechamento-restante", "Em fechamento restante");
    await expect(page.locator("[id^='dir-row-']", { hasText: FECH.PO1 })).toHaveCount(1);
    await expect(page.locator("[id^='dir-row-']", { hasText: FECH.PO3 })).toHaveCount(0); // PO3 nunca foi marcado

    // Reabrir devolve o PO à lista.
    await page.locator("[id^='dir-row-']", { hasText: FECH.PO1 }).click();
    await page.locator("#df-operacao-encerrada").click();
    await expect(page.locator("#df-operacao-encerrada")).not.toBeChecked();
    await page.locator("#btn-close-dir-form").click();
    await page.locator("#tab-dir-fechamentos").click();
    await expect(linhaFech(page, FECH.PO1)).toHaveCount(1);
    await expect(page.locator("#tab-dir-fechamentos")).toContainText("(2)");
  });

  test("7. PO encerrado não se marca: toggle desabilitado com 'Operação encerrada' e a API devolve 400", async ({ page }) => {
    await page.goto("/dir", { waitUntil: "networkidle" });
    await page.locator("#tab-dir-encerradas").click();
    await page.locator("#dir-search").fill(FECH.PO3);
    await page.locator("[id^='dir-row-']", { hasText: FECH.PO3 }).click();
    await expect(page.locator("#df-fechamento-restante")).not.toBeChecked();
    await expect(page.locator("#df-fechamento-restante")).toBeDisabled();
    await expect(page.locator("#df-fechamento-restante-nota")).toHaveText("Operação encerrada");
    await page.locator("#btn-close-dir-form").click();

    // Mesmo forçando pela API: 400 com mensagem clara, e nada é gravado.
    const r = await page.request.patch(`/api/dir/${ids[FECH.PO3]}`, { data: { fechamentoRestante: true } });
    expect(r.status()).toBe(400);
    expect(await r.text()).toContain("Operação encerrada");
    const r2 = await page.request.patch(`/api/dir/${ids[FECH.PO1]}`, { data: { fechamentoRestante: true, operacaoEncerrada: true } });
    expect(r2.status()).toBe(400);
    const po3 = ((await (await page.request.get("/api/dir")).json()) as Array<Record<string, unknown>>).find((d) => d.po === FECH.PO3)!;
    expect(po3.fechamentoRestante).toBe(false);

    // Quem/quando marcou nunca vêm do cliente.
    expect((await page.request.patch(`/api/dir/${ids[FECH.PO1]}`, { data: { fechamentoRestantePor: "fulano" } })).status()).toBe(400);
    expect((await page.request.patch(`/api/dir/${ids[FECH.PO1]}`, { data: { fechamentoRestanteEm: "2020-01-01T00:00:00Z" } })).status()).toBe(400);
  });

  test("8. remover (desktop): confirmação; cancelar mantém, confirmar tira da lista e zera quem/quando", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await linhaFech(page, FECH.PO2).locator("[id^='btn-dir-fech-remover-']").click();
    await expect(page.getByText(`Remover o ${FECH.PO2} da lista de fechamentos restantes?`)).toBeVisible();

    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(linhaFech(page, FECH.PO2)).toHaveCount(1);

    await linhaFech(page, FECH.PO2).locator("[id^='btn-dir-fech-remover-']").click();
    await page.getByRole("button", { name: "Remover", exact: true }).last().click();
    await expect(page.locator("#toast-notice")).toContainText(`${FECH.PO2} removido`);
    await expect(linhaFech(page, FECH.PO2)).toHaveCount(0);

    const po2 = ((await (await page.request.get("/api/dir")).json()) as Array<Record<string, unknown>>).find((d) => d.po === FECH.PO2)!;
    expect(po2.fechamentoRestante).toBe(false);
    expect(po2.fechamentoRestanteEm).toBe("");
    expect(po2.fechamentoRestantePor).toBe("");
    // O PO não foi excluído: continua em "Em aberto".
    await page.locator("#tab-dir-em-aberto").click();
    await expect(page.locator("[id^='dir-row-']", { hasText: FECH.PO2 })).toHaveCount(1);
  });

  test("9. Esc com a confirmação de exclusão aberta fecha SÓ a confirmação, não o modal do PO", async ({ page }) => {
    await page.goto("/dir", { waitUntil: "networkidle" });
    await page.locator("#dir-search").fill(FECH.PO2);
    await page.locator("[id^='dir-row-']", { hasText: FECH.PO2 }).click();
    await expect(page.locator("#dir-form")).toBeVisible();

    await page.locator("#btn-excluir-dir").click();
    await expect(page.getByText(`Excluir o registro do ${FECH.PO2}?`)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText(`Excluir o registro do ${FECH.PO2}?`)).toHaveCount(0); // a confirmação fechou
    await expect(page.locator("#dir-form")).toBeVisible(); // o modal do PO continua aberto

    await page.keyboard.press("Escape"); // sem confirmação aberta, o Esc fecha o modal
    await expect(page.locator("#dir-form")).toHaveCount(0);
    expect(((await (await page.request.get("/api/dir")).json()) as Array<{ po: string }>).some((d) => d.po === FECH.PO2)).toBe(true); // nada foi excluído
  });

  test("10. Esc na busca de inclusão fecha o modal", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await page.locator("#btn-dir-incluir-fechamento").click();
    await expect(page.locator("#dir-incluir-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#dir-incluir-modal")).toHaveCount(0);
  });
});

test.describe("DIR — Fechamentos restantes (mobile, abaixo de lg)", () => {
  test.describe.configure({ retries: 1, mode: "serial" });
  let ids: Record<string, string> = {};

  test.beforeAll(async ({ browser }) => {
    if (!tem(escritor)) return;
    const page = await browser.newPage();
    try {
      await login(page, escritor.email, escritor.password);
      ids = await criarFech(page);
      // Deixa o PO1 já marcado (a ação "Incluir" do mobile testa o PO2).
      expect((await page.request.patch(`/api/dir/${ids[FECH.PO1]}`, { data: { fechamentoRestante: true } })).status()).toBe(200);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!tem(escritor)) return;
    const page = await browser.newPage();
    try {
      await login(page, escritor.email, escritor.password);
      await limparFech(page);
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!tem(escritor), "defina E2E_ADMIN_* ou E2E_OPERACIONAL_*");
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, escritor.email, escritor.password);
  });

  const cartaoFech = (page: Page, po: string) => page.locator("[id^='dir-fech-card-']:not([id^='dir-fech-card-banco-'])", { hasText: po });

  test("1. três abas cabem, cartões agrupados sem tabela, FAB de incluir no lugar do de novo PO", async ({ page }) => {
    await abrirAbaFechamentos(page);
    for (const id of ["#tab-dir-em-aberto", "#tab-dir-encerradas", "#tab-dir-fechamentos"]) {
      const caixa = (await page.locator(id).boundingBox())!;
      expect(caixa.x).toBeGreaterThanOrEqual(0);
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(375);
      expect(caixa.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

    await expect(page.locator("#dir-fech-header")).toBeHidden();
    await expect(page.locator("[id^='dir-fech-row-']").first()).toBeHidden();
    await expect(cartaoFech(page, FECH.PO1)).toBeVisible();
    await expect(cartaoFech(page, FECH.PO1)).toContainText("(1)");
    await expect(cartaoFech(page, FECH.PO1)).toContainText("Sicoob");
    await expect(page.locator("#btn-dir-incluir-fechamento")).toBeHidden();
    await expect(page.locator("#fab-incluir-fechamento")).toBeVisible();
    await expect(page.locator("#fab-novo-dir")).toHaveCount(0);

    const borda = await cartaoFech(page, FECH.PO1).evaluate((el) => getComputedStyle(el).borderLeftColor);
    expect(borda).toBe("rgb(13, 148, 136)");
  });

  test("2. o FAB abre a busca em tela cheia e inclui o PO na hora", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await page.locator("#fab-incluir-fechamento").click();
    const modal = (await page.locator("#dir-incluir-modal").boundingBox())!;
    expect(Math.round(modal.width)).toBe(375);
    expect(Math.round(modal.height)).toBe(667);

    await page.locator("#dir-incluir-busca").fill(FECH.PO2);
    const item = page.locator(`#dir-incluir-item-${ids[FECH.PO2]}`);
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(`#dir-incluir-item-${ids[FECH.PO1]}`)).toHaveCount(0); // já incluído
    await item.click();
    await expect(page.locator("#toast-notice")).toContainText(`${FECH.PO2} incluído`);
    await page.locator("#btn-close-dir-incluir").click();
    await expect(cartaoFech(page, FECH.PO2)).toBeVisible();
    await expect(page.getByText("2 POs · 1 paciente", { exact: true })).toBeVisible();
  });

  test("3. '⋯' (alvo >= 44px) abre o sheet com Remover e confirmação; Esc volta; confirmar remove", async ({ page }) => {
    await abrirAbaFechamentos(page);
    const mais = cartaoFech(page, FECH.PO2).locator("[id^='btn-dir-fech-acoes-']");
    const alvo = (await mais.boundingBox())!;
    expect(alvo.width).toBeGreaterThanOrEqual(44);
    expect(alvo.height).toBeGreaterThanOrEqual(44);

    await mais.click();
    await expect(page.locator("#dir-fech-acoes-sheet")).toBeVisible();
    await expect(page.locator("#dir-fech-acoes-sheet")).toContainText(FECH.PO2);
    await expect(page.locator("#dir-fech-acoes-banco")).toHaveText("Pendente");

    await page.locator("#btn-dir-fech-acoes-remover").click();
    await expect(page.locator("#dir-fech-acoes-confirmacao")).toBeVisible();
    await page.keyboard.press("Escape"); // volta das confirmação para as ações, sem fechar o sheet
    await expect(page.locator("#dir-fech-acoes-confirmacao")).toHaveCount(0);
    await expect(page.locator("#btn-dir-fech-acoes-remover")).toBeVisible();

    await page.locator("#btn-dir-fech-acoes-remover").click();
    await page.locator("#btn-dir-fech-acoes-cancelar").click();
    await expect(cartaoFech(page, FECH.PO2)).toBeVisible();

    await page.locator("#btn-dir-fech-acoes-remover").click();
    await page.locator("#btn-dir-fech-acoes-confirmar").click();
    await expect(page.locator("#dir-fech-acoes-sheet")).toHaveCount(0);
    await expect(page.locator("#toast-notice")).toContainText(`${FECH.PO2} removido`);
    await expect(cartaoFech(page, FECH.PO2)).toHaveCount(0);
    await expect(cartaoFech(page, FECH.PO1)).toBeVisible();
  });

  test("4. painel de filtros: 'Fechamento restante' existe em Em aberto e some na aba Fechamentos", async ({ page }) => {
    await page.goto("/dir", { waitUntil: "networkidle" });
    await page.locator("#btn-filtros-dir").click();
    await expect(page.locator("#sheet-filtro-dir-fechamento-restante")).toBeVisible();
    await page.locator("#btn-dir-filtros-aplicar").click();

    await page.locator("#tab-dir-fechamentos").click();
    await page.locator("#btn-filtros-dir").click();
    await expect(page.locator("#dir-filtros-sheet")).toBeVisible();
    await expect(page.locator("#sheet-filtro-dir-fechamento-restante")).toHaveCount(0);
    await expect(page.locator("#sheet-filtro-dir-banco")).toBeVisible();
    await page.locator("#btn-dir-filtros-aplicar").click();
  });

  test("5. toque no cartão abre o modal do PO em tela cheia, com o chip do banco e o toggle", async ({ page }) => {
    await abrirAbaFechamentos(page);
    await cartaoFech(page, FECH.PO1).click();
    await expect(page.locator("#dir-form")).toBeVisible();
    await expect(page.locator("#dir-form-banco-chip")).toHaveText("Sicoob");
    await expect(page.locator("#df-fechamento-restante")).toBeChecked();
    const modal = (await page.locator("#dir-form-modal-overlay > div").boundingBox())!;
    expect(Math.round(modal.width)).toBe(375);
  });
});
