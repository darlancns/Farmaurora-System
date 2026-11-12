import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import { lerEnv } from "./_guards/supabaseEnv";
import { fixarVisaoLista } from "./_helpers/visaoProcessos";

// Item 12 — conflito de versão na EDIÇÃO do processo (pendências e medicamentos). Duas pessoas abrem o
// mesmo processo; uma grava; a outra salva e o servidor responde 409 SEM gravar. O modal fica aberto, avisa,
// preserva o que foi digitado e oferece "Recarregar dados atuais" (não existe "salvar mesmo assim").
// Roda SÓ no Supabase local (a guarda aborta fora de loopback). Os processos são semeados direto pela
// service role, com ids fixos deste spec, e removidos no fim.
//
// ATENÇÃO: escrito lendo o código (app/components/processos/ProcessoFormModal.vue, useConflitoEdicaoProcesso.ts,
// server/api/processos/[id].patch.ts); precisa do Docker/Supabase local para rodar e ainda não foi executado.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};

assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);

const RUN = String(Date.now()).slice(-9);
const ID = `proc_e2e_cf_${RUN}`;
const PACIENTE = `Paciente ${RUN} Conflito`;

const AVISO =
  "Este processo foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual e refaça sua alteração.";

function admin() {
  return createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function semear(): Promise<void> {
  const db = admin();
  await db.from("follow_up").delete().eq("id", ID);
  const agora = new Date().toISOString();
  const { error } = await db.from("follow_up").insert({
    id: ID,
    paciente: PACIENTE,
    pasta: "2026 - 951",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    status: "em_transito",
    medicamentos: [{ nome: "DROGA", dosagem: "10MG", quantidade: "2" }],
    pendencias: ["Pendência original"],
    atualizacoes: [],
    created_at: agora,
    updated_at: agora,
  });
  if (error) throw new Error(`Falha ao semear ${ID}: ${error.message}`);
}

async function linhaNoBanco(): Promise<{ pendencias: string[]; medicamentos: Array<{ nome: string }>; updated_at: string }> {
  const { data, error } = await admin()
    .from("follow_up")
    .select("pendencias, medicamentos, updated_at")
    .eq("id", ID)
    .single();
  if (error) throw new Error(error.message);
  return data as { pendencias: string[]; medicamentos: Array<{ nome: string }>; updated_at: string };
}

// "Outra pessoa" grava o processo depois que esta tela carregou: a linha ganha uma versão nova (updated_at).
async function outraPessoaGrava(extra: Record<string, unknown>): Promise<void> {
  const { error } = await admin()
    .from("follow_up")
    .update({ ...extra, updated_at: new Date(Date.now() + 60_000).toISOString() })
    .eq("id", ID);
  expect(error).toBeNull();
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

// Abre o "Editar processo" (botão do detalhe no desktop, "Editar" do rodapé abaixo de lg).
async function abrirEdicao(page: Page): Promise<void> {
  await page.goto("/processos", { waitUntil: "networkidle" });
  await page.locator("#processo-group-list button").filter({ hasText: "André Vitório" }).first().click();
  await page.locator(`#processo-row-${ID} > button`).click();
  await expect(page.locator(`#processo-detail-${ID}`)).toBeVisible();
  await page
    .locator(`#btn-edit-processo-${ID}:visible, #btn-edit-processo-footer-${ID}:visible`)
    .first()
    .click();
  await expect(page.locator("#processo-form")).toBeVisible();
}

// Campos de pendência (sem id próprio): os inputs dentro do bloco rotulado "Pendências".
const camposPendencia = (page: Page) =>
  page.locator('#processo-form p:text-is("Pendências")').locator("xpath=..").locator("input");

test.describe.serial("Conflito de versão na edição do processo", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!runnable, "defina E2E_ADMIN_EMAIL/_PASSWORD (ou E2E_OPERACIONAL_*) e o .env.e2e (Supabase local)");

  test.beforeEach(async ({ page }) => {
    await semear();
    await login(page, writer.email, writer.password);
  });

  test.afterAll(async () => {
    if (!runnable) return;
    await admin().from("follow_up").delete().ilike("paciente", `%${RUN}%`);
  });

  test("409 na pendência: avisa dentro do modal, preserva o texto, não grava; 'Recarregar dados atuais' traz a versão atual", async ({
    page,
  }) => {
    await abrirEdicao(page);

    await outraPessoaGrava({ pendencias: ["Pendência original", "Pendência do outro"] });

    await camposPendencia(page).first().fill("Minha pendência");
    await page.locator("#btn-save-processo").click();

    // O modal continua aberto, com o aviso combinado e só o botão de recarregar.
    await expect(page.locator("#processo-conflito-aviso")).toBeVisible();
    await expect(page.locator("#processo-conflito-texto")).toHaveText(AVISO);
    await expect(page.locator("#processo-conflito-aviso button")).toHaveCount(1);
    await expect(page.locator("#btn-recarregar-processo")).toHaveText("Recarregar dados atuais");
    await expect(page.locator("#processo-form")).toBeVisible();
    // O que foi digitado continua no campo, e NADA foi gravado (a lista é a da outra pessoa).
    await expect(camposPendencia(page).first()).toHaveValue("Minha pendência");
    expect((await linhaNoBanco()).pendencias).toEqual(["Pendência original", "Pendência do outro"]);

    // Recarregar: sem confirmação, o formulário passa a mostrar a versão atual e o aviso some.
    await page.locator("#btn-recarregar-processo").click();
    await expect(page.locator("#processo-conflito-aviso")).toHaveCount(0);
    await expect(camposPendencia(page)).toHaveCount(2);
    await expect(camposPendencia(page).nth(0)).toHaveValue("Pendência original");
    await expect(camposPendencia(page).nth(1)).toHaveValue("Pendência do outro");

    // Refaz a alteração sobre a versão atual: agora grava (a versão nova foi adotada).
    await page.locator("#btn-add-pendencia").click();
    await camposPendencia(page).nth(2).fill("Refeita");
    await page.locator("#btn-save-processo").click();
    await expect(page.locator("#processo-form")).toHaveCount(0);
    await expect(page.locator("#toast-notice")).toHaveText("Processo atualizado");
    expect((await linhaNoBanco()).pendencias).toEqual(["Pendência original", "Pendência do outro", "Refeita"]);
  });

  test("sem conflito: salvar uma pendência grava e fecha o modal", async ({ page }) => {
    await abrirEdicao(page);
    await camposPendencia(page).first().fill("Pendência editada");
    await page.locator("#btn-save-processo").click();

    await expect(page.locator("#processo-form")).toHaveCount(0);
    await expect(page.locator("#toast-notice")).toHaveText("Processo atualizado");
    expect((await linhaNoBanco()).pendencias).toEqual(["Pendência editada"]);
  });

  test("alterar só um campo simples NÃO depende da versão: grava mesmo se outra pessoa gravou antes", async ({ page }) => {
    await abrirEdicao(page);
    await outraPessoaGrava({ pendencias: ["Pendência original", "Pendência do outro"] });

    await page.locator("#pf-local-entrega").fill("Clínica nova");
    await page.locator("#btn-save-processo").click();

    await expect(page.locator("#processo-form")).toHaveCount(0);
    await expect(page.locator("#processo-conflito-aviso")).toHaveCount(0);
    const { data } = await admin().from("follow_up").select("local_entrega").eq("id", ID).single();
    expect(data?.local_entrega).toBe("Clínica nova");
    // e a lista da outra pessoa segue intacta
    expect((await linhaNoBanco()).pendencias).toEqual(["Pendência original", "Pendência do outro"]);
  });

  test("409 no medicamento: mesmo aviso, nada gravado", async ({ page }) => {
    await abrirEdicao(page);
    await outraPessoaGrava({ medicamentos: [{ nome: "DO OUTRO" }] });

    await page.locator("#pf-medicamento-nome-0").fill("minha droga");
    await page.locator("#btn-save-processo").click();

    await expect(page.locator("#processo-conflito-aviso")).toBeVisible();
    await expect(page.locator("#pf-medicamento-nome-0")).toHaveValue("MINHA DROGA");
    expect((await linhaNoBanco()).medicamentos).toEqual([{ nome: "DO OUTRO" }]);
  });

  test("API: pendências/medicamentos sem versão → 400; versão velha → 409; sem listas → 200", async ({ page }) => {
    await page.goto("/processos", { waitUntil: "networkidle" });

    const semVersao = await page.request.patch(`/api/processos/${ID}`, { data: { pendencias: ["x"], parcial: true } });
    expect(semVersao.status()).toBe(400);
    expect(await semVersao.text()).toContain("Atualize a página (Ctrl+Shift+R) e tente de novo.");
    const medSemVersao = await page.request.patch(`/api/processos/${ID}`, { data: { medicamentos: [], parcial: true } });
    expect(medSemVersao.status()).toBe(400);

    const velha = await page.request.patch(`/api/processos/${ID}`, {
      data: { pendencias: ["x"], parcial: true, versao: "2000-01-01T00:00:00.000000+00:00" },
    });
    expect(velha.status()).toBe(409);
    expect((await linhaNoBanco()).pendencias).toEqual(["Pendência original"]);

    // Sem listas, a versão não é exigida.
    const simples = await page.request.patch(`/api/processos/${ID}`, {
      data: { localEntrega: "Outro lugar", parcial: true },
    });
    expect(simples.status()).toBe(200);
  });
});
