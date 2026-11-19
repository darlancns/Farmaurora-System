import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import { lerEnv } from "./_guards/supabaseEnv";
import {
  DESP_A,
  DESP_B,
  DESP_C,
  DESP_INATIVO,
  DESP_SEM_PIX,
  FORN_A_TEXTO,
  FORN_B_TEXTO,
  FORN_INATIVO_TEXTO,
  PIX_DESP_A,
  PIX_DESP_B,
  PIX_TRANSP_A,
  PIX_TRANSP_B,
  semearCadastrosDePagamento,
  TRANSP_A,
  TRANSP_B,
  TRANSP_INATIVA,
} from "./_helpers/cadastrosPagamento";
import { hojeBrasilia, somarDiasISO } from "../../shared/utils/dataBrasilia";

// Fluxo de Pagamentos (Banco + Grupos) — e2e contra o dev server real.
// Portado de tests/e2e/_aposentados/pagamentos.skip.ts.
//
// Mudou desde o original:
//   - Banco e Grupos persistem no Supabase (pagamento_lotes_banco /
//     pagamento_lancamentos_banco / pagamento_grupos).
//   - Fornecedores, despachantes, transportadoras e a chave PIX vêm dos CADASTROS (Configurações → Cadastros), não mais de
//     listas fixas: o beforeAll semeia itens "TESTE e2e ..." no banco local (tests/e2e/_helpers/cadastrosPagamento.ts;
//     não existe exclusão nos Cadastros, então ficam lá entre as execuções). A chave PIX é SÓ LEITURA em Pagamentos (o
//     teste 8 prova: sem botão "Editar", a rota PATCH foi removida e criar grupo grava a CÓPIA da chave do Cadastro).
//   - O botão único "+ Novo lançamento" virou "+ Novo pagamento": a MOEDA escolhida
//     no modal define o lote (entra no lote aberto da moeda, ou cria um). Os testes
//     criam via "+ Novo pagamento" e capturam o loteId/lancId pela API pra escopar
//     os locators — nada de "primeiro card da tela". Cada teste que espera um lote
//     NOVO só roda depois do anterior da mesma moeda ter sido pago/excluído.
//   - Toasts reescritos ("Lote pago e movido para realizados" etc.) — as
//     asserções usam a substring estável.
//   - Roda só no harness local (Supabase falso em loopback; a guarda aborta fora dele), na
//     empresa padrão. O beforeAll/afterAll limpam as tabelas de Banco e Grupos INTEIRAS
//     (seguro justamente por causa da guarda). Os Cadastros de teste não são apagados.
//   - Não existe teste dormente que setasse "Pago" direto num item — o ciclo
//     dormente já era NAO_PAGO<->COMPLEMENTO. Adicionado um teste explícito (17)
//     de que a API rejeita PAGO direto (regra M-04), que é o guard novo.
//   - O seletor de empresa e o override ?empresa= saíram (o CRM opera só com Farmaurora em
//     Pagamentos): irPagamentos() só faz goto("/pagamentos").
//   - Data futura em "Pagamentos realizados": o input tem `max` nativo (= hoje de Brasília),
//     que bloqueia o envio do form. Os testes 9 e 10 afirmam o bloqueio nativo
//     (validity.rangeOverflow, modal aberto, nada gravado) e a recusa do SERVIDOR por chamada
//     de API (400). "Amanhã" vem de hojeBrasilia()+1 — nunca de toISOString().

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};

// Aborta (antes de qualquer escrita) se o Supabase em uso não for o local do harness.
assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);

const RUN = String(Date.now()).slice(-9);

const CLIENTE_1 = `Cliente ${RUN} Um`;
const CLIENTE_EUR = `Cliente ${RUN} Eur`;
const CLIENTE_EUR_EDIT = `Cliente ${RUN} Eur Editado`;
const CLIENTE_AUTOSAVE = `Cliente ${RUN} Autosave`;
const G1 = `Paciente ${RUN} Grupo Um`;
const G2 = `Paciente ${RUN} Grupo Dois`;
const P_PIX = `Paciente ${RUN} Pix`;
const P_TRANSP = `Paciente ${RUN} Transp`;
const P_EDIT = `Paciente ${RUN} Editar`;
const P_EDITADO = `Paciente ${RUN} Editado`;
const P_M04 = `Paciente ${RUN} M04`;

// ids capturados em runtime pra escopar os locators
const st: {
  usd1?: string;
  usd1Lanc?: string;
  eur?: string;
  eurLanc?: string;
  usd3?: string;
  gDesp?: string; // grupo pago no teste 4
  gPix?: string; // grupo do teste 8
  gEdit?: string; // grupo aberto do teste 15
  gM04?: string; // grupo aberto do teste 17
} = {};

