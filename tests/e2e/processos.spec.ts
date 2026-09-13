import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Follow-Up de processos — e2e contra o dev server real.
// Portado de tests/e2e/_aposentados/processos.skip.ts.
//
// Mudou desde o original:
//   - Processo persiste no Supabase (tabela follow_up), não em data/processos.json.
//     Não há mais snapshot/restore de arquivo. Cada teste que cria um processo
//     usa um RUN numérico único no nome do paciente; o afterAll apaga tudo que
//     casa com esse RUN via service role (mesmo padrão de pagamentos-lotes.spec.ts).
//   - O spec antigo NÃO fazia login(); hoje /api/** exige sessão. beforeEach faz
//     login como administrador.
//   - Seletores/labels conferidos contra os componentes atuais (ProcessoFormModal,
//     ProcessoRow, ProcessoDetail, ProcessoGroupList). Onde a UI ganhou contagem
//     nas abas ou os grupos passaram a ter cabeçalho <button>, os locators foram
//     ajustados; nenhuma asserção de regra de negócio foi afrouxada.

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

// RUN só dígitos: sobrevive intacto ao toTitleCaseName do campo Paciente
// (palavras numéricas não são alteradas), então dá pra casar por substring.
const RUN = String(Date.now()).slice(-9);

const P1 = `Paciente ${RUN} Processo Um`;
const P2 = `Paciente ${RUN} Processo Dois`;

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

// Grupos de consultor começam colapsados a cada carregamento — expande pelo
// cabeçalho <button> que contém o nome do consultor.
async function expandGroup(page: Page, consultor: string): Promise<void> {
  await page.locator("#processo-group-list button").filter({ hasText: consultor }).first().click();
}

