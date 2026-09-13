import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Alerta de prazo de fornecedor (sino em /processos). Portado de
// tests/e2e/_aposentados/notificacaoFornecedor.skip.ts.
//
// Mudou desde o original:
//   - Processo agora persiste no Supabase (tabela follow_up), não em
//     data/processos.json. O setup insere uma linha TESTE_ direto no banco via
//     service role e o afterAll a apaga — mesmo padrão de pagamentos-lotes.spec.ts
//     e dos smokes de integração.
//   - O spec antigo nunca fazia login(); hoje /api/** exige sessão. Fazemos
//     login como escritor (o sino só aparece pra operacional/administrador).
//   - Não dá pra zerar a tabela follow_up (tem dados reais), então as asserções
//     de CONTAGEM absoluta do badge ("1") viraram asserções relativas: o nosso
//     processo TESTE_ aparece no painel, e resolver ele decrementa o badge em 1
//     (ou o esconde, se era o único alerta). O comportamento testado — alerta
//     aparece p/ prazo vencido, some ao resolver — é o mesmo.

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

const T = "follow_up";
const PROC_ID = `TESTE_notif_${Date.now().toString(36)}`;
const PACIENTE = `TESTE Alerta Fornecedor ${Date.now().toString(36)}`;

function dataBRDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
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

async function badgeCount(page: Page): Promise<number> {
  const badge = page.locator("#badge-notificacoes-fornecedor");
  if ((await badge.count()) === 0) return 0;
  const txt = (await badge.textContent())?.trim() ?? "";
  return Number(txt) || 0;
}

test.describe.serial("Alerta de prazo de fornecedor", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  test.beforeAll(async () => {
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const now = new Date().toISOString();
    // Fornecedor "Poros - Turquia" tem prazo de 3 dias corridos; compra há 10
    // dias => prazo vencido há 7. Sem abertura_thread e sem
    // alerta_fornecedor_resolvido => a regra gera o alerta.
    const { error } = await db.from(T).insert({
      id: PROC_ID,
      paciente: PACIENTE,
      pasta: "2026 - 900",
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
    if (error) throw new Error(`Falha ao inserir processo de teste: ${error.message}`);
  });

  test.afterAll(async () => {
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await db.from(T).delete().eq("id", PROC_ID);
  });

  test("1 · sino mostra o badge e o painel lista o processo com prazo vencido", async ({ page }) => {
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    // Badge visível com uma contagem >= 1 (não checamos o número exato: a tabela
    // tem dados reais que também podem gerar alertas).
    const badge = page.locator("#badge-notificacoes-fornecedor");
    await expect(badge).toBeVisible();
    expect(await badgeCount(page)).toBeGreaterThanOrEqual(1);

    await page.locator("#btn-notificacoes-fornecedor").click();
    const painel = page.locator("#painel-notificacoes-fornecedor");
    await expect(painel).toBeVisible();

    const item = page.locator(`#notificacao-fornecedor-${PROC_ID}`);
    await expect(item).toBeVisible();
    await expect(item).toContainText(PACIENTE);
    await expect(item).toContainText("Poros - Turquia");
    await expect(item).toContainText("7 dias de atraso");
  });

  test("2 · painel fecha ao pressionar Esc e ao clicar fora", async ({ page }) => {
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });
    const painel = page.locator("#painel-notificacoes-fornecedor");

    await page.locator("#btn-notificacoes-fornecedor").click();
    await expect(painel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();

    await page.locator("#btn-notificacoes-fornecedor").click();
    await expect(painel).toBeVisible();
    await page.locator("#processos-page h1").click();
    await expect(painel).toBeHidden();
  });

  test("3 · resolver o alerta tira o item do painel e decrementa o badge", async ({ page }) => {
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const antes = await badgeCount(page);
    expect(antes).toBeGreaterThanOrEqual(1);

    await page.locator("#btn-notificacoes-fornecedor").click();
    const painel = page.locator("#painel-notificacoes-fornecedor");
    await expect(painel).toBeVisible();

    const item = page.locator(`#notificacao-fornecedor-${PROC_ID}`);
    await expect(item).toBeVisible();
    await item.locator(`#btn-resolver-notificacao-${PROC_ID}`).click();

    // O item some da lista otimisticamente e o PATCH persiste alertaFornecedorResolvido.
    await expect(item).toBeHidden();

    // Badge: se o nosso era o único alerta, some; senão cai exatamente 1.
    await expect(async () => {
      const depois = await badgeCount(page);
      expect(depois).toBe(Math.max(antes - 1, 0));
    }).toPass({ timeout: 10000 });

    // E persistiu: recarregar não traz o alerta de volta.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#notificacao-fornecedor-${PROC_ID}`)).toHaveCount(0);
  });
});
