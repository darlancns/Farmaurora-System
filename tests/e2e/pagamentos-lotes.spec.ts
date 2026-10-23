import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";

// "Novo pagamento" do Banco: a MOEDA define o lote.
//   - USD sem lote aberto            → cria o lote USD junto com o pagamento
//   - USD com lote USD aberto        → entra nele
//   - EUR com só USD aberto          → cria o lote EUR sem tocar no USD
//   - lote da moeda já cotado        → aviso no modal; salvar reabre a cotação
//   - 2+ lotes da moeda (só legado)  → aviso com o N real; entra no mais recente
//   - edição                         → moeda visível e desabilitada
// Mais a numeração estável do lote (numeroLote imutável, reinício em 1).
//
// Roda só no harness local (Supabase falso; a guarda aborta fora dele): a moeda define o lote,
// então rodar contra dados reais jogaria pagamentos de teste em lotes REAIS. Precisa de:
//   E2E_ADMIN_EMAIL/_PASSWORD  (ou E2E_OPERACIONAL_*)  — cargo com escrita
//   .env do projeto com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY
//     — usados SÓ para limpar as tabelas de Banco antes/depois (seguro pela guarda).
// Lotes "legado" (2+ da mesma moeda) são semeados pela API com forcarLoteNovo — a
// UI não cria mais isso.
//
// "Falha no meio" (insert do lançamento falha logo depois do lote ser criado) precisa
// de um Supabase com injeção de falha: defina E2E_FAKE_SUPABASE_CONTROL (URL do
// controle do Supabase falso). Sem isso o teste é pulado — a regra em si tem
// cobertura unitária em tests/unit/criarLancamentoBanco.spec.ts.
// Sem credenciais, a suíte inteira é pulada.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const faultControl = process.env.E2E_FAKE_SUPABASE_CONTROL ?? "";

function lerEnv(): { url: string; serviceKey: string } {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const map = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
    return {
      url: map.NUXT_PUBLIC_SUPABASE_URL ?? "",
      serviceKey: map.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "",
    };
  } catch {
    return { url: "", serviceKey: "" };
  }
}

// Aborta (antes de qualquer escrita) se o Supabase em uso não for o local do harness.
assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);

const RUN = `${Date.now().toString(36)}`;
const URL_PAGAMENTOS = "/pagamentos";

