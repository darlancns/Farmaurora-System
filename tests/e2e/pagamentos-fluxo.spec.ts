import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fluxo de Pagamentos (Banco + Grupos) — e2e contra o dev server real.
// Portado de tests/e2e/_aposentados/pagamentos.skip.ts.
//
// Mudou desde o original:
//   - Banco e Grupos persistem no Supabase (pagamento_lotes_banco /
//     pagamento_lancamentos_banco / pagamento_grupos). PIX agora também
//     (pagamento_pix_chaves), não mais em JSON. Sem snapshot/restore de arquivo.
//   - O botão único "+ Novo lançamento" virou "+ Novo lote" (força um lote novo)
//     + "+ Lançamento" por card de lote. Os testes que criavam lançamento pelo
//     botão global agora criam via "+ Novo lote" e capturam o loteId/lancId pela
//     API pra escopar os locators — nada de "primeiro card da tela".
//   - Toasts reescritos ("Lote pago e movido para realizados" etc.) — as
//     asserções usam a substring estável.
//   - Tudo roda em MAINZFARMA pra isolar dos dados reais (FARMAURORA). O afterAll
//     apaga o que a suíte criou em MAINZFARMA (por created_at) e restaura a chave
//     PIX real do "Marcelo Lima" ao valor de antes.
//   - Não existe teste dormente que setasse "Pago" direto num item — o ciclo
//     dormente já era NAO_PAGO<->COMPLEMENTO. Adicionado um teste explícito (17)
//     de que a API rejeita PAGO direto (regra M-04), que é o guard novo.

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
    return { url: map.NUXT_PUBLIC_SUPABASE_URL ?? "", serviceKey: map.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "" };
  } catch {
    return { url: "", serviceKey: "" };
  }
}

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
const NOVA_PIX = `pix-e2e-${RUN}@marcelo`;

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

// Snapshot da linha PIX do Marcelo Lima (nome REAL) pra restaurar no fim.
let pixMarceloBak: Record<string, unknown> | null = null;

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

