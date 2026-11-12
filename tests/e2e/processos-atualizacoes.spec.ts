import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import { lerEnv } from "./_guards/supabaseEnv";
import { fixarVisaoLista } from "./_helpers/visaoProcessos";

// Atualizações (timeline) de um processo: adicionar, editar, cancelar, excluir com confirmação, falha
// de salvamento, conflito de versão (409), cargo somente-leitura e aba Entregues.
// Roda SÓ no Supabase local (a guarda aborta fora de loopback). Os processos são semeados direto pela
// service role, com ids fixos deste spec, e removidos no fim.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const consultor = {
  email: process.env.E2E_CONSULTOR_EMAIL ?? "",
  password: process.env.E2E_CONSULTOR_PASSWORD ?? "",
  nome: process.env.E2E_CONSULTOR_NOME ?? "",
};

assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);
const temConsultor = Boolean(consultor.email && consultor.password && consultor.nome);

const RUN = String(Date.now()).slice(-9);
const ID = `proc_e2e_at_${RUN}`;
const ID_ENTREGUE = `proc_e2e_at_ent_${RUN}`;
const ID_CONSULTOR = `proc_e2e_at_cons_${RUN}`;
const ID_CONSULTOR_ENTREGUE = `proc_e2e_at_cons_ent_${RUN}`;
const PACIENTE = `Paciente ${RUN} Atualizacoes`;
const PACIENTE_ENTREGUE = `Paciente ${RUN} Atualizacoes Entregue`;
const PACIENTE_CONSULTOR = `Paciente ${RUN} Atualizacoes Consultor`;
const PACIENTE_CONSULTOR_ENTREGUE = `Paciente ${RUN} Atualizacoes Consultor Entregue`;

const SEMENTE = [
  { data: "01/09", texto: "Fornecedor confirmou embarque." },
  { data: "", texto: "Documentos enviados ao despachante." },
];

