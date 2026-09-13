import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Roteamento financeiro: qual lote recebe qual lançamento quando há 2+ lotes
// abertos para a mesma (empresa + moeda). Guarda de regressão da numeração
// (numeroLote imutável, reinício em 1) e dos dois modos de entrada:
//   - "+ Novo lote"  → cria um lote NOVO (moeda escolhida no modal)
//   - "+ Lançamento"  → entra no lote do card (loteId explícito, moeda travada)
//
// Roda contra o dev server real. Precisa de:
//   E2E_ADMIN_EMAIL/_PASSWORD  (ou E2E_OPERACIONAL_*)  — cargo com escrita
//   .env do projeto com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY
//     — usados SÓ no afterAll pra apagar os lotes que o teste criou (inclui os
//       pagos, que a UI não deixa remover).
// Sem isso, a suíte inteira é pulada.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};

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

const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);

const RUN = `${Date.now().toString(36)}`;
const criados: string[] = []; // ids dos lotes que este run criou — apagados no fim

interface LoteApi {
  id: string;
  numeroLote: number;
  moeda: "USD" | "EUR";
  realizado: boolean;
  bancoEscolhido: string | null;
}
interface LancApi {
  id: string;
  loteId: string;
  cliente: string;
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

const MOEDA_LABEL = { USD: "Dólar (USD)", EUR: "Euro (EUR)" } as const;

// "+ Novo lote" → preenche o modal → salva. Devolve o id do lote recém-criado
// (diff da lista antes/depois).
async function novoLote(
  page: Page,
  opts: { moeda: "USD" | "EUR"; cliente: string; valor?: string },
): Promise<string> {
  const antes = new Set((await payload(page)).lotes.map((l) => l.id));

  await page.locator("#btn-novo-lote-banco").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toContainText("Novo lote — Banco");
  await selectOption(page, "nl-moeda", MOEDA_LABEL[opts.moeda]);
  await selectOption(page, "nl-fornecedor", "Poros - Turquia");
  await page.locator("#nl-cliente").fill(opts.cliente);
  await page.locator("#nl-invoice").fill(`INV-${RUN}`);
  await page.locator("#nl-valor-moeda").fill(opts.valor ?? "1000,00");
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);

  const depois = (await payload(page)).lotes;
  const novo = depois.find((l) => !antes.has(l.id));
  expect(novo, "um lote novo deveria ter sido criado").toBeTruthy();
  criados.push(novo!.id);
  return novo!.id;
}

// "+ Lançamento" de um card específico → modal com moeda travada → salva.
async function lancamentoNoLote(
  page: Page,
  loteId: string,
  cliente: string,
): Promise<void> {
  await page.locator(`#btn-novo-lancamento-lote-${loteId}`).click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toContainText("Novo lançamento — Banco");
  await expect(page.locator("#nl-moeda")).toBeDisabled();
  await selectOption(page, "nl-fornecedor", "Poros - Turquia");
  await page.locator("#nl-cliente").fill(cliente);
  await page.locator("#nl-invoice").fill(`INV-${RUN}`);
  await page.locator("#nl-valor-moeda").fill("500,00");
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);
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
  await expect(page.locator("#toast-notice")).toContainText("Lote pago");
}