// Vai pra /pagamentos já na empresa MAINZFARMA (isola dos dados reais).
async function irPagamentos(page: Page, tab: "banco" | "cotacao" | "despachante" | "transportadora"): Promise<void> {
  await page.goto("/pagamentos", { waitUntil: "networkidle" });
  await selectOption(page, "pagamento-empresa", "MainzFarma");
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

// "+ Novo lote" -> preenche -> salva. Devolve loteId + lancId recém-criados.
async function novoLote(
  page: Page,
  opts: { moeda?: "Dólar (USD)" | "Euro (EUR)"; fornecedor: string; invoice: string; cliente: string; valor: string },
): Promise<{ loteId: string; lancId: string }> {
  const antes = new Set((await bancoPayload(page)).lotes.map((l) => l.id));

  await page.locator("#btn-novo-lote-banco").click();
  await expect(page.locator("#novo-lancamento-banco-overlay")).toBeVisible();
  if (opts.moeda) await selectOption(page, "nl-moeda", opts.moeda);
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
  // auto-curável (purga MAINZFARMA), então uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  async function purgarMainzfarma(client: SupabaseClient): Promise<void> {
    // MAINZFARMA é um namespace limpo (sem dados reais) — a suíte é a única a
    // escrever lá. Purga tudo pra ser auto-curável entre execuções (um worker
    // que crashou no meio não roda o afterAll e deixa lixo).
    await client.from("pagamento_lancamentos_banco").delete().eq("empresa", "MAINZFARMA");
    await client.from("pagamento_lotes_banco").delete().eq("empresa", "MAINZFARMA");
    await client.from("pagamento_grupos").delete().eq("empresa", "MAINZFARMA");
  }

  test.beforeAll(async () => {
    if (!runnable) return;
    const client = db();
    await purgarMainzfarma(client);

    // O teste 8 mexe na chave PIX do "Marcelo Lima" (nome REAL, tabela
    // compartilhada). Snapshot pra restaurar no fim. Se o valor atual for lixo de
    // uma execução anterior que crashou (padrão "pix-e2e-...@marcelo"), apaga o
    // override e trata como "sem override" — o form volta a mostrar o default.
    const { data } = await client
      .from("pagamento_pix_chaves")
      .select("*")
      .eq("tipo", "DESPACHANTE")
      .eq("nome", "Marcelo Lima")
      .maybeSingle();
    if (data && typeof data.chave_pix === "string" && data.chave_pix.startsWith("pix-e2e-")) {
      await client.from("pagamento_pix_chaves").delete().eq("tipo", "DESPACHANTE").eq("nome", "Marcelo Lima");
      pixMarceloBak = null;
    } else {
      pixMarceloBak = data ?? null;
    }
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    const client = db();
    await purgarMainzfarma(client);
    // Restaura a chave PIX real do Marcelo Lima ao valor anterior à suíte.
    await client.from("pagamento_pix_chaves").delete().eq("tipo", "DESPACHANTE").eq("nome", "Marcelo Lima");
    if (pixMarceloBak) await client.from("pagamento_pix_chaves").insert(pixMarceloBak);
  });

  test("1 · '+ Novo lote' cria o lote e o lançamento nasce sem valor em reais", async ({ page }) => {
    await irPagamentos(page, "banco");

    const { loteId, lancId } = await novoLote(page, {
      fornecedor: "Poros - Turquia",
      invoice: `INV-${RUN}-1`,
      cliente: CLIENTE_1,
      valor: "100",
    });
    st.usd1 = loteId;
    st.usd1Lanc = lancId;

    await expect(page.locator("#toast-notice")).toContainText("Lote criado com o lançamento");

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
    await selectOption(page, "ng-nome-grupo", "Bruno Lopes");
    await page.locator("#ng-item-paciente-0").fill(G1);
    await page.locator("#ng-item-valor-0").fill("300");
    await page.locator("#ng-add-item").click();
    await page.locator("#ng-item-paciente-1").fill(G2);
    await page.locator("#ng-item-valor-1").fill("400");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    st.gDesp = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === "Bruno Lopes")?.id;
    expect(st.gDesp, "grupo Bruno Lopes recém-criado").toBeTruthy();

    const grupo = page.locator(`#grupo-pagamento-${st.gDesp}`);
    await expect(grupo).toContainText(G1);
    await expect(grupo).toContainText(G2);

    await grupo.locator(`#btn-pagar-grupo-${st.gDesp}`).click();
    await expect(page.locator("#toast-notice")).toContainText("Grupo pago");

    // O grupo saiu inteiro da seção "em aberto".
    await expect(page.locator(`#grupo-pagamento-${st.gDesp}`)).toHaveCount(0);
    await expect(page.locator(`#btn-pagar-grupo-${st.gDesp}`)).toHaveCount(0);

    const realizados = page.locator("#grupo-realizados-lista-DESPACHANTE");
    await expect(realizados).toContainText(G1);
    await expect(realizados).toContainText(G2);
    await expect(realizados).toContainText("Bruno Lopes");
    await expect(realizados).toContainText("Pago");
  });

  test("5 · sem navegação por data; seletor de empresa no cabeçalho", async ({ page }) => {
    await irPagamentos(page, "banco");

    const novo = await novoLote(page, {
      moeda: "Euro (EUR)",
      fornecedor: "Beldimed - Bélgica",
      invoice: `INV-${RUN}-EUR`,
      cliente: CLIENTE_EUR,
      valor: "50",
    });
    st.eur = novo.loteId;
    st.eurLanc = novo.lancId;

    await page.locator("#tab-cotacao").click();
    await expect(page.locator("#cotacao-tab")).toContainText("Cotação EUR");

    // Não existe mais a navegação por data nem a toolbar antiga.
    await expect(page.locator("#pagamento-toolbar")).toHaveCount(0);
    await expect(page.locator("#pagamento-data-next")).toHaveCount(0);
    await expect(page.locator("#pagamento-data-prev")).toHaveCount(0);

    // O seletor de empresa fica no cabeçalho da página.
    await expect(page.locator("#pagamentos-page").locator("#pagamento-empresa")).toBeVisible();
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

  test("8 · PIX do despachante: pré-preenche, edita e fica salva pro próximo pagamento", async ({ page }) => {
    await irPagamentos(page, "despachante");

    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", "Marcelo Lima");
    await expect(page.locator("#ng-chave-pix")).toHaveValue("05.342.805/0001-37");
    await expect(page.locator("#ng-chave-pix")).toHaveJSProperty("readOnly", true);

    await page.locator("#ng-chave-pix-editar").click();
    await expect(page.locator("#ng-chave-pix")).toHaveJSProperty("readOnly", false);
    await page.locator("#ng-chave-pix").fill(NOVA_PIX);
    await page.locator("#ng-chave-pix").blur();
    await expect(page.locator("#toast-notice")).toContainText("Chave PIX salva para Marcelo Lima");

    await page.locator("#ng-item-paciente-0").fill(P_PIX);
    await page.locator("#ng-item-valor-0").fill("100");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    st.gPix = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === "Marcelo Lima")?.id;

    // Reabre: Marcelo Lima agora traz a chave nova; outro despachante mantém a dele.
    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", "Marcelo Lima");
    await expect(page.locator("#ng-chave-pix")).toHaveValue(NOVA_PIX);
    await selectOption(page, "ng-nome-grupo", "Bruno Lopes");
    await expect(page.locator("#ng-chave-pix")).toHaveValue("036.223.838-36");
    await page.keyboard.press("Escape");
  });

  test("11 · realizados do Banco: lista plana por cliente, busca e filtros", async ({ page }) => {
    await irPagamentos(page, "banco");

    const lista = page.locator("#banco-realizados-lista");
    await expect(lista).toContainText(CLIENTE_1); // pago no teste 3 (XP · Poros - Turquia)

    await page.locator("#banco-realizado-busca").fill("zzz-nao-existe");
    await expect(page.locator("#banco-tab")).toContainText("Nenhum pagamento encontrado");
    await page.locator("#btn-clear-banco-realizado-busca").click();
    await expect(lista).toContainText(CLIENTE_1);

    await selectOption(page, "filtro-banco-realizado", "XP");
    await expect(lista).toContainText(CLIENTE_1);
    await selectOption(page, "filtro-banco-realizado", "Rendimento");
    await expect(page.locator("#banco-tab")).toContainText("Nenhum pagamento encontrado");
    await selectOption(page, "filtro-banco-realizado", "Todos os bancos");

    await selectOption(page, "filtro-fornecedor-realizado", "Poros - Turquia");
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

    await selectOption(page, "filtro-grupo-realizado-DESPACHANTE", "Bruno Lopes");
    await expect(lista).toContainText(G1);

    await selectOption(page, "filtro-status-realizado-DESPACHANTE", "Pago");
    await expect(lista).toContainText(G1);
  });

  test("13 · Cotação: a taxa salva sozinha (sem botão) e sobrevive ao reload", async ({ page }) => {
    await irPagamentos(page, "banco");

    const novo = await novoLote(page, {
      fornecedor: "Poros - Turquia",
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

    await page.reload({ waitUntil: "networkidle" });
    await selectOption(page, "pagamento-empresa", "MainzFarma");
    await page.locator("#tab-cotacao").click();
    await expect(page.locator(`#cotacao-lote-${st.usd3}`).locator(`#input-taxa-${st.usd3}-XP`)).toHaveValue("5,42");
  });

  test("14 · Transportes: select de transportadora, PIX pré-preenchida e sem campo de data", async ({ page }) => {
    await irPagamentos(page, "transportadora");
    await page.locator("#btn-novo-pagamento-TRANSPORTADORA").click();

    await expect(page.locator("#ng-data")).toHaveCount(0);

    await selectOption(page, "ng-nome-grupo", "AJC");
    await expect(page.locator("#ng-chave-pix")).toHaveValue("09.614.254/0001-74");
    await expect(page.locator("#ng-chave-pix")).toHaveJSProperty("readOnly", true);

    await selectOption(page, "ng-nome-grupo", "Doctor");
    await expect(page.locator("#ng-chave-pix")).toHaveValue("22.095.367/0001-79");

    await page.locator("#ng-item-paciente-0").fill(P_TRANSP);
    await page.locator("#ng-item-valor-0").fill("500");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");

    const gid = (await transportadoraGrupos(page)).find((g) => g.nomeGrupo === "Doctor")?.id;
    const grupo = page.locator(`#grupo-pagamento-${gid}`);
    await expect(grupo).toContainText("Doctor");
    await expect(grupo).toContainText(P_TRANSP);
  });

  test("15 · item de grupo: editar e excluir (o grupo some quando esvazia)", async ({ page }) => {
    await irPagamentos(page, "despachante");

    // Cria um grupo aberto dedicado (os dos testes 4/8 já estão pagos).
    await page.locator("#btn-novo-pagamento-DESPACHANTE").click();
    await selectOption(page, "ng-nome-grupo", "Andreza Faconi");
    await page.locator("#ng-item-paciente-0").fill(P_EDIT);
    await page.locator("#ng-item-valor-0").fill("100");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    st.gEdit = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === "Andreza Faconi")?.id;
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
    await selectOption(page, "ng-nome-grupo", "Bruno Lopes");
    await page.locator("#ng-item-paciente-0").fill(P_M04);
    await page.locator("#ng-item-valor-0").fill("120");
    await page.locator("#btn-save-novo-grupo").click();
    await expect(page.locator("#toast-notice")).toContainText("Pagamento adicionado");
    st.gM04 = (await despachanteGrupos(page)).find((g) => !g.realizado && g.nomeGrupo === "Bruno Lopes")?.id;
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
});
