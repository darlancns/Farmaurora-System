import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Sino global combinado (Fase C2): confirma que Fornecedor (calculado
// on-the-fly a partir de Processo[]) e Recados (tabela `notificacoes`)
// convivem no MESMO badge/painel sem se misturar — resolver um não mexe no
// outro, e "marcar como lida" em Recados persiste como "some da lista".
//
// Setup: insere 1 processo TESTE_ com prazo de fornecedor vencido (mesma
// técnica de notificacao-fornecedor.spec.ts) + 1 linha em `notificacoes`
// endereçada à conta escritora, direto via service role (não passa pelo
// fluxo de criar recado — não é o que este teste cobre).

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

const PROC_ID = `TESTE_bellcombo_${Date.now().toString(36)}`;
const PACIENTE = `TESTE Bell Combinado ${Date.now().toString(36)}`;
const NOTIF_ID = `TESTE_notif_bellcombo_${Date.now().toString(36)}`;
const RECADO_MENSAGEM = `TESTE bell combinado — recado ${Date.now().toString(36)}`;

function dataBRDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

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

async function badgeCount(page: Page): Promise<number> {
  const badge = page.locator("#badge-notificacoes-fornecedor");
  if ((await badge.count()) === 0) return 0;
  const txt = (await badge.textContent())?.trim() ?? "";
  return Number(txt) || 0;
}

test.describe.serial("Sino global — Fornecedor + Recados combinados", () => {
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  test.beforeAll(async () => {
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fornecedor "Poros - Turquia": prazo 3 dias corridos; compra há 10 dias
    // => vencido há 7. Sem abertura_thread/alerta_fornecedor_resolvido.
    const now = new Date().toISOString();
    const { error: procError } = await db.from("follow_up").insert({
      id: PROC_ID,
      paciente: PACIENTE,
      pasta: "2026 - 901",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      status: "elaboracao_fornecedores",
      fornecedor: "Poros - Turquia",
      data_compra_po: dataBRDiasAtras(10),
      medicamentos: [],
      pendencias: [],
      atualizacoes: [],
      created_at: now,
      updated_at: now,
    });
    if (procError) throw new Error(`Falha ao inserir processo de teste: ${procError.message}`);

    const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw new Error(`Falha ao listar contas: ${usersError.message}`);
    const writerId = users.users.find((u) => u.email === writer.email)?.id;
    if (!writerId) throw new Error(`Conta escritora ${writer.email} não encontrada no Supabase Auth`);

    const { error: notifError } = await db.from("notificacoes").insert({
      id: NOTIF_ID,
      destinatario_id: writerId,
      tipo: "recado_novo",
      recado_id: null,
      mensagem: RECADO_MENSAGEM,
      lida: false,
      created_at: now,
    });
    if (notifError) throw new Error(`Falha ao inserir notificação de teste: ${notifError.message}`);
  });

  test.afterAll(async () => {
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await db.from("follow_up").delete().eq("id", PROC_ID);
    await db.from("notificacoes").delete().eq("id", NOTIF_ID);
  });

  test("1 · badge soma Fornecedor + Recados; painel mostra as 2 seções separadas", async ({ page }) => {
    await login(page);
    // Página SEM relação com Processos — confirma que o sino (e os dois tipos
    // de notificação) aparece fora de /processos também.
    await page.goto("/pagamentos", { waitUntil: "networkidle" });

    const antes = await badgeCount(page);
    expect(antes).toBeGreaterThanOrEqual(2); // pelo menos os 2 que este teste inseriu

    await page.locator("#btn-notificacoes-fornecedor").click();
    const painel = page.locator("#painel-notificacoes-fornecedor");
    await expect(painel).toBeVisible();

    await expect(painel.getByText("Fornecedor", { exact: true })).toBeVisible();
    await expect(painel.getByText("Recados", { exact: true })).toBeVisible();

    const itemFornecedor = page.locator(`#notificacao-fornecedor-${PROC_ID}`);
    await expect(itemFornecedor).toBeVisible();
    await expect(itemFornecedor).toContainText(PACIENTE);

    const itemRecado = page.locator(`#notificacao-recado-${NOTIF_ID}`);
    await expect(itemRecado).toBeVisible();
    await expect(itemRecado).toContainText(RECADO_MENSAGEM);
  });

  test("2 · resolver o alerta de Fornecedor não afeta a notificação de Recados", async ({ page }) => {
    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });

    const antes = await badgeCount(page);

    await page.locator("#btn-notificacoes-fornecedor").click();
    await page.locator(`#notificacao-fornecedor-${PROC_ID}`).locator(`#btn-resolver-notificacao-${PROC_ID}`).click();

    await expect(page.locator(`#notificacao-fornecedor-${PROC_ID}`)).toBeHidden();
    // Recados intacto: item continua visível, com sua própria mensagem.
    await expect(page.locator(`#notificacao-recado-${NOTIF_ID}`)).toBeVisible();

    await expect(async () => {
      expect(await badgeCount(page)).toBe(Math.max(antes - 1, 0));
    }).toPass({ timeout: 10000 });
  });

  test("3 · marcar a notificação de Recados como lida some da lista e persiste após reload", async ({ page }) => {
    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });

    const antes = await badgeCount(page);
    expect(antes).toBeGreaterThanOrEqual(1); // sobrou a de Recados do teste anterior

    await page.locator("#btn-notificacoes-fornecedor").click();
    const item = page.locator(`#notificacao-recado-${NOTIF_ID}`);
    await expect(item).toBeVisible();
    await item.click();

    await expect(item).toBeHidden();
    await expect(async () => {
      expect(await badgeCount(page)).toBe(Math.max(antes - 1, 0));
    }).toPass({ timeout: 10000 });

    // Persistiu no servidor — recarregar não traz de volta.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#notificacao-recado-${NOTIF_ID}`)).toHaveCount(0);
  });
});