function admin() {
  return createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function semear(id: string, paciente: string, extra: Record<string, unknown> = {}): Promise<void> {
  const db = admin();
  await db.from("follow_up").delete().eq("id", id);
  const agora = new Date().toISOString();
  const { error } = await db.from("follow_up").insert({
    id,
    paciente,
    pasta: "2026 - 950",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    status: "em_transito",
    medicamentos: [],
    pendencias: [],
    atualizacoes: SEMENTE,
    created_at: agora,
    updated_at: agora,
    ...extra,
  });
  if (error) throw new Error(`Falha ao semear ${id}: ${error.message}`);
}

async function atualizacoesNoBanco(id: string): Promise<Array<{ data: string; texto: string }>> {
  const { data, error } = await admin().from("follow_up").select("atualizacoes").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data.atualizacoes as Array<{ data: string; texto: string }>;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  // A Lista não é mais a visão padrão de quem edita (Kanban, Etapa F): este spec testa a Lista.
  await fixarVisaoLista(page);
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

// Abre o detalhe do processo na aba "Em andamento" (grupo do consultor "André Vitório").
async function abrirDetalhe(page: Page, id: string = ID): Promise<void> {
  await page.goto("/processos", { waitUntil: "networkidle" });
  await page.locator("#processo-group-list button").filter({ hasText: "André Vitório" }).first().click();
  await page.locator(`#processo-row-${id} > button`).click();
  await expect(page.locator(`#processo-detail-${id}`)).toBeVisible();
}

// Abre o detalhe do processo na aba "Entregues".
async function abrirDetalheEntregue(page: Page, id: string = ID_ENTREGUE): Promise<void> {
  await page.goto("/processos", { waitUntil: "networkidle" });
  await page.locator("#tab-entregues").click();
  await page.locator(`#btn-toggle-entregue-${id}`).click();
  await expect(page.locator(`#processo-detail-${id}`)).toBeVisible();
}

const item = (page: Page, id: string, indice: number) => page.locator(`#atualizacao-${id}-${indice}`);

test.describe.serial("Atualizações do processo", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!runnable, "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env.e2e (Supabase local)");

  test.beforeEach(async ({ page }) => {
    await semear(ID, PACIENTE);
    await semear(ID_ENTREGUE, PACIENTE_ENTREGUE, { status: "entregue" });
    await login(page, writer.email, writer.password);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    await admin().from("follow_up").delete().ilike("paciente", `%${RUN}%`);
  });

  test("adiciona uma atualização; campos só limpam depois de gravar", async ({ page }) => {
    await abrirDetalhe(page);
    const form = page.locator(`#form-nova-atualizacao-${ID}`);
    await form.locator('input[placeholder="Data (ex: 31/08)"]').fill("05/11");
    await form.locator('input[placeholder="Nova atualização..."]').fill("nova frase de teste");
    await form.getByRole("button", { name: "Adicionar" }).click();

    // Capitaliza a primeira letra, aparece na lista e os campos limpam.
    await expect(item(page, ID, 2)).toContainText("Nova frase de teste");
    await expect(item(page, ID, 2)).toContainText("05/11");
    await expect(form.locator('input[placeholder="Nova atualização..."]')).toHaveValue("");
    await expect(form.locator('input[placeholder="Data (ex: 31/08)"]')).toHaveValue("");
    expect((await atualizacoesNoBanco(ID)).map((a) => a.texto)).toEqual([
      ...SEMENTE.map((a) => a.texto),
      "Nova frase de teste",
    ]);
  });

  test("clique duplo em Adicionar grava uma só atualização", async ({ page }) => {
    await abrirDetalhe(page);
    const form = page.locator(`#form-nova-atualizacao-${ID}`);
    await form.locator('input[placeholder="Nova atualização..."]').fill("Clique duplo");
    await form.getByRole("button", { name: "Adicionar" }).dblclick();

    await expect(item(page, ID, 2)).toContainText("Clique duplo");
    await expect(page.locator(`[id^="atualizacao-${ID}-"]`)).toHaveCount(3);
    const textos = (await atualizacoesNoBanco(ID)).map((a) => a.texto);
    expect(textos.filter((t) => t === "Clique duplo")).toHaveLength(1);
  });

  test("texto vazio não adiciona", async ({ page }) => {
    await abrirDetalhe(page);
    const form = page.locator(`#form-nova-atualizacao-${ID}`);
    await form.locator('input[placeholder="Nova atualização..."]').fill("   ");
    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.locator(`[id^="atualizacao-${ID}-"]`)).toHaveCount(2);
    expect(await atualizacoesNoBanco(ID)).toHaveLength(2);
  });

  test("edita inline: data e texto, com capitalização; persiste", async ({ page }) => {
    await abrirDetalhe(page);
    await page.locator(`#btn-edit-atualizacao-${ID}-0`).click();

    const texto = page.locator(`#input-edit-atualizacao-texto-${ID}-0`);
    await expect(texto).toBeFocused();
    await expect(texto).toHaveValue(SEMENTE[0]!.texto);
    await page.locator(`#input-edit-atualizacao-data-${ID}-0`).fill("02/09");
    await texto.fill("embarque reagendado");
    await page.locator(`#btn-save-atualizacao-${ID}-0`).click();

    await expect(item(page, ID, 0)).toContainText("Embarque reagendado");
    await expect(item(page, ID, 0)).toContainText("02/09");
    await expect(page.locator(`#form-edit-atualizacao-${ID}-0`)).toHaveCount(0);
    expect((await atualizacoesNoBanco(ID))[0]).toEqual({ data: "02/09", texto: "Embarque reagendado" });

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#processo-group-list button").filter({ hasText: "André Vitório" }).first().click();
    await page.locator(`#processo-row-${ID} > button`).click();
    await expect(item(page, ID, 0)).toContainText("Embarque reagendado");
  });

  test("a data pode ficar vazia ao editar; texto vazio não salva", async ({ page }) => {
    await abrirDetalhe(page);
    await page.locator(`#btn-edit-atualizacao-${ID}-0`).click();
    await page.locator(`#input-edit-atualizacao-data-${ID}-0`).fill("");
    await page.locator(`#btn-save-atualizacao-${ID}-0`).click();
    await expect(page.locator(`#form-edit-atualizacao-${ID}-0`)).toHaveCount(0);
    expect((await atualizacoesNoBanco(ID))[0]).toEqual({ data: "", texto: SEMENTE[0]!.texto });

    await page.locator(`#btn-edit-atualizacao-${ID}-1`).click();
    await page.locator(`#input-edit-atualizacao-texto-${ID}-1`).fill("   ");
    await page.locator(`#btn-save-atualizacao-${ID}-1`).click();
    await expect(page.locator(`#form-edit-atualizacao-${ID}-1`)).toBeVisible();
    expect((await atualizacoesNoBanco(ID))[1]).toEqual(SEMENTE[1]);
  });

  test("cancelar a edição (botão e Esc) descarta o que foi digitado", async ({ page }) => {
    await abrirDetalhe(page);

    await page.locator(`#btn-edit-atualizacao-${ID}-0`).click();
    await page.locator(`#input-edit-atualizacao-texto-${ID}-0`).fill("Descartar isto");
    await page.locator(`#btn-cancel-atualizacao-${ID}-0`).click();
    await expect(item(page, ID, 0)).toContainText(SEMENTE[0]!.texto);
    await expect(page.locator(`#btn-edit-atualizacao-${ID}-0`)).toBeFocused();

    await page.locator(`#btn-edit-atualizacao-${ID}-0`).click();
    await page.locator(`#input-edit-atualizacao-texto-${ID}-0`).fill("Descartar com Esc");
    await page.keyboard.press("Escape");
    await expect(page.locator(`#form-edit-atualizacao-${ID}-0`)).toHaveCount(0);
    await expect(item(page, ID, 0)).toContainText(SEMENTE[0]!.texto);
    expect(await atualizacoesNoBanco(ID)).toEqual(SEMENTE);
  });

  test("exclui com confirmação que mostra o texto; Cancelar mantém", async ({ page }) => {
    await abrirDetalhe(page);

    await page.locator(`#btn-delete-atualizacao-${ID}-0`).click();
    const dialogo = page.locator("#confirm-dialog-overlay");
    await expect(dialogo).toContainText(SEMENTE[0]!.texto);
    await page.locator("#btn-confirm-dialog-cancel").click();
    await expect(dialogo).toHaveCount(0);
    expect(await atualizacoesNoBanco(ID)).toEqual(SEMENTE);

    await page.locator(`#btn-delete-atualizacao-${ID}-0`).click();
    await expect(dialogo).toContainText(SEMENTE[0]!.texto);
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.locator(`[id^="atualizacao-${ID}-"]`)).toHaveCount(1);
    await expect(item(page, ID, 0)).toContainText(SEMENTE[1]!.texto);
    expect(await atualizacoesNoBanco(ID)).toEqual([SEMENTE[1]]);
  });

  test("botões são <button> reais, com aria-label e alcançáveis pelo teclado", async ({ page }) => {
    await abrirDetalhe(page);
    const editar = page.getByRole("button", { name: "Editar atualização de 01/09" });
    const excluir = page.getByRole("button", { name: "Excluir atualização de 01/09" });
    await expect(editar).toBeVisible();
    await expect(excluir).toBeVisible();
    await editar.focus();
    await page.keyboard.press("Tab");
    await expect(excluir).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(`#form-edit-atualizacao-${ID}-0`)).toBeVisible();
  });

  test("falha de salvamento mantém o texto digitado e mostra o erro; tentar de novo funciona", async ({ page }) => {
    await abrirDetalhe(page);
    const rota = `**/api/processos/${ID}`;
    await page.route(rota, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ statusMessage: "Falha forçada no teste" }),
          })
        : route.continue(),
    );

    const form = page.locator(`#form-nova-atualizacao-${ID}`);
    const campo = form.locator('input[placeholder="Nova atualização..."]');
    await form.locator('input[placeholder="Data (ex: 31/08)"]').fill("06/11");
    await campo.fill("Texto que não pode se perder");
    await form.getByRole("button", { name: "Adicionar" }).click();

    await expect(page.locator(`#atualizacoes-erro-${ID}`)).toContainText("Falha forçada no teste");
    await expect(campo).toHaveValue("Texto que não pode se perder");
    await expect(form.locator('input[placeholder="Data (ex: 31/08)"]')).toHaveValue("06/11");
    expect(await atualizacoesNoBanco(ID)).toHaveLength(2);

    await page.unroute(rota);
    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, ID, 2)).toContainText("Texto que não pode se perder");
    await expect(campo).toHaveValue("");
    await expect(page.locator(`#atualizacoes-erro-${ID}`)).toHaveCount(0);
  });

  test("falha ao editar mantém a edição aberta com o texto digitado", async ({ page }) => {
    await abrirDetalhe(page);
    await page.route(`**/api/processos/${ID}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ statusMessage: "Falha forçada" }) })
        : route.continue(),
    );
    await page.locator(`#btn-edit-atualizacao-${ID}-0`).click();
    await page.locator(`#input-edit-atualizacao-texto-${ID}-0`).fill("Edição que falha");
    await page.locator(`#btn-save-atualizacao-${ID}-0`).click();

    await expect(page.locator(`#atualizacoes-erro-${ID}`)).toContainText("Falha forçada");
    await expect(page.locator(`#input-edit-atualizacao-texto-${ID}-0`)).toHaveValue("Edição que falha");
    expect(await atualizacoesNoBanco(ID)).toEqual(SEMENTE);
  });

  test("409: outra pessoa alterou o processo — recarrega, avisa e preserva o texto digitado", async ({ page }) => {
    await abrirDetalhe(page);

    // Outra pessoa grava uma atualização (e o updated_at muda) depois que esta tela carregou.
    const deOutra = { data: "07/11", texto: "Registrada por outra pessoa." };
    const { error } = await admin()
      .from("follow_up")
      .update({ atualizacoes: [...SEMENTE, deOutra], updated_at: new Date().toISOString() })
      .eq("id", ID);
    expect(error).toBeNull();

    const form = page.locator(`#form-nova-atualizacao-${ID}`);
    const campo = form.locator('input[placeholder="Nova atualização..."]');
    await campo.fill("Minha atualização");
    await form.getByRole("button", { name: "Adicionar" }).click();

    await expect(page.locator(`#atualizacoes-erro-${ID}`)).toContainText(
      "Este processo foi alterado por outra pessoa. Recarregamos, confira e tente de novo.",
    );
    await expect(campo).toHaveValue("Minha atualização");
    // Recarregou: a atualização da outra pessoa já aparece, e a minha ainda não foi gravada.
    await expect(item(page, ID, 2)).toContainText("Registrada por outra pessoa.");
    expect(await atualizacoesNoBanco(ID)).toHaveLength(3);

    // Conferido, tenta de novo: agora com a versão certa.
    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, ID, 3)).toContainText("Minha atualização");
    expect((await atualizacoesNoBanco(ID)).map((a) => a.texto)).toEqual([
      ...SEMENTE.map((a) => a.texto),
      deOutra.texto,
      "Minha atualização",
    ]);
  });

  test("API: PATCH com atualizacoes sem versao → 400; versão velha → 409", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    const semVersao = await page.request.patch(`/api/processos/${ID}`, { data: { atualizacoes: SEMENTE } });
    expect(semVersao.status()).toBe(400);
    const velha = await page.request.patch(`/api/processos/${ID}`, {
      data: { atualizacoes: SEMENTE, versao: "2000-01-01T00:00:00.000000+00:00" },
    });
    expect(velha.status()).toBe(409);
    // Sem atualizacoes, a versão não é exigida.
    const pagamento = await page.request.patch(`/api/processos/${ID}`, { data: { statusPagamento: "pago" } });
    expect(pagamento.status()).toBe(200);
  });

  test("aba Entregues: expande, mostra as atualizações e permite adicionar, editar e excluir", async ({ page }) => {
    await abrirDetalheEntregue(page);
    await expect(item(page, ID_ENTREGUE, 0)).toContainText(SEMENTE[0]!.texto);

    // adicionar
    const form = page.locator(`#form-nova-atualizacao-${ID_ENTREGUE}`);
    await form.locator('input[placeholder="Nova atualização..."]').fill("Entregue ao paciente");
    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, ID_ENTREGUE, 2)).toContainText("Entregue ao paciente");

    // editar
    await page.locator(`#btn-edit-atualizacao-${ID_ENTREGUE}-2`).click();
    await page.locator(`#input-edit-atualizacao-texto-${ID_ENTREGUE}-2`).fill("Entregue e conferido");
    await page.locator(`#btn-save-atualizacao-${ID_ENTREGUE}-2`).click();
    await expect(item(page, ID_ENTREGUE, 2)).toContainText("Entregue e conferido");

    // excluir
    await page.locator(`#btn-delete-atualizacao-${ID_ENTREGUE}-2`).click();
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("Entregue e conferido");
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator(`[id^="atualizacao-${ID_ENTREGUE}-"]`)).toHaveCount(2);
    expect(await atualizacoesNoBanco(ID_ENTREGUE)).toEqual(SEMENTE);

    // recolher
    await page.locator(`#btn-toggle-entregue-${ID_ENTREGUE}`).click();
    await expect(page.locator(`#processo-detail-${ID_ENTREGUE}`)).toHaveCount(0);
  });
});