type Moeda = "USD" | "EUR";
interface LoteApi {
  id: string;
  data: string;
  createdAt: string;
  numeroLote: number;
  moeda: Moeda;
  realizado: boolean;
  bancoEscolhido: string | null;
  taxaEscolhida: number | null;
  opcoes: Array<{ banco: string; taxaCorretagem: number; taxa: number | null }>;
}
interface LancApi {
  id: string;
  loteId: string;
  cliente: string;
  moeda: Moeda;
  valorReais: number | null;
}
interface BancoPayload {
  lotes: LoteApi[];
  lancamentos: LancApi[];
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

async function payload(page: Page): Promise<BancoPayload> {
  const res = await page.request.get("/api/pagamentos/banco");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as BancoPayload;
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

const overlay = (page: Page) => page.locator("#novo-lancamento-banco-overlay");

async function abrirNovoPagamento(page: Page): Promise<void> {
  await page.locator("#btn-novo-pagamento-banco").click();
  await expect(overlay(page)).toBeVisible();
}

async function preencher(page: Page, opts: { moeda?: Moeda; cliente: string; valor?: string }): Promise<void> {
  if (opts.moeda) await page.locator(`#nl-moeda-${opts.moeda}`).click();
  await selectOption(page, "nl-fornecedor", "Poros - Turquia");
  await page.locator("#nl-cliente").fill(opts.cliente);
  await page.locator("#nl-invoice").fill(`INV-${RUN}`);
  await page.locator("#nl-valor-moeda").fill(opts.valor ?? "1000,00");
}

// "Novo pagamento" completo pela UI (o padrão de moeda do modal é USD).
async function novoPagamento(page: Page, opts: { moeda?: Moeda; cliente: string; valor?: string }): Promise<void> {
  await abrirNovoPagamento(page);
  await preencher(page, opts);
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(overlay(page)).toHaveCount(0);
}

// Lote "legado" (2+ da mesma moeda): a UI não cria mais, então semeia pela API.
async function semearLote(page: Page, moeda: Moeda, cliente: string): Promise<string> {
  const res = await page.request.post("/api/pagamentos/banco", {
    data: {
      empresa: "FARMAURORA",
      moeda,
      fornecedor: "Poros - Turquia",
      invoice: `INV-${RUN}-seed`,
      cliente,
      valorMoeda: 1000,
      forcarLoteNovo: true,
    },
  });
  expect(res.ok(), `semear lote ${moeda}`).toBeTruthy();
  return ((await res.json()) as { lote: { id: string } }).lote.id;
}

async function cotarXP(page: Page, loteId: string, taxa: number, corretagem: number): Promise<void> {
  const res = await page.request.patch("/api/pagamentos/cotacao", {
    data: { loteId, opcoes: [{ banco: "XP", taxaCorretagem: corretagem, taxa }], bancoEscolhido: "XP" },
  });
  expect(res.ok(), "cotar XP").toBeTruthy();
}

async function irParaBanco(page: Page): Promise<void> {
  await page.goto(URL_PAGAMENTOS, { waitUntil: "networkidle" });
  await page.locator("#tab-banco").click();
}

function dataLongaDoLote(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Escolhe um banco de taxa única (XP) para o lote — pré-requisito de "Pago".
async function escolherBancoXP(page: Page, loteId: string): Promise<void> {
  await page.locator("#tab-cotacao").click();
  const card = page.locator(`#cotacao-lote-${loteId}`);
  await expect(card).toBeVisible();
  await card.locator(`#input-taxa-${loteId}-XP`).fill("5,4000");
  await card.locator(`#btn-usar-banco-${loteId}-XP`).click();
  await expect(page.locator("#toast-notice")).toContainText("Banco escolhido");
}

async function pagarLote(page: Page, loteId: string): Promise<void> {
  await page.locator("#tab-banco").click();
  await page.locator(`#btn-pagar-lote-${loteId}`).click();
  // "Pago" pede confirmação antes de chamar o PATCH.
  await page.locator("#btn-confirm-dialog-confirm").click();
  await expect(page.locator("#toast-notice")).toContainText("Lote pago");
}

function purgador() {
  return createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Esvazia as tabelas de Banco INTEIRAS — só é seguro porque a guarda impede rodar fora do harness local.
async function limparTabelasDeBanco(): Promise<void> {
  const db = purgador();
  await db.from("pagamento_lancamentos_banco").delete().neq("id", "");
  await db.from("pagamento_lotes_banco").delete().neq("id", "");
}

test.describe.serial("Pagamentos — Novo pagamento: a moeda define o lote", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  test.beforeAll(async () => {
    if (runnable) await limparTabelasDeBanco();
  });

  test.afterAll(async () => {
    if (runnable) await limparTabelasDeBanco();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await irParaBanco(page);
  });

  test("1 · modal: título novo, padrão USD, sem o texto de ajuda antigo; cancelar não cria nada", async ({ page }) => {
    await expect(page.getByRole("button", { name: "+ Novo pagamento" })).toBeVisible();
    await abrirNovoPagamento(page);

    const modal = overlay(page);
    await expect(modal.getByRole("heading", { name: "Novo pagamento" })).toBeVisible();
    await expect(modal).not.toContainText("Novo lote — Banco");
    await expect(modal).not.toContainText("abre um lote novo");
    await expect(modal).not.toContainText("nada é criado se cancelar");

    // Moeda: radiogroup com 2 radios; padrão Dólar · USD; o rótulo do valor acompanha.
    const grupo = page.getByRole("radiogroup", { name: "Moeda" });
    await expect(grupo).toBeVisible();
    await expect(grupo.getByRole("radio")).toHaveCount(2);
    await expect(grupo.getByRole("radio", { name: "Dólar · USD" })).toHaveAttribute("aria-checked", "true");
    await expect(grupo.getByRole("radio", { name: "Euro · EUR" })).toHaveAttribute("aria-checked", "false");
    await expect(modal).toContainText("Valor (USD)");
    await page.locator("#nl-moeda-EUR").click();
    await expect(modal).toContainText("Valor (EUR)");
    await expect(page.locator("#nl-moeda-EUR")).toHaveAttribute("aria-checked", "true");

    const antes = (await payload(page)).lotes.length;
    await page.locator("#btn-cancel-novo-lancamento").click();
    await expect(modal).toHaveCount(0);
    expect((await payload(page)).lotes.length).toBe(antes);
  });

  test("2 · USD sem lote aberto: cria o lote USD junto com o pagamento", async ({ page }) => {
    expect((await payload(page)).lotes.filter((l) => !l.realizado)).toHaveLength(0);

    await novoPagamento(page, { cliente: `E2E ${RUN} USD-1` });
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    const { lotes, lancamentos } = await payload(page);
    const abertos = lotes.filter((l) => !l.realizado);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]!.moeda).toBe("USD");
    expect(abertos[0]!.numeroLote).toBe(1);
    expect(lancamentos.filter((l) => l.loteId === abertos[0]!.id)).toHaveLength(1);
    await expect(page.locator(`#lote-banco-${abertos[0]!.id}`)).toContainText("Aguardando banco");
  });

  test("3 · USD com lote USD aberto: entra nele, sem aviso e sem lote novo", async ({ page }) => {
    const usd = (await payload(page)).lotes.find((l) => !l.realizado)!;

    await abrirNovoPagamento(page);
    await expect(page.locator("#nl-avisos-destino")).toBeHidden();
    await preencher(page, { cliente: `E2E ${RUN} USD-2` });
    await page.locator("#btn-save-novo-lancamento").click();
    await expect(overlay(page)).toHaveCount(0);

    const { lotes, lancamentos } = await payload(page);
    expect(lotes.filter((l) => !l.realizado && l.moeda === "USD")).toHaveLength(1);
    expect(lancamentos.filter((l) => l.loteId === usd.id)).toHaveLength(2);
  });

  test("4 · EUR com só USD aberto (cotado): cria o 2º lote EUR sem tocar no USD", async ({ page }) => {
    const usd = (await payload(page)).lotes.find((l) => !l.realizado)!;
    await cotarXP(page, usd.id, 5.4, 27);
    const antes = await payload(page);
    const usdAntes = antes.lotes.find((l) => l.id === usd.id)!;
    expect(usdAntes.bancoEscolhido).toBe("XP");

    await page.reload({ waitUntil: "networkidle" });
    await novoPagamento(page, { moeda: "EUR", cliente: `E2E ${RUN} EUR-1`, valor: "50" });

    const { lotes, lancamentos } = await payload(page);
    const abertos = lotes.filter((l) => !l.realizado);
    expect(abertos).toHaveLength(2);
    const eur = abertos.find((l) => l.moeda === "EUR")!;
    expect(eur.numeroLote).toBe(1);
    expect(lancamentos.filter((l) => l.loteId === eur.id)).toHaveLength(1);
    // USD intacto: continua cotado, com os mesmos valores em reais.
    const usdDepois = lotes.find((l) => l.id === usd.id)!;
    expect(usdDepois).toEqual(usdAntes);
    expect(lancamentos.filter((l) => l.loteId === usd.id)).toEqual(
      antes.lancamentos.filter((l) => l.loteId === usd.id),
    );
  });

  test("5 · lote da moeda cotado: aviso no modal e a cotação é invalidada ao salvar (taxaCorretagem preservada)", async ({ page }) => {
    const usd = (await payload(page)).lotes.find((l) => l.moeda === "USD" && !l.realizado)!;
    expect(usd.bancoEscolhido).toBe("XP");

    await abrirNovoPagamento(page);
    const avisos = page.locator("#nl-avisos-destino");
    await expect(avisos).toContainText("Este lote já foi cotado. Adicionar o pagamento reabre a cotação.");
    // O lote EUR não está cotado: o aviso acompanha a moeda escolhida.
    await page.locator("#nl-moeda-EUR").click();
    await expect(avisos).toBeHidden();
    await page.locator("#nl-moeda-USD").click();
    await expect(avisos).toContainText("Este lote já foi cotado");

    await preencher(page, { cliente: `E2E ${RUN} USD-3` });
    await page.locator("#btn-save-novo-lancamento").click();
    await expect(overlay(page)).toHaveCount(0);

    const { lotes, lancamentos } = await payload(page);
    const depois = lotes.find((l) => l.id === usd.id)!;
    expect(depois.bancoEscolhido).toBeNull();
    expect(depois.taxaEscolhida).toBeNull();
    for (const o of depois.opcoes) expect(o.taxa).toBeNull();
    expect(depois.opcoes.find((o) => o.banco === "XP")!.taxaCorretagem).toBe(27);
    for (const l of lancamentos.filter((x) => x.loteId === usd.id)) expect(l.valorReais).toBeNull();
    await expect(page.locator(`#lote-banco-${usd.id}`)).toContainText("Aguardando banco");
  });

  test("6 · edição: moeda visível e desabilitada, sem aviso de cotação, texto de reabertura mantido", async ({ page }) => {
    const { lotes, lancamentos } = await payload(page);
    const eur = lotes.find((l) => l.moeda === "EUR" && !l.realizado)!;
    const lancEur = lancamentos.find((l) => l.loteId === eur.id)!;

    await page.locator(`#btn-editar-lancamento-${lancEur.id}`).click();
    const modal = overlay(page);
    await expect(modal.getByRole("heading", { name: "Editar lançamento — Banco" })).toBeVisible();
    await expect(modal).toContainText("alterar o valor reabre a cotação do lote.");

    const grupo = page.getByRole("radiogroup", { name: "Moeda" });
    await expect(grupo).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#nl-moeda-EUR")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#nl-moeda-EUR")).toBeDisabled();
    await expect(page.locator("#nl-moeda-USD")).toBeDisabled();
    await expect(page.locator("#nl-avisos-destino")).toBeHidden();

    // Mesmo com USD sendo o lote cotado/legado, em edição nunca há aviso.
    await page.locator("#btn-cancel-novo-lancamento").click();
    await expect(modal).toHaveCount(0);
  });

  test("7 · 2+ lotes da moeda (legado): aviso com o N real e a data; entra no mais recente", async ({ page }) => {
    const antigo = (await payload(page)).lotes.find((l) => l.moeda === "USD" && !l.realizado)!;
    const recente = await semearLote(page, "USD", `E2E ${RUN} USD-legado`);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-banco").click();

    const lotes = (await payload(page)).lotes.filter((l) => l.moeda === "USD" && !l.realizado);
    expect(lotes).toHaveLength(2);
    const alvo = [...lotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    expect(alvo.id).toBe(recente);

    const idsAntes = new Set((await payload(page)).lancamentos.map((l) => l.id));
    await abrirNovoPagamento(page);
    const aviso = `Há 2 lotes em USD em aberto. Este entra no mais recente (${dataLongaDoLote(alvo.data)}).`;
    await expect(page.locator("#nl-avisos-destino")).toContainText(aviso);
    await expect(page.locator("#nl-avisos-destino")).not.toContainText(/Lote \d/);
    await preencher(page, { cliente: `E2E ${RUN} USD-4` });
    await page.locator("#btn-save-novo-lancamento").click();
    await expect(overlay(page)).toHaveCount(0);

    // (o nome do cliente é capitalizado pelo campo, então o lançamento novo é achado pelo id)
    const novos = (await payload(page)).lancamentos.filter((l) => !idsAntes.has(l.id));
    expect(novos).toHaveLength(1);
    expect(novos[0]!.loteId).toBe(recente);
    expect(novos[0]!.loteId).not.toBe(antigo.id);
  });

  test("8 · '+ Lançamento' não existe em nenhum lote", async ({ page }) => {
    await expect(page.locator('[id^="lote-banco-"]').first()).toBeVisible();
    await expect(page.locator('[id^="btn-novo-lancamento-lote-"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /\+ Lançamento/ })).toHaveCount(0);
    await expect(page.locator("#banco-tab")).not.toContainText("+ Lançamento");
  });

  test("9 · numeração do lote: pagar o Lote 1 não renumera o Lote 2; sem aberto, o próximo reinicia em 1", async ({ page }) => {
    // Estado do teste anterior: 2 USD abertos (Lote 1 e Lote 2) + 1 EUR. Paga o USD Lote 1.
    const abertos = (await payload(page)).lotes.filter((l) => l.moeda === "USD" && !l.realizado);
    const lote1 = abertos.find((l) => l.numeroLote === 1)!;
    const lote2 = abertos.find((l) => l.numeroLote === 2)!;

    await escolherBancoXP(page, lote1.id);
    await pagarLote(page, lote1.id);
    expect((await payload(page)).lotes.find((l) => l.id === lote2.id)!.numeroLote).toBe(2);

    await escolherBancoXP(page, lote2.id);
    await pagarLote(page, lote2.id);

    // Nenhum USD aberto → o novo pagamento cria o lote reiniciando em 1.
    await novoPagamento(page, { cliente: `E2E ${RUN} USD-5` });
    const novo = (await payload(page)).lotes.find((l) => l.moeda === "USD" && !l.realizado)!;
    expect(novo.numeroLote).toBe(1);
  });

  test("10 · falha no meio: o erro aparece, o modal fica aberto e nenhum lote vazio sobra", async ({ page, request }) => {
    test.skip(!faultControl, "defina E2E_FAKE_SUPABASE_CONTROL (Supabase falso com injeção de falha)");

    // Limpa o USD aberto do teste anterior para que o pagamento precise CRIAR o lote.
    await limparTabelasDeBanco();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-banco").click();
    expect((await payload(page)).lotes).toHaveLength(0);

    const armar = await request.post(`${faultControl}/fail`, {
      data: { table: "pagamento_lancamentos_banco", op: "insert" },
    });
    expect(armar.ok()).toBeTruthy();

    await abrirNovoPagamento(page);
    await preencher(page, { cliente: `E2E ${RUN} falha` });
    await page.locator("#btn-save-novo-lancamento").click();

    // O erro do servidor é um 500 genérico ("Server Error"); o fallback do app é "Erro ao adicionar lançamento".
    await expect(page.locator("#toast-notice")).toHaveText(/Server Error|Erro ao adicionar lançamento/);
    await expect(overlay(page)).toBeVisible();
    const { lotes, lancamentos } = await payload(page);
    expect(lotes).toHaveLength(0); // o lote criado nesta chamada foi desfeito
    expect(lancamentos).toHaveLength(0);

    // A falha era de uso único: tentar de novo funciona.
    await page.locator("#btn-save-novo-lancamento").click();
    await expect(overlay(page)).toHaveCount(0);
    const depois = await payload(page);
    expect(depois.lotes).toHaveLength(1);
    expect(depois.lancamentos).toHaveLength(1);
  });
});