function db(): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function login(page: Page): Promise<void> {
  // domcontentloaded, não networkidle: o cliente Supabase mantém timers de
  // refresh de token em segundo plano que podem nunca deixar a rede "idle";
  // o DOM pronto basta, a hidratação é tratada pelo retry abaixo.
  // Se já existir uma sessão válida no contexto, o guard global
  // (auth.global.ts) redireciona /login -> / antes do form aparecer — limpa
  // cookies primeiro pra garantir sempre uma sessão nova.
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Nuxt pode ainda estar hidratando quando o Playwright interage — sem
  // hidratação o @submit.prevent não roda e o form faz um GET nativo pra
  // /login?, que recarrega a página e LIMPA os campos preenchidos. Por isso o
  // fill acontece dentro do retry: se essa tentativa recarregou a página, a
  // próxima refaz o preenchimento em vez de clicar num form vazio (que o
  // `required` nativo bloqueia sem nunca sair de /login).
  await expect(async () => {
    await page.locator("#login-email").fill(writer.email);
    await page.locator("#login-password").fill(writer.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

// A chave PIX do modal "Adicionar pagamento" não é campo de formulário: nada de input, sem tabindex e sem receber foco por clique.
async function esperarChavePixNaoFocavel(page: Page): Promise<void> {
  const pix = page.locator("#ng-chave-pix");
  expect(await pix.evaluate((el) => el.tagName)).toBe("DIV");
  await expect(pix).not.toHaveAttribute("tabindex", /.*/);
  await expect(pix.locator("input, textarea, select, button")).toHaveCount(0);
  await pix.click();
  expect(await pix.evaluate((el) => el === document.activeElement)).toBe(false);
}

// Vai pra /pagamentos (o CRM opera só com Farmaurora; não há seletor de empresa).
// Escolhe uma data (AAAA-MM-DD) no calendário próprio (AppDatePicker): abre o campo, vai ao ano e ao mês pelo
// título e clica no dia. Os botões do calendário têm data-acao / data-ano / data-mes / data-iso.
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

async function irPagamentos(page: Page, tab: "banco" | "cotacao" | "despachante" | "transportadora"): Promise<void> {
  await page.goto("/pagamentos", { waitUntil: "networkidle" });
  await page.locator(`#tab-${tab}`).click();
}

interface BancoPayload {
  lotes: { id: string; moeda: string; realizado: boolean; bancoEscolhido: string | null }[];
  lancamentos: { id: string; loteId: string; cliente: string }[];
}
async function bancoPayload(page: Page): Promise<BancoPayload> {
  const res = await page.request.get("/api/pagamentos/banco");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as BancoPayload;
}
async function despachanteGrupos(page: Page): Promise<{ id: string; nomeGrupo: string; realizado: boolean }[]> {
  const res = await page.request.get("/api/pagamentos/despachante");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; nomeGrupo: string; realizado: boolean }[];
}
async function transportadoraGrupos(page: Page): Promise<{ id: string; nomeGrupo: string }[]> {
  const res = await page.request.get("/api/pagamentos/transportadora");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; nomeGrupo: string }[];
}

// "+ Novo pagamento" -> preenche -> salva. Devolve loteId + lancId do lote NOVO que
// nasceu (só existe lote novo quando não havia lote aberto da moeda).
async function novoLote(
  page: Page,
  opts: { moeda?: "USD" | "EUR"; fornecedor: string; invoice: string; cliente: string; valor: string },
): Promise<{ loteId: string; lancId: string }> {
  const antes = new Set((await bancoPayload(page)).lotes.map((l) => l.id));

  await page.locator("#btn-novo-pagamento-banco").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  if (opts.moeda) await page.locator(`#nl-moeda-${opts.moeda}`).click();
  await selectOption(page, "nl-fornecedor", opts.fornecedor);
  await page.locator("#nl-cliente").fill(opts.cliente);
  await page.locator("#nl-invoice").fill(opts.invoice);
  await page.locator("#nl-valor-moeda").fill(opts.valor);
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);

  const payload = await bancoPayload(page);
  const lote = payload.lotes.find((l) => !antes.has(l.id));
  expect(lote, "um lote novo deveria ter sido criado").toBeTruthy();
  const lanc = payload.lancamentos.find((l) => l.loteId === lote!.id && l.cliente === opts.cliente);
  expect(lanc, "o lançamento do lote novo deveria existir").toBeTruthy();
  return { loteId: lote!.id, lancId: lanc!.id };
}

test.describe.serial("Pagamentos — fluxo Banco e Grupos", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções). O beforeAll é
  // auto-curável (limpa as tabelas de teste), então uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env.e2e com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  async function limparTabelasDeTeste(client: SupabaseClient): Promise<void> {
    // Esvazia Banco e Grupos INTEIROS. Só é seguro porque a guarda (assertSupabaseLocal) impede
    // esta suíte de rodar fora do Supabase falso do harness local. Auto-curável entre execuções
    // (um worker que crashou no meio não roda o afterAll e deixa lixo).
    await client.from("pagamento_lancamentos_banco").delete().neq("id", "");
    await client.from("pagamento_lotes_banco").delete().neq("id", "");
    await client.from("pagamento_grupos").delete().neq("id", "");
  }

  test.beforeAll(async () => {
    if (!runnable) return;
    const client = db();
    await limparTabelasDeTeste(client);

    // Os selects leem os Cadastros: garante os itens de teste (idempotente) no banco local.
    await semearCadastrosDePagamento(client);
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    const client = db();
    await limparTabelasDeTeste(client);
  });

  test("1 · '+ Novo pagamento' (USD, sem lote) cria o lote e o lançamento nasce sem valor em reais", async ({ page }) => {
    await irPagamentos(page, "banco");

    const { loteId, lancId } = await novoLote(page, {
      fornecedor: FORN_A_TEXTO,
      invoice: `INV-${RUN}-1`,
      cliente: CLIENTE_1,
      valor: "100",
    });
    st.usd1 = loteId;
    st.usd1Lanc = lancId;

    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    const card = page.locator(`#lancamento-banco-${lancId}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(CLIENTE_1);
    await expect(card).toContainText("aguardando cotação");
  });

  test("2 · escolher banco na Cotação converte os pendentes para reais", async ({ page }) => {
    await irPagamentos(page, "cotacao");

    const cotCard = page.locator(`#cotacao-lote-${st.usd1}`);
    await expect(cotCard).toBeVisible();
    await cotCard.locator(`#input-taxa-${st.usd1}-XP`).fill("5");

    // Só de digitar a taxa, o total em R$ já aparece (100 * 5 = 500,00).
    await expect(page.locator(`#cotacao-banco-${st.usd1}-XP`)).toContainText("500,00");

    await cotCard.locator(`#btn-usar-banco-${st.usd1}-XP`).click();
    await expect(page.locator("#toast-notice")).toContainText("Banco escolhido");

    await page.locator("#tab-banco").click();
    const card = page.locator(`#lancamento-banco-${st.usd1Lanc}`);
    await expect(card).toContainText("R$ 500,00");
    await expect(card).not.toContainText("aguardando cotação");
  });

  test("3 · 'Pago' move o lote inteiro para realizados", async ({ page }) => {
    await irPagamentos(page, "banco");

    await page.locator(`#btn-pagar-lote-${st.usd1}`).click();
    // "Pago" pede confirmação antes de chamar o PATCH: confirma na janela.
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("Marcar este lote como pago?");
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Lote pago");

    // O lote saiu da seção "em aberto" inteiro (o card some).
    await expect(page.locator(`#lote-banco-${st.usd1}`)).toHaveCount(0);
    await expect(page.locator(`#btn-pagar-lote-${st.usd1}`)).toHaveCount(0);

    const realizados = page.locator("#banco-realizados-lista");
    await expect(realizados).toBeVisible();
    await expect(realizados).toContainText(CLIENTE_1);
  });

  test("4 · grupo de Despachante é pago inteiro, não item por item", async ({ page }) => {
    await irPagamentos(page, "despachante");

    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_B);
    await page.locator("#ng-item-paciente-0").fill(G1);
    await page.locator("#ng-item-valor-0").fill("300");
    await page.locator("#ng-add-item").click();
    await page.locator("#ng-item-paciente-1").fill(G2);
    await page.locator("#ng-item-valor-1").fill("400");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    st.gDesp = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === DESP_B)?.id;
    expect(st.gDesp, "grupo do despachante B recém-criado").toBeTruthy();

    const grupo = page.locator(`#grupo-pagamento-${st.gDesp}`);
    await expect(grupo).toContainText(G1);
    await expect(grupo).toContainText(G2);

    await grupo.locator(`#btn-pagar-grupo-${st.gDesp}`).click();
    // "Pago" pede confirmação antes de chamar o PATCH: confirma na janela.
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("Marcar este grupo como pago?");
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Grupo pago");

    // O grupo saiu inteiro da seção "em aberto".
    await expect(page.locator(`#grupo-pagamento-${st.gDesp}`)).toHaveCount(0);
    await expect(page.locator(`#btn-pagar-grupo-${st.gDesp}`)).toHaveCount(0);

    const realizados = page.locator("#grupo-realizados-lista-DESPACHANTE");
    await expect(realizados).toContainText(G1);
    await expect(realizados).toContainText(G2);
    await expect(realizados).toContainText(DESP_B);
    await expect(realizados).toContainText("Pago");
  });

  test("5 · sem navegação por data", async ({ page }) => {
    await irPagamentos(page, "banco");

    const novo = await novoLote(page, {
      moeda: "EUR",
      fornecedor: FORN_B_TEXTO,
      invoice: `INV-${RUN}-EUR`,
      cliente: CLIENTE_EUR,
      valor: "50",
    });
    st.eur = novo.loteId;
    st.eurLanc = novo.lancId;

    await page.locator("#tab-cotacao").click();
    await expect(page.locator("#cotacao-tab")).toContainText("Cotação EUR");

    // Não existe mais a navegação por data nem a toolbar antiga. O seletor de
    // empresa também não existe mais na UI (CRM opera só com Farmaurora).
    await expect(page.locator("#pagamento-toolbar")).toHaveCount(0);
    await expect(page.locator("#pagamento-data-next")).toHaveCount(0);
    await expect(page.locator("#pagamento-data-prev")).toHaveCount(0);
    await expect(page.locator("#pagamento-empresa")).toHaveCount(0);
  });

  test("6 · editar um lançamento em aberto altera cliente/valor no card", async ({ page }) => {
    await irPagamentos(page, "banco");

    await page.locator(`#btn-editar-lancamento-${st.eurLanc}`).click();
    await expect(page.locator("#novo-lancamento-banco-overlay")).toContainText("Editar lançamento");
    await page.locator("#nl-cliente").fill(CLIENTE_EUR_EDIT);
    await page.locator("#nl-valor-moeda").fill("75");
    await page.locator("#btn-save-novo-lancamento").click();

    await expect(page.locator("#toast-notice")).toContainText("Lançamento atualizado");

    const card = page.locator(`#lancamento-banco-${st.eurLanc}`);
    await expect(card).toContainText(CLIENTE_EUR_EDIT);
    await expect(card).toContainText("€ 75,00");
  });

  test("7 · excluir o lançamento remove o card (e o lote, se ficar vazio)", async ({ page }) => {
    await irPagamentos(page, "banco");

    await page.locator(`#btn-excluir-lancamento-${st.eurLanc}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();

    await expect(page.locator("#toast-notice")).toContainText("Lançamento excluído");
    await expect(page.locator("#banco-tab")).not.toContainText(CLIENTE_EUR_EDIT);
    // Era o único lançamento do lote EUR -> o lote também some.
    await expect(page.locator(`#lote-banco-${st.eur}`)).toHaveCount(0);
  });

  test("8 · PIX do despachante: vem do Cadastro, é SÓ LEITURA e o grupo grava a cópia da chave", async ({ page }) => {
    await irPagamentos(page, "despachante");

    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_A);
    await expect(page.locator("#ng-chave-pix")).toHaveText(PIX_DESP_A);
    await expect(page.locator("#ng-chave-pix-rotulo")).toHaveText("Chave PIX");
    await esperarChavePixNaoFocavel(page);
    // Sem fluxo de edição: o botão "Editar" saiu (quem altera a chave é o administrador, em Cadastros).
    await expect(page.locator("#ng-chave-pix-editar")).toHaveCount(0);

    await page.locator("#ng-item-paciente-0").fill(P_PIX);
    await page.locator("#ng-item-valor-0").fill("100");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    const grupo = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === DESP_A);
    st.gPix = grupo?.id;
    expect(st.gPix, "grupo do despachante A recém-criado").toBeTruthy();
    // A CÓPIA da chave do Cadastro foi gravada no grupo (instantâneo histórico).
    expect((grupo as { chavePix?: string }).chavePix).toBe(PIX_DESP_A);

    // Reabre: cada despachante traz a chave do PRÓPRIO Cadastro; um sem chave cadastrada fica com o campo vazio.
    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_B);
    await expect(page.locator("#ng-chave-pix")).toHaveText(PIX_DESP_B);
    await selectOption(page, "ng-nome-grupo", DESP_SEM_PIX);
    await expect(page.locator("#ng-chave-pix")).toHaveText("—");
    await page.keyboard.press("Escape");

    // A rota PATCH de chave PIX foi removida (404/405) e o Cadastro continua com a chave que tinha.
    for (const rota of ["despachante-pix", "transportadora-pix"]) {
      const res = await page.request.patch(`/api/pagamentos/${rota}`, { data: { nome: DESP_A, chavePix: "e2e-tentativa" } });
      expect([404, 405], `PATCH /api/pagamentos/${rota}`).toContain(res.status());
    }
    const { data } = await db().from("cadastro_despachantes").select("chave_pix").eq("nome", DESP_A).maybeSingle();
    expect((data as { chave_pix?: string } | null)?.chave_pix).toBe(PIX_DESP_A);
  });

  test("9 · Banco: editar cliente + data de pagamento em 'Pagamentos realizados'", async ({ page }) => {
    await irPagamentos(page, "banco");

    // Lote isolado com 2 lançamentos, pra provar que editar o cliente de UM
    // deles não vaza pro outro — a data (pagoEm), por ser do LOTE, vaza pros dois.
    const CLIENTE_REAL_A = `Cliente ${RUN} Realizado A`;
    const CLIENTE_REAL_A_EDITADO = `Cliente ${RUN} Realizado A Editado`;
    const CLIENTE_REAL_B = `Cliente ${RUN} Realizado B`;

    const loteRA = await novoLote(page, {
      fornecedor: FORN_A_TEXTO,
      invoice: `INV-${RUN}-RA`,
      cliente: CLIENTE_REAL_A,
      valor: "50",
    });

    // 2º pagamento em USD: a moeda define o lote, então entra no mesmo lote aberto.
    await page.locator("#btn-novo-pagamento-banco").click();
    await selectOption(page, "nl-fornecedor", FORN_A_TEXTO);
    await page.locator("#nl-cliente").fill(CLIENTE_REAL_B);
    await page.locator("#nl-invoice").fill(`INV-${RUN}-RB`);
    await page.locator("#nl-valor-moeda").fill("60");
    await page.locator("#btn-save-novo-lancamento").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    // Cotação + "Pago", pra virar um lote realizado com 2 lançamentos.
    await page.locator("#tab-cotacao").click();
    const cot = page.locator(`#cotacao-lote-${loteRA.loteId}`);
    await cot.locator(`#input-taxa-${loteRA.loteId}-XP`).fill("5");
    await cot.locator(`#btn-usar-banco-${loteRA.loteId}-XP`).click();
    await expect(page.locator("#toast-notice")).toContainText("Banco escolhido");

    await page.locator("#tab-banco").click();
    await page.locator(`#btn-pagar-lote-${loteRA.loteId}`).click();
    // "Pago" pede confirmação antes de chamar o PATCH: confirma na janela.
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("Marcar este lote como pago?");
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Lote pago");

    const payload = await bancoPayload(page);
    const lancA = payload.lancamentos.find((l) => l.loteId === loteRA.loteId && l.cliente === CLIENTE_REAL_A);
    const lancB = payload.lancamentos.find((l) => l.loteId === loteRA.loteId && l.cliente === CLIENTE_REAL_B);
    expect(lancA, "lançamento A").toBeTruthy();
    expect(lancB, "lançamento B").toBeTruthy();

    const rowA = page.locator("#banco-realizados-lista").locator(`#lancamento-banco-${lancA!.id}`);
    const rowB = page.locator("#banco-realizados-lista").locator(`#lancamento-banco-${lancB!.id}`);

    await rowA.locator(`#btn-editar-realizado-${lancA!.id}`).click();
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toContainText("Editar pagamento realizado");

    // Data futura -> o calendário desabilita os dias depois de hoje (Brasília): não dá para escolher, o
    // modal continua aberto e nada é gravado.
    const amanha = somarDiasISO(hojeBrasilia(), 1);
    await page.locator("#epr-nome").fill(CLIENTE_REAL_A_EDITADO);
    await page.locator("#epr-data").click();
    await expect(page.locator(`#epr-data-calendario [data-iso="${hojeBrasilia()}"]`)).toBeEnabled();
    await expect(page.locator(`#epr-data-calendario [data-iso="${amanha}"]`)).toBeDisabled();
    await page.keyboard.press("Escape"); // fecha só o calendário (o modal continua aberto)
    await expect(page.locator("#epr-data-calendario")).toHaveCount(0);
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toBeVisible();
    await page.locator("#btn-save-editar-pagamento-realizado").click();
    await expect(page.locator("#toast-notice")).not.toContainText("Pagamento atualizado");
    // O SERVIDOR também recusa data futura (não confia só no cliente): 400 e nada muda.
    const recusa = await page.request.patch(`/api/pagamentos/banco/lancamento/${lancA!.id}/realizado`, {
      data: { cliente: CLIENTE_REAL_A_EDITADO, pagoEm: amanha },
    });
    expect(recusa.status()).toBe(400);
    const inalterado = (await bancoPayload(page)).lancamentos.find((l) => l.id === lancA!.id);
    expect(inalterado?.cliente).toBe(CLIENTE_REAL_A);

    // Data passada válida (escolhida no calendário) -> salva os dois campos juntos.
    await escolherDataNoCalendario(page, "epr-data", "2020-03-10");
    await page.locator("#btn-save-editar-pagamento-realizado").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento atualizado");
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toHaveCount(0);

    // Só a linha A muda de nome; a data (do lote) vaza pras duas linhas.
    await expect(rowA).toContainText(CLIENTE_REAL_A_EDITADO);
    await expect(rowA).toContainText("10/03/2020");
    await expect(rowB).toContainText(CLIENTE_REAL_B);
    await expect(rowB).not.toContainText(CLIENTE_REAL_A_EDITADO);
    await expect(rowB).toContainText("10/03/2020");

    // Nenhum outro campo do lote foi tocado (bancoEscolhido).
    const depois = await bancoPayload(page);
    expect(depois.lotes.find((l) => l.id === loteRA.loteId)?.bancoEscolhido).toBe("XP");
  });

  test("10 · Despachante: editar nome do grupo + data de pagamento em 'Pagamentos realizados'", async ({ page }) => {
    await irPagamentos(page, "despachante");

    const P_REALIZADO_EDIT = `Paciente ${RUN} Realizado Edit`;

    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_C);
    await page.locator("#ng-item-paciente-0").fill(P_REALIZADO_EDIT);
    await page.locator("#ng-item-valor-0").fill("90");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    const grupoId = (await despachanteGrupos(page)).find(
      (g) => !g.realizado && g.nomeGrupo === DESP_C,
    )?.id;
    expect(grupoId, "grupo do despachante C recém-criado").toBeTruthy();

    await page.locator(`#grupo-pagamento-${grupoId}`).locator(`#btn-pagar-grupo-${grupoId}`).click();
    // "Pago" pede confirmação antes de chamar o PATCH: confirma na janela.
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("Marcar este grupo como pago?");
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Grupo pago");

    const lista = page.locator("#grupo-realizados-lista-DESPACHANTE");
    await lista.locator(`#btn-editar-realizado-DESPACHANTE-${grupoId}-0`).click();
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toContainText("Editar pagamento realizado");

    // Data futura -> o calendário desabilita os dias depois de hoje (Brasília); modal aberto, nada gravado.
    const amanha = somarDiasISO(hojeBrasilia(), 1);
    await selectOption(page, "epr-nome", DESP_A);
    await page.locator("#epr-data").click();
    await expect(page.locator(`#epr-data-calendario [data-iso="${amanha}"]`)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#epr-data-calendario")).toHaveCount(0);
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toBeVisible();
    await page.locator("#btn-save-editar-pagamento-realizado").click();
    await expect(page.locator("#toast-notice")).not.toContainText("Pagamento atualizado");
    // O SERVIDOR também recusa data futura: 400 e o grupo continua com o nome antigo.
    const recusa = await page.request.patch(`/api/pagamentos/despachante/${grupoId}/realizado`, {
      data: { nomeGrupo: DESP_A, pagoEm: amanha },
    });
    expect(recusa.status()).toBe(400);
    expect((await despachanteGrupos(page)).find((g) => g.id === grupoId)?.nomeGrupo).toBe(DESP_C);

    // Data passada válida (escolhida no calendário) -> salva os dois campos (nomeGrupo + pagoEm) juntos.
    await escolherDataNoCalendario(page, "epr-data", "2020-04-05");
    await page.locator("#btn-save-editar-pagamento-realizado").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento atualizado");
    await expect(page.locator("#editar-pagamento-realizado-overlay")).toHaveCount(0);

    await expect(lista).toContainText(P_REALIZADO_EDIT);
    await expect(lista).toContainText(DESP_A);
    await expect(lista).toContainText("05/04/2020");
  });

  test("11 · realizados do Banco: lista plana por cliente, busca e filtros", async ({ page }) => {
    await irPagamentos(page, "banco");

    const lista = page.locator("#banco-realizados-lista");
    await expect(lista).toContainText(CLIENTE_1); // pago no teste 3 (XP · fornecedor A)

    await page.locator("#banco-realizado-busca").fill("zzz-nao-existe");
    await expect(page.locator("#banco-tab")).toContainText("Nenhum pagamento encontrado");
    await page.locator("#btn-clear-banco-realizado-busca").click();
    await expect(lista).toContainText(CLIENTE_1);

    await selectOption(page, "filtro-banco-realizado", "XP");
    await expect(lista).toContainText(CLIENTE_1);
    await selectOption(page, "filtro-banco-realizado", "Rendimento");
    await expect(page.locator("#banco-tab")).toContainText("Nenhum pagamento encontrado");
    await selectOption(page, "filtro-banco-realizado", "Todos os bancos");

    await selectOption(page, "filtro-fornecedor-realizado", FORN_A_TEXTO);
    await expect(lista).toContainText(CLIENTE_1);
  });

  test("12 · realizados de Despachante: lista plana por paciente, busca e filtros", async ({ page }) => {
    await irPagamentos(page, "despachante");

    const lista = page.locator("#grupo-realizados-lista-DESPACHANTE");
    await expect(lista).toContainText(G1); // pagos no teste 4
    await expect(lista).toContainText(G2);

    await page.locator("#busca-grupo-realizado-DESPACHANTE").fill(G1);
    await expect(lista).toContainText(G1);
    await expect(lista).not.toContainText(G2);
    await page.locator("#btn-clear-busca-grupo-realizado-DESPACHANTE").click();
    await expect(lista).toContainText(G2);

    await selectOption(page, "filtro-grupo-realizado-DESPACHANTE", DESP_B);
    await expect(lista).toContainText(G1);

    await selectOption(page, "filtro-status-realizado-DESPACHANTE", "Pago");
    await expect(lista).toContainText(G1);
  });

  test("13 · Cotação: a taxa salva sozinha (sem botão) e sobrevive ao reload", async ({ page }) => {
    await irPagamentos(page, "banco");

    const novo = await novoLote(page, {
      fornecedor: FORN_A_TEXTO,
      invoice: `INV-${RUN}-AS`,
      cliente: CLIENTE_AUTOSAVE,
      valor: "100",
    });
    st.usd3 = novo.loteId;

    await page.locator("#tab-cotacao").click();
    const cot = page.locator(`#cotacao-lote-${st.usd3}`);
    await cot.locator(`#input-taxa-${st.usd3}-XP`).fill("5,42");
    await cot.locator(`#input-taxa-${st.usd3}-XP`).blur(); // auto-save imediato

    // Não existe mais botão "Salvar taxas".
    await expect(page.locator('[id^="btn-salvar-cotacao-"]')).toHaveCount(0);
    await page.waitForTimeout(1200); // deixa o PATCH de auto-save concluir

    // O reload mantém a mesma URL, então o onMounted
    // reaplica o override sozinho — não precisa mais reselecionar nada na UI.
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-cotacao").click();
    await expect(page.locator(`#cotacao-lote-${st.usd3}`).locator(`#input-taxa-${st.usd3}-XP`)).toHaveValue("5,42");
  });

  test("14 · Transportes: select de transportadora, PIX do Cadastro (só leitura) e sem campo de data", async ({ page }) => {
    await irPagamentos(page, "transportadora");
    await page.locator("#btn-novo-pagamento-TRANSPORTADORA").click();

    await expect(page.locator("#ng-data")).toHaveCount(0);

    await selectOption(page, "ng-nome-grupo", TRANSP_A);
    await expect(page.locator("#ng-chave-pix")).toHaveText(PIX_TRANSP_A);
    await expect(page.locator("#ng-chave-pix-rotulo")).toHaveText("Chave PIX");
    await esperarChavePixNaoFocavel(page);
    await expect(page.locator("#ng-chave-pix-editar")).toHaveCount(0);

    await selectOption(page, "ng-nome-grupo", TRANSP_B);
    await expect(page.locator("#ng-chave-pix")).toHaveText(PIX_TRANSP_B);

    await page.locator("#ng-item-paciente-0").fill(P_TRANSP);
    await page.locator("#ng-item-valor-0").fill("500");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    const gid = (await transportadoraGrupos(page)).find((g) => g.nomeGrupo === TRANSP_B)?.id;
    const grupo = page.locator(`#grupo-pagamento-${gid}`);
    await expect(grupo).toContainText(TRANSP_B);
    await expect(grupo).toContainText(P_TRANSP);
  });

  test("15 · item de grupo: editar e excluir (o grupo some quando esvazia)", async ({ page }) => {
    await irPagamentos(page, "despachante");

    // Cria um grupo aberto dedicado (os dos testes 4/8 já estão pagos).
    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_C);
    await page.locator("#ng-item-paciente-0").fill(P_EDIT);
    await page.locator("#ng-item-valor-0").fill("100");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    st.gEdit = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === DESP_C)?.id;
    expect(st.gEdit).toBeTruthy();

    const grupo = page.locator(`#grupo-pagamento-${st.gEdit}`);

    await grupo.locator(`#btn-editar-item-${st.gEdit}-0`).click();
    await page.locator("#ei-paciente").fill(P_EDITADO);
    await page.locator("#ei-valor").fill("999");
    await page.locator("#btn-save-editar-item").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento atualizado");
    await expect(grupo).toContainText(P_EDITADO);
    await expect(grupo).toContainText("R$ 999,00");

    await grupo.locator(`#btn-excluir-item-${st.gEdit}-0`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento excluído");
    // Era o único item -> o grupo inteiro some.
    await expect(page.locator(`#grupo-pagamento-${st.gEdit}`)).toHaveCount(0);
  });

  test("16 · excluir na seção 'Pagamentos realizados' (Banco e Despachante)", async ({ page }) => {
    await irPagamentos(page, "banco");

    // Banco: exclui o lançamento pago do teste 3 (era o único do lote -> lote some).
    const bancoRow = page.locator("#banco-realizados-lista").locator(`#lancamento-banco-${st.usd1Lanc}`);
    await bancoRow.locator(`#btn-excluir-lancamento-${st.usd1Lanc}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Lançamento excluído");
    await expect(page.locator("#banco-tab")).not.toContainText(CLIENTE_1);

    // Despachante: exclui o item G1 (índice 0 do grupo do teste 4) — o outro
    // permanece. A lista de realizados é ordenada por nome do paciente, então
    // não dá pra usar `.first()`: mira o botão pelo índice real do item no grupo.
    await page.locator("#tab-despachante").click();
    const lista = page.locator("#grupo-realizados-lista-DESPACHANTE");
    await expect(lista).toContainText(G1);
    await lista.locator(`#btn-excluir-item-realizado-DESPACHANTE-${st.gDesp}-0`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento excluído");
    await expect(lista).not.toContainText(G1);
    await expect(lista).toContainText(G2);
  });

  test("17 · (M-04) a API rejeita setar um item para 'Pago' direto; só NAO_PAGO<->COMPLEMENTO", async ({ page }) => {
    await irPagamentos(page, "despachante");

    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", DESP_B);
    await page.locator("#ng-item-paciente-0").fill(P_M04);
    await page.locator("#ng-item-valor-0").fill("120");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    st.gM04 = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === DESP_B)?.id;
    expect(st.gM04).toBeTruthy();

    // "Pago" direto num item -> rejeitado (regra M-04). Antes era permissivo.
    const rej = await page.request.patch(`/api/pagamentos/despachante/${st.gM04}`, {
      data: { index: 0, status: "PAGO" },
    });
    expect(rej.status()).toBe(400);

    // O ciclo permitido (NAO_PAGO -> COMPLEMENTO) passa.
    const ok = await page.request.patch(`/api/pagamentos/despachante/${st.gM04}`, {
      data: { index: 0, status: "COMPLEMENTO" },
    });
    expect(ok.ok()).toBeTruthy();
  });
  test("18 · só itens ATIVOS do Cadastro nos selects e o servidor recusa nome/fornecedor inexistente ou inativo", async ({ page }) => {
    await irPagamentos(page, "despachante");

    // Despachante: o inativo não é opção.
    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await page.locator("#ng-nome-grupo").click();
    await expect(page.getByRole("option", { name: DESP_A, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: DESP_INATIVO })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Transportadora: idem.
    await page.locator("#tab-transportadora").click();
    await page.locator("#btn-novo-pagamento-TRANSPORTADORA").click();
    await page.locator("#ng-nome-grupo").click();
    await expect(page.getByRole("option", { name: TRANSP_A, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: TRANSP_INATIVA })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Banco: o fornecedor inativo não é opção; "Outro" continua por último.
    await page.locator("#tab-banco").click();
    await page.locator("#btn-novo-pagamento-banco").click();
    await page.locator("#nl-fornecedor").click();
    await expect(page.getByRole("option", { name: FORN_A_TEXTO, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: FORN_INATIVO_TEXTO })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Outro", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Servidor: grupo novo com nome inexistente ou inativo é 400 (não depende do que a tela deixa escolher).
    const itens = [{ paciente: `Paciente ${RUN} Recusa`, valor: 10 }];
    for (const nomeGrupo of [DESP_INATIVO, `TESTE e2e Inexistente ${RUN}`]) {
      const r = await page.request.post("/api/pagamentos/despachante", {
        data: { data: hojeBrasilia(), empresa: "FARMAURORA", nomeGrupo, itens },
      });
      expect(r.status(), `despachante "${nomeGrupo}"`).toBe(400);
    }
    // Banco: fornecedor inativo/inexistente é 400.
    const base = { empresa: "FARMAURORA", moeda: "EUR", invoice: `INV-${RUN}-R`, cliente: `Cliente ${RUN} Recusa`, valorMoeda: 10 };
    for (const fornecedor of [FORN_INATIVO_TEXTO, `TESTE e2e Inexistente ${RUN} - Chile`]) {
      const r = await page.request.post("/api/pagamentos/banco", { data: { ...base, fornecedor } });
      expect(r.status(), `fornecedor "${fornecedor}"`).toBe(400);
    }
  });
});
