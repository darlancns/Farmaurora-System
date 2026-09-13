import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Rendimento com 1 única ordem pendente aplica a taxa direto (sem o modal de
// fechamento por ordem), gravando `taxaEscolhida` real no lote. Com 2+, segue
// abrindo o modal. E se um lote fechado direto recebe um 2º lançamento, a
// cotação invalida e o próximo fechamento volta a exigir o modal.
//
// Mesmo gating/cleanup de pagamentos-lotes.spec.ts:
//   E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) + .env com URL/service key.

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
const RUN = Date.now().toString(36);
const criados: string[] = [];

interface LoteApi {
  id: string;
  moeda: "USD" | "EUR";
  realizado: boolean;
  bancoEscolhido: string | null;
  taxaEscolhida: number | null;
}
interface LancApi {
  id: string;
  loteId: string;
  cliente: string;
  valorReais: number | null;
  taxa: number | null;
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

// "+ Novo lote" USD com `n` lançamentos. Devolve o id do lote.
async function loteComLancamentos(page: Page, n: number): Promise<string> {
  const antes = new Set((await payload(page)).lotes.map((l) => l.id));
  await page.locator("#btn-novo-lote-banco").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  await selectOption(page, "nl-moeda", "Dólar (USD)");
  await selectOption(page, "nl-fornecedor", "Poros - Turquia");
  await page.locator("#nl-cliente").fill(`E2E ${RUN} rend 1`);
  await page.locator("#nl-invoice").fill(`INV-${RUN}-1`);
  await page.locator("#nl-valor-moeda").fill("1000,00");
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);

  const novo = (await payload(page)).lotes.find((l) => !antes.has(l.id))!;
  expect(novo).toBeTruthy();
  criados.push(novo.id);

  for (let i = 2; i <= n; i++) {
    await adicionarLancamento(page, novo.id, `E2E ${RUN} rend ${i}`, "500,00");
  }
  return novo.id;
}

async function adicionarLancamento(
  page: Page,
  loteId: string,
  cliente: string,
  valor: string,
): Promise<void> {
  await page.locator("#tab-banco").click();
  await page.locator(`#btn-novo-lancamento-lote-${loteId}`).click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  await selectOption(page, "nl-fornecedor", "Poros - Turquia");
  await page.locator("#nl-cliente").fill(cliente);
  await page.locator("#nl-invoice").fill(`INV-${RUN}-x`);
  await page.locator("#nl-valor-moeda").fill(valor);
  await page.locator("#btn-save-novo-lancamento").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toHaveCount(0);
}

// Preenche a taxa do card do Rendimento e clica "Usar este banco".
async function usarRendimento(page: Page, loteId: string, taxa: string): Promise<void> {
  await page.locator("#tab-cotacao").click();
  const card = page.locator(`#cotacao-lote-${loteId}`);
  await expect(card).toBeVisible();
  await card.locator(`#input-taxa-${loteId}-RENDIMENTO`).fill(taxa);
  await card.locator(`#btn-usar-banco-${loteId}-RENDIMENTO`).click();
}

test.describe.serial("Pagamentos — Rendimento com 1 ordem aplica direto", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  let lote1 = ""; // 1 pendente, fechado direto

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });
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

  test("1 · 1 pendente: 'Usar este banco' aplica direto, sem abrir o modal", async ({ page }) => {
    lote1 = await loteComLancamentos(page, 1);
    await usarRendimento(page, lote1, "5,4231");

    // Modal NÃO aparece.
    await expect(page.locator("#fechamento-rendimento-overlay")).toHaveCount(0);
    await expect(page.locator("#toast-notice")).toContainText("Rendimento escolhido");

    const { lotes, lancamentos } = await payload(page);
    const lote = lotes.find((l) => l.id === lote1)!;
    expect(lote.bancoEscolhido).toBe("RENDIMENTO");
    // taxa única REAL no lote (diferente do caso 2+ ordens, onde fica null).
    expect(lote.taxaEscolhida).toBe(5.4231);

    const lanc = lancamentos.find((l) => l.loteId === lote1)!;
    expect(lanc.valorReais).toBeCloseTo(1000 * 5.4231, 4);
    expect(lanc.taxa).toBe(5.4231); // trilha de auditoria gravada

    // Badge da Cotação usa "@ taxa", não "taxa por ordem".
    const card = page.locator(`#cotacao-lote-${lote1}`);
    await expect(card).toContainText("@ 5.4231");
    await expect(card).not.toContainText("taxa por ordem");

    // Rodapé do card no Banco mostra a taxa, não "por ordem".
    await page.locator("#tab-banco").click();
    const bancoCard = page.locator(`#lote-banco-${lote1}`);
    await expect(bancoCard).toContainText("5.4231");
    await expect(bancoCard).not.toContainText("por ordem");
  });

  test("2 · 2 pendentes: 'Usar este banco' abre o modal (inalterado)", async ({ page }) => {
    const lote2 = await loteComLancamentos(page, 2);
    await usarRendimento(page, lote2, "5,40");

    // Agora o modal aparece.
    const modal = page.locator("#fechamento-rendimento-overlay");
    await expect(modal).toBeVisible();

    // Preenche a taxa de cada ordem e confirma.
    const inputs = modal.locator('input[id^="fr-taxa-"]');
    await expect(inputs).toHaveCount(2);
    await inputs.nth(0).fill("5,40");
    await inputs.nth(1).fill("5,47");
    await modal.locator("#btn-confirmar-fechamento-rendimento").click();
    await expect(modal).toHaveCount(0);

    const { lotes } = await payload(page);
    const lote = lotes.find((l) => l.id === lote2)!;
    expect(lote.bancoEscolhido).toBe("RENDIMENTO");
    expect(lote.taxaEscolhida).toBeNull(); // 2+ ordens → sem taxa representativa

    await page.locator("#tab-cotacao").click();
    await expect(page.locator(`#cotacao-lote-${lote2}`)).toContainText("taxa por ordem");
  });

  test("3 · fechado direto + 2º lançamento → invalida; próximo fechamento exige modal", async ({ page }) => {
    // lote1 foi fechado direto no teste 1 (1 pendente, taxaEscolhida real).
    await adicionarLancamento(page, lote1, `E2E ${RUN} rend 2`, "500,00");

    const { lotes, lancamentos } = await payload(page);
    const lote = lotes.find((l) => l.id === lote1)!;
    expect(lote.bancoEscolhido).toBeNull();
    expect(lote.taxaEscolhida).toBeNull();
    for (const l of lancamentos.filter((x) => x.loteId === lote1)) {
      expect(l.valorReais).toBeNull();
      expect(l.taxa).toBeNull();
    }

    // Agora com 2 pendentes, "Usar este banco" volta a abrir o modal.
    await usarRendimento(page, lote1, "5,50");
    await expect(page.locator("#fechamento-rendimento-overlay")).toBeVisible();
    await page.locator("#btn-cancel-fechamento-rendimento").click();
  });
});