test.describe.serial("Atualizações do processo — consultor (somente leitura)", () => {
  test.describe.configure({ retries: 2 });
  test.skip(
    !runnable || !temConsultor,
    "defina E2E_CONSULTOR_EMAIL / _PASSWORD / _NOME (e o .env.e2e com a service role)",
  );

  test.beforeEach(async ({ page }) => {
    await semear(ID_CONSULTOR, PACIENTE_CONSULTOR, { consultor: consultor.nome });
    await semear(ID_CONSULTOR_ENTREGUE, PACIENTE_CONSULTOR_ENTREGUE, { consultor: consultor.nome, status: "entregue" });
    await login(page, consultor.email, consultor.password);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    await admin().from("follow_up").delete().ilike("paciente", `%${RUN}%`);
  });

  test("não vê Editar, Excluir nem o formulário — em andamento e em entregues", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    await page.locator(`#processo-row-${ID_CONSULTOR} > button`).click();
    const detalhe = page.locator(`#processo-detail-${ID_CONSULTOR}`);
    await expect(detalhe).toContainText(SEMENTE[0]!.texto);
    await expect(page.locator('[id^="btn-edit-atualizacao-"]')).toHaveCount(0);
    await expect(page.locator('[id^="btn-delete-atualizacao-"]')).toHaveCount(0);
    await expect(page.locator(`#form-nova-atualizacao-${ID_CONSULTOR}`)).toHaveCount(0);

    await page.locator("#tab-entregues").click();
    await page.locator(`#btn-toggle-entregue-${ID_CONSULTOR_ENTREGUE}`).click();
    await expect(page.locator(`#processo-detail-${ID_CONSULTOR_ENTREGUE}`)).toContainText(SEMENTE[0]!.texto);
    await expect(page.locator('[id^="btn-edit-atualizacao-"]')).toHaveCount(0);
    await expect(page.locator('[id^="btn-delete-atualizacao-"]')).toHaveCount(0);
    await expect(page.locator(`#form-nova-atualizacao-${ID_CONSULTOR_ENTREGUE}`)).toHaveCount(0);
  });

  test("API: consultor não consegue gravar atualizações (403)", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });
    const res = await page.request.patch(`/api/processos/${ID_CONSULTOR}`, {
      data: { atualizacoes: SEMENTE, versao: "2000-01-01T00:00:00.000000+00:00" },
    });
    expect(res.status()).toBe(403);
  });
});
