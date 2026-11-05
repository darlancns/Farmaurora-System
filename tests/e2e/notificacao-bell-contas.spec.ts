import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";

// Sino global — seção "Contas" (notificação `conta_editada`, Fase B de "Minha conta"): o tipo novo
// aparece SÓ na seção "Contas" (nunca em "Recados"), entra no badge uma vez só, e clicar leva a
// /configuracoes?aba=contas marcando como lida. Mesmo gate de notificacao-bell-combinado.spec.ts:
// precisa de E2E_ADMIN_EMAIL/_PASSWORD (a rota /configuracoes só abre pra sócio/administrador hoje),
// do .env com URL + service role de um Supabase LOCAL (assertSupabaseLocal aborta fora de loopback)
// e do valor 'conta_editada' no enum `tipo_notificacao` (migration 20261105000000 aplicada nesse
// Supabase de teste — sem ele os testes pulam).

const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };

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
    return { url: map.NUXT_PUBLIC_SUPABASE_URL ?? "", serviceKey: map.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "" };
  } catch {
    return { url: "", serviceKey: "" };
  }
}

// Aborta (antes de qualquer escrita) se o Supabase em uso não for o local do harness.
assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(admin.email && admin.password && env.url && env.serviceKey);

const SUFIXO = Date.now().toString(36);
const NOTIF_RECADO_ID = `TESTE_notif_contas_recado_${SUFIXO}`;
const NOTIF_CONTA_ID = `TESTE_notif_contas_conta_${SUFIXO}`;
const MSG_RECADO = `TESTE contas — recado ${SUFIXO}`;
const MSG_CONTA = `TESTE contas — Fulano editou a senha ${SUFIXO}`;

let tipoContaDisponivel = false;

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(admin.email);
    await page.locator("#login-password").fill(admin.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function badgeCount(page: Page): Promise<number> {
  const badge = page.locator("#badge-notificacoes-fornecedor");
  if ((await badge.count()) === 0) return 0;
  return Number((await badge.textContent())?.trim() ?? "") || 0;
}

test.describe.serial("Sino global — seção Contas", () => {
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY (Supabase local)",
  );

  test.beforeAll(async () => {
    const db = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw new Error(`Falha ao listar contas: ${usersError.message}`);
    const adminId = users.users.find((u) => u.email === admin.email)?.id;
    if (!adminId) throw new Error(`Conta ${admin.email} não encontrada no Supabase Auth`);

    const now = new Date().toISOString();
    const base = { destinatario_id: adminId, recado_id: null, lida: false, created_at: now };

    const { error: recadoError } = await db
      .from("notificacoes")
      .insert({ ...base, id: NOTIF_RECADO_ID, tipo: "recado_novo", mensagem: MSG_RECADO });
    if (recadoError) throw new Error(`Falha ao inserir notificação de recado: ${recadoError.message}`);

    // Pode falhar se o enum local ainda não tem 'conta_editada' (migration não aplicada): os testes pulam.
    const { error: contaError } = await db
      .from("notificacoes")
      .insert({ ...base, id: NOTIF_CONTA_ID, tipo: "conta_editada", mensagem: MSG_CONTA });
    tipoContaDisponivel = !contaError;
  });

  test.afterAll(async () => {
    const db = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await db.from("notificacoes").delete().in("id", [NOTIF_RECADO_ID, NOTIF_CONTA_ID]);
  });

  test("1 · conta_editada aparece só em 'Contas'; recado continua só em 'Recados'; badge conta cada uma uma vez", async ({
    page,
  }) => {
    test.skip(!tipoContaDisponivel, "enum tipo_notificacao sem 'conta_editada' neste Supabase de teste");

    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });

    expect(await badgeCount(page)).toBeGreaterThanOrEqual(2); // as 2 que este teste inseriu

    await page.locator("#btn-notificacoes-fornecedor").click();
    const painel = page.locator("#painel-notificacoes-fornecedor");
    await expect(painel).toBeVisible();

    await expect(painel.getByText("Recados", { exact: true })).toBeVisible();
    await expect(painel.locator("#secao-notificacoes-conta")).toHaveText("Contas");

    const itemRecado = page.locator(`#notificacao-recado-${NOTIF_RECADO_ID}`);
    const itemConta = page.locator(`#notificacao-conta-${NOTIF_CONTA_ID}`);
    await expect(itemRecado).toContainText(MSG_RECADO);
    await expect(itemConta).toContainText(MSG_CONTA);

    // A conta NÃO caiu na seção Recados (não existe item de recado com o id dela) e vice-versa.
    await expect(page.locator(`#notificacao-recado-${NOTIF_CONTA_ID}`)).toHaveCount(0);
    await expect(page.locator(`#notificacao-conta-${NOTIF_RECADO_ID}`)).toHaveCount(0);

    // Ordem do painel: Recados (com o recado) antes de Contas (com a conta).
    const texto = (await painel.textContent()) ?? "";
    expect(texto.indexOf(MSG_RECADO)).toBeGreaterThan(texto.indexOf("Recados"));
    expect(texto.indexOf("Contas")).toBeGreaterThan(texto.indexOf(MSG_RECADO));
    expect(texto.indexOf(MSG_CONTA)).toBeGreaterThan(texto.indexOf("Contas"));
  });

  test("2 · clicar na notificação de conta abre /configuracoes?aba=contas, marca como lida e baixa o badge", async ({
    page,
  }) => {
    test.skip(!tipoContaDisponivel, "enum tipo_notificacao sem 'conta_editada' neste Supabase de teste");

    await login(page);
    await page.goto("/pagamentos", { waitUntil: "networkidle" });
    const antes = await badgeCount(page);

    await page.locator("#btn-notificacoes-fornecedor").click();
    await page.locator(`#notificacao-conta-${NOTIF_CONTA_ID}`).click();

    await expect(page).toHaveURL(/\/configuracoes\?aba=contas$/);

    await expect(async () => {
      expect(await badgeCount(page)).toBe(Math.max(antes - 1, 0));
    }).toPass({ timeout: 10000 });

    // A de recado ficou intacta; a de conta não volta depois do reload (lida persistiu).
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#btn-notificacoes-fornecedor").click();
    await expect(page.locator(`#notificacao-conta-${NOTIF_CONTA_ID}`)).toHaveCount(0);
    await expect(page.locator(`#notificacao-recado-${NOTIF_RECADO_ID}`)).toBeVisible();
  });
});