test.describe.serial("Pagamentos — lotes concorrentes por empresa+moeda", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  let usd1 = "";
  let usd2 = "";
  let eur1 = "";

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });
    await page.locator("#tab-banco").click();
  });

  test.afterAll(async () => {
    if (!runnable || !criados.length) return;
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const id of criados) {
      await db.from("pagamento_lancamentos_banco").delete().eq("lote_id", id);
      await db.from("pagamento_lotes_banco").delete().eq("id", id);
    }
  });

  test("1 · '+ Novo lote' + cancelar não cria nada", async ({ page }) => {
    const antes = (await payload(page)).lotes.length;

    await page.locator("#btn-novo-lote-banco").click();
    await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
    await page.locator("#btn-cancel-novo-lancamento").click();
    await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);

    expect((await payload(page)).lotes.length).toBe(antes);
  });

  test("2 · '+ Novo lote' confirmando com EUR cria o lote com o lançamento dentro", async ({ page }) => {
    eur1 = await novoLote(page, { moeda: "EUR", cliente: `E2E ${RUN} EUR` });

    const { lotes, lancamentos } = await payload(page);
    const lote = lotes.find((l) => l.id === eur1)!;
    expect(lote.moeda).toBe("EUR");
    expect(lote.realizado).toBe(false);
    // Primeiro lote EUR aberto dessa empresa → numeroLote 1.
    expect(lote.numeroLote).toBe(1);
    expect(lancamentos.filter((l) => l.loteId === eur1)).toHaveLength(1);
  });

  test("3 · dois lotes USD abertos: botão por card, sem ambiguidade de loteId", async ({ page }) => {
    usd1 = await novoLote(page, { moeda: "USD", cliente: `E2E ${RUN} USD-A` });
    usd2 = await novoLote(page, { moeda: "USD", cliente: `E2E ${RUN} USD-B` });

    const lotes = (await payload(page)).lotes;
    expect(lotes.find((l) => l.id === usd1)!.numeroLote).toBe(1);
    expect(lotes.find((l) => l.id === usd2)!.numeroLote).toBe(2);

    // Cada card tem o seu próprio botão de lançamento (id com o loteId).
    await expect(page.locator(`#btn-novo-lancamento-lote-${usd1}`)).toBeVisible();
    await expect(page.locator(`#btn-novo-lancamento-lote-${usd2}`)).toBeVisible();

    // O botão do card do Lote 2 grava no Lote 2, não no 1.
    await lancamentoNoLote(page, usd2, `E2E ${RUN} USD-B2`);
    const { lancamentos } = await payload(page);
    expect(lancamentos.filter((l) => l.loteId === usd2)).toHaveLength(2);
    expect(lancamentos.filter((l) => l.loteId === usd1)).toHaveLength(1);
  });

  test("4 · Cotação mostra 'Lote 1' e 'Lote 2' separadas, cada uma com seus lançamentos", async ({ page }) => {
    await page.locator("#tab-cotacao").click();

    const card1 = page.locator(`#cotacao-lote-${usd1}`);
    const card2 = page.locator(`#cotacao-lote-${usd2}`);
    await expect(card1).toContainText("Lote 1 · Cotação USD");
    await expect(card2).toContainText("Lote 2 · Cotação USD");
    // Sem a data repetida dentro da caixa (fica só no seletor do topo).
    await expect(card1).not.toContainText("Cotação USD ·");

    // "Ordens" = contagem de pendentes: Lote 1 tem 1, Lote 2 tem 2.
    await expect(card1.locator(`#cotacao-banco-${usd1}-XP`)).toContainText("1");
    await expect(card2.locator(`#cotacao-banco-${usd2}-XP`)).toContainText("2");
  });

  test("5 · pagar o Lote 1 não renumera o Lote 2", async ({ page }) => {
    await escolherBancoXP(page, usd1);
    await pagarLote(page, usd1);

    const lotes = (await payload(page)).lotes;
    expect(lotes.find((l) => l.id === usd1)!.realizado).toBe(true);
    // Lote 2 continua Lote 2 — some da aba Cotação nada, o número não muda.
    expect(lotes.find((l) => l.id === usd2)!.numeroLote).toBe(2);

    await page.locator("#tab-cotacao").click();
    await expect(page.locator(`#cotacao-lote-${usd2}`)).toContainText("Lote 2 · Cotação USD");
    await expect(page.locator(`#cotacao-lote-${usd1}`)).toHaveCount(0);
  });

  test("6 · pago o Lote 2, o próximo lote USD nasce como Lote 1 de novo", async ({ page }) => {
    await escolherBancoXP(page, usd2);
    await pagarLote(page, usd2);

    // Nenhum lote USD aberto agora → o novo reinicia em 1.
    const usd3 = await novoLote(page, { moeda: "USD", cliente: `E2E ${RUN} USD-C` });
    const lotes = (await payload(page)).lotes;
    expect(lotes.find((l) => l.id === usd3)!.numeroLote).toBe(1);

    // EUR ficou intocado o tempo todo: ainda aberto, ainda Lote 1.
    const eur = lotes.find((l) => l.id === eur1)!;
    expect(eur.realizado).toBe(false);
    expect(eur.numeroLote).toBe(1);
  });
});