test.describe.serial("Follow-Up de processos", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await db.from("follow_up").delete().ilike("paciente", `%${RUN}%`);
  });

  test("1 · cria um processo novo e ele aparece no grupo do consultor correto", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill(P1);
    await page.locator("#pf-pasta").fill("2026 - 001");
    await selectOption(page, "pf-consultor", "André Vitório");
    // empresa (FARMAURORA) e status (Elaboração / Fornecedores) ficam no default
    await page.locator("#btn-save-processo").click();

    await expect(page.locator("#toast-notice")).toContainText("Processo adicionado");

    await expandGroup(page, "André Vitório");
    const group = page.locator("#processo-group-list").locator("div").filter({ hasText: "André Vitório" }).first();
    await expect(group).toContainText(P1);
  });

  test("2 · filtra por status, por empresa e por responsável", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill(P2);
    await page.locator("#pf-pasta").fill("2026 - 002");
    await selectOption(page, "pf-consultor", "Thiago Guedes");
    await selectOption(page, "pf-empresa", "MAINZFARMA");
    await selectOption(page, "pf-status", "Em trânsito");
    await selectOption(page, "pf-responsavel", "Rebeca");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo adicionado");

    await expandGroup(page, "André Vitório");
    await expandGroup(page, "Thiago Guedes");

    const lista = page.locator("#processo-group-list");

    // Empresa: só MAINZFARMA -> some o P1, fica o P2.
    await selectOption(page, "filtro-empresa", "MAINZFARMA");
    await expect(lista).toContainText(P2);
    await expect(lista).not.toContainText(P1);
    await selectOption(page, "filtro-empresa", "Todas as empresas");

    // Status: só "Em trânsito" -> só o P2 (P1 está em Elaboração).
    await selectOption(page, "filtro-status", "Em trânsito");
    await expect(lista).toContainText(P2);
    await expect(lista).not.toContainText(P1);
    await selectOption(page, "filtro-status", "Todos os status");

    // Responsável: só "Rebeca" -> só o P2.
    await selectOption(page, "filtro-responsavel", "Rebeca");
    await expect(lista).toContainText(P2);
    await expect(lista).not.toContainText(P1);
    await selectOption(page, "filtro-responsavel", "Todos os responsáveis");

    await expect(lista).toContainText(P1);
    await expect(lista).toContainText(P2);
  });

  test("3 · busca por nome do paciente", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await expandGroup(page, "André Vitório");
    await expandGroup(page, "Thiago Guedes");

    const lista = page.locator("#processo-group-list");

    await page.locator("#processo-search").fill(`${RUN} Processo Dois`);
    await expect(lista).toContainText(P2);
    await expect(lista).not.toContainText(P1);

    await page.locator("#btn-clear-processo-search").click();
    await expect(lista).toContainText(P1);
    await expect(lista).toContainText(P2);
  });

  test("4 · expande uma linha e adiciona uma atualização à timeline", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expandGroup(page, "André Vitório");

    const row = page.locator('[id^="processo-row-"]').filter({ hasText: P1 });
    await row.locator("button").first().click();

    const detail = row.locator('[id^="processo-detail-"]');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Nenhuma atualização registrada ainda.");

    const form = detail.locator('form[id^="form-nova-atualizacao-"]');
    await form.locator('input[placeholder="Data (ex: 31/08)"]').fill("31/08");
    await form.locator('input[placeholder="Nova atualização..."]').fill("Fornecedor confirmou embarque.");
    await form.getByRole("button", { name: "Adicionar" }).click();

    await expect(detail).toContainText("Fornecedor confirmou embarque.");
    await expect(detail).not.toContainText("Nenhuma atualização registrada ainda.");
  });

  test("5 · muda status para 'Entregue' e o processo passa a aparecer só na aba Entregues", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expandGroup(page, "André Vitório");

    const row = page.locator('[id^="processo-row-"]').filter({ hasText: P1 });
    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');
    await detail.getByRole("button", { name: "Editar processo" }).click();

    await selectOption(page, "pf-status", "Entregue");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo atualizado");

    await expect(page.locator("#processo-group-list")).not.toContainText(P1);

    await page.locator("#tab-entregues").click();
    await expect(page.locator("#processo-delivered-list")).toContainText(P1);
  });

  test("6 · grupo de consultor começa colapsado e expande/colapsa ao clicar", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    const groupHeader = page.locator("#processo-group-list button").filter({ hasText: "Thiago Guedes" }).first();
    const row = page.locator('[id^="processo-row-"]').filter({ hasText: P2 });

    await expect(row).toBeHidden();
    await groupHeader.click();
    await expect(row).toBeVisible();
    await groupHeader.click();
    await expect(row).toBeHidden();
  });

  test("7 · capitaliza o nome do paciente automaticamente enquanto digita", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill("joão da silva de souza");

    await expect(page.locator("#pf-paciente")).toHaveValue("João da Silva de Souza");
  });

  test("8 · máscara da pasta aceita 2 e 3 dígitos na segunda parte", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();

    await page.locator("#pf-pasta").fill("202611");
    await expect(page.locator("#pf-pasta")).toHaveValue("2026 - 11");

    await page.locator("#pf-pasta").fill("2026117");
    await expect(page.locator("#pf-pasta")).toHaveValue("2026 - 117");
  });

  test("9 · campos de Medicamentos têm rótulo acima e convertem texto pra maiúsculas", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    await page.locator("#btn-novo-processo").click();

    await expect(page.locator('label[for="pf-medicamento-nome-0"]')).toHaveText("Nome");
    await expect(page.locator('label[for="pf-medicamento-dosagem-0"]')).toHaveText("Dosagem");
    await expect(page.locator('label[for="pf-medicamento-quantidade-0"]')).toHaveText("Quantidade");

    await page.locator("#pf-medicamento-nome-0").fill("enhertu");
    await expect(page.locator("#pf-medicamento-nome-0")).toHaveValue("ENHERTU");

    await page.locator("#pf-medicamento-dosagem-0").fill("100mg");
    await expect(page.locator("#pf-medicamento-dosagem-0")).toHaveValue("100MG");

    await page.locator("#pf-medicamento-quantidade-0").fill("6 caixas");
    await expect(page.locator("#pf-medicamento-quantidade-0")).toHaveValue("6 CAIXAS");
  });

  test("10 · campos de Datas mascaram DD/MM ao digitar só números, sem mexer em texto livre", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    await page.locator("#btn-novo-processo").click();

    await page.locator("#pf-data-po").fill("2708");
    await expect(page.locator("#pf-data-po")).toHaveValue("27/08");

    await page.locator("#pf-radar").fill("ASD");
    await expect(page.locator("#pf-radar")).toHaveValue("ASD");
  });

  test("11 · editar um processo com data em formato complexo não corrompe o valor existente", async ({ page }) => {
    const PACIENTE_DATA = `Paciente ${RUN} Data Complexa`;
    const dataEmbarqueOriginal = "26/11 - estratégia da compra";

    const createRes = await page.request.post("/api/processos", {
      data: {
        paciente: PACIENTE_DATA,
        pasta: "2026 - 995",
        empresa: "FARMAURORA",
        consultor: "Vinícius Alves",
        medicamentos: [],
        status: "elaboracao_fornecedores",
        datas: { dataEmbarque: dataEmbarqueOriginal },
        pendencias: [],
        atualizacoes: [],
      },
    });
    expect(createRes.ok()).toBe(true);

    await page.goto("/processos", { waitUntil: "networkidle" });
    await expandGroup(page, "Vinícius Alves");
    const row = page.locator('[id^="processo-row-"]').filter({ hasText: PACIENTE_DATA });
    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');
    await detail.getByRole("button", { name: "Editar processo" }).click();

    await expect(page.locator("#pf-data-embarque")).toHaveValue(dataEmbarqueOriginal);

    await page.locator("#pf-local-entrega").fill("São Paulo - SP");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo atualizado");

    await detail.getByRole("button", { name: "Editar processo" }).click();
    await expect(page.locator("#pf-data-embarque")).toHaveValue(dataEmbarqueOriginal);
  });

  test("12 · campo de nova atualização capitaliza a primeira letra da frase", async ({ page }) => {
    const PACIENTE_AT = `Paciente ${RUN} Atualizacao Capitaliza`;

    await page.goto("/processos", { waitUntil: "networkidle" });
    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill(PACIENTE_AT);
    await page.locator("#pf-pasta").fill("2026 - 996");
    await selectOption(page, "pf-consultor", "Gabriela Santana");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo adicionado");

    await expandGroup(page, "Gabriela Santana");
    const row = page.locator('[id^="processo-row-"]').filter({ hasText: PACIENTE_AT });
    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');

    const form = detail.locator('form[id^="form-nova-atualizacao-"]');
    const textoInput = form.locator('input[placeholder="Nova atualização..."]');
    await textoInput.fill("fornecedor sinalizou atraso no despacho.");
    await expect(textoInput).toHaveValue("Fornecedor sinalizou atraso no despacho.");

    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(detail).toContainText("Fornecedor sinalizou atraso no despacho.");
  });

  test("13 · salva um processo com Ordem preenchida sem erro (regressão do bug de type=number)", async ({ page }) => {
    const PACIENTE_ORDEM = `Paciente ${RUN} Ordem Numerica`;

    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill(PACIENTE_ORDEM);
    await page.locator("#pf-pasta").fill("2026 - 997");
    await page.locator("#pf-ordem").fill("3");
    await selectOption(page, "pf-consultor", "Mateus Morais");
    await page.locator("#btn-save-processo").click();

    await expect(page.locator("#toast-notice")).toContainText("Processo adicionado");

    await expandGroup(page, "Mateus Morais");
    const row = page.locator('[id^="processo-row-"]').filter({ hasText: PACIENTE_ORDEM });
    await expect(row).toContainText("Ordem 3");

    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');
    await detail.getByRole("button", { name: "Editar processo" }).click();
    await expect(page.locator("#pf-ordem")).toHaveValue("3");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo atualizado");
  });

  test("14 · Courier Simples oculta Despachante e Transportadora, e preserva o valor ao trocar de volta", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await selectOption(page, "pf-modal", "Air Cargo");
    await expect(page.locator("#pf-despachante")).toBeVisible();
    await expect(page.locator("#pf-transp-nome")).toBeVisible();

    await selectOption(page, "pf-despachante", "Bruno Lopes");
    await page.locator("#pf-transp-nome").fill("AJC");

    await selectOption(page, "pf-modal", "Courier Simples");
    await expect(page.locator("#pf-despachante")).toBeHidden();
    await expect(page.locator("#pf-transp-nome")).toBeHidden();

    await selectOption(page, "pf-modal", "Air Cargo");
    await expect(page.locator("#pf-despachante")).toBeVisible();
    await expect(page.locator("#pf-despachante")).toContainText("Bruno Lopes");
    await expect(page.locator("#pf-transp-nome")).toHaveValue("AJC");
  });

  test("15 · Fornecedor 'Outro' abre campo de texto livre e mantém o valor ao reabrir pra edição", async ({ page }) => {
    const PACIENTE_OUTRO = `Paciente ${RUN} Fornecedor Outro`;

    await page.goto("/processos", { waitUntil: "networkidle" });

    await page.locator("#btn-novo-processo").click();
    await page.locator("#pf-paciente").fill(PACIENTE_OUTRO);
    await page.locator("#pf-pasta").fill("2026 - 999");
    await selectOption(page, "pf-consultor", "Paulo Braga");

    await expect(page.locator("#pf-fornecedor-outro")).toBeHidden();
    await selectOption(page, "pf-fornecedor", "Outro");
    await expect(page.locator("#pf-fornecedor-outro")).toBeVisible();
    await page.locator("#pf-fornecedor-outro").fill("Fabricante XYZ");

    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#toast-notice")).toContainText("Processo adicionado");

    await expandGroup(page, "Paulo Braga");
    const row = page.locator('[id^="processo-row-"]').filter({ hasText: PACIENTE_OUTRO });
    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');
    await detail.getByRole("button", { name: "Editar processo" }).click();

    await expect(page.locator("#pf-fornecedor")).toContainText("Outro");
    await expect(page.locator("#pf-fornecedor-outro")).toHaveValue("Fabricante XYZ");
  });

  test("16 · abre sem erro um registro com modalEnvio legado 'Courier'", async ({ page }) => {
    const PACIENTE_LEGADO = `Paciente ${RUN} Modal Legado`;

    const createRes = await page.request.post("/api/processos", {
      data: {
        paciente: PACIENTE_LEGADO,
        pasta: "2026 - 998",
        empresa: "FARMAURORA",
        consultor: "Vinícius Alves",
        despachante: "Marcelo Lopes",
        fornecedor: "Upharm",
        modalEnvio: "Courier",
        medicamentos: [],
        status: "em_transito",
        datas: {},
        pendencias: [],
        atualizacoes: [],
      },
    });
    expect(createRes.ok()).toBe(true);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/processos", { waitUntil: "networkidle" });
    await expandGroup(page, "Vinícius Alves");

    const row = page.locator('[id^="processo-row-"]').filter({ hasText: PACIENTE_LEGADO });
    await row.locator("button").first().click();
    const detail = row.locator('[id^="processo-detail-"]');
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Editar processo" }).click();

    await expect(page.locator("#pf-despachante")).toContainText("Selecione");
    await expect(page.locator("#pf-fornecedor")).toContainText("Outro");
    await expect(page.locator("#pf-fornecedor-outro")).toHaveValue("Upharm");
    await expect(page.locator("#pf-modal")).toContainText("Selecione");

    expect(pageErrors).toEqual([]);
  });
});
