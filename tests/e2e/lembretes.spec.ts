import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Aba "Meus" de /recados (Fase D2) — lembretes pessoais: sempre privados ao
// dono, sem destinatário. Cria 2 contas de teste (A cria os lembretes, B só
// serve pra provar isolamento) e cobre criar/editar/excluir, fixar
// persistente, concluir definitivo (some da lista, mesmo padrão de Recado —
// ajuste da Fase D2) e o filtro de chip de tipo reaproveitado dentro da aba.

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
const runnable = Boolean(env.url && env.serviceKey);
const RUN = Date.now().toString(36);
const SENHA = `LembretesE2e${RUN}!aB`;

interface ContaTeste {
  id: string;
  email: string;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

async function irParaAbaMeus(page: Page): Promise<void> {
  await page.goto("/recados", { waitUntil: "networkidle" });
  await page.locator("#tab-meus").click();
}

test.describe.serial("Recados → aba Meus (lembretes pessoais)", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!runnable, "defina o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY");

  const db = runnable
    ? createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  let contaA: ContaTeste;
  let contaB: ContaTeste;

  let idUrgente = "";
  let idAtencao = "";

  const TITULO_URGENTE = `RUN${RUN} Lembrete urgente`;
  const TITULO_ATENCAO = `RUN${RUN} Lembrete atenção`;

  test.beforeAll(async () => {
    if (!db) return;
    async function criarConta(key: string): Promise<ContaTeste> {
      const email = `e2e-lembretes-${key}-${RUN}@teste.local`;
      const { data, error } = await db!.auth.admin.createUser({
        email,
        password: SENHA,
        email_confirm: true,
        app_metadata: { role: "operacional", nome: `RUN Lembretes ${key}` },
      });
      if (error) throw new Error(`Falha ao criar conta ${key}: ${error.message}`);
      return { id: data.user.id, email };
    }
    contaA = await criarConta("a");
    contaB = await criarConta("b");
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.from("lembretes_pessoais").delete().like("titulo", `RUN${RUN}%`);
    for (const conta of [contaA, contaB]) {
      if (conta?.id) await db.auth.admin.deleteUser(conta.id);
    }
  });

  test("1 · cria lembrete — nunca aparece pra outra conta, nem via API direta", async ({ page }) => {
    await login(page, contaA.email, SENHA);
    await irParaAbaMeus(page);

    await expect(page.locator("#btn-novo-recado")).toHaveText("+ Novo lembrete");
    await page.locator("#btn-novo-recado").click();
    await page.locator("#lembrete-titulo").fill(TITULO_URGENTE);
    await page.locator("#lembrete-mensagem").fill("Mensagem de teste do lembrete urgente.");
    await selectOption(page, "lembrete-tipo", "Urgente");
    await page.locator("#btn-lembrete-salvar").click();
    await expect(page.getByText(TITULO_URGENTE, { exact: false }).first()).toBeVisible();

    const listaA = (await (await page.request.get("/api/lembretes")).json()) as Array<{ id: string; titulo: string }>;
    idUrgente = listaA.find((l) => l.titulo === TITULO_URGENTE)?.id ?? "";
    expect(idUrgente).toBeTruthy();

    // Conta B: nem na UI, nem na API direta.
    await login(page, contaB.email, SENHA);
    await irParaAbaMeus(page);
    await expect(page.locator(`#lembrete-card-${idUrgente}`)).toHaveCount(0);

    const listaB = (await (await page.request.get("/api/lembretes")).json()) as Array<{ id: string }>;
    expect(listaB.some((l) => l.id === idUrgente)).toBe(false);
  });

  test("2 · editar reflete na lista", async ({ page }) => {
    const TITULO_EDITADO = `${TITULO_URGENTE} (editado)`;

    await login(page, contaA.email, SENHA);
    await irParaAbaMeus(page);

    await page.locator(`#btn-editar-lembrete-${idUrgente}`).click();
    await expect(page.locator("#lembrete-titulo")).toHaveValue(TITULO_URGENTE);
    await page.locator("#lembrete-titulo").fill(TITULO_EDITADO);
    await page.locator("#btn-lembrete-salvar").click();
    await expect(page.locator(`#lembrete-card-${idUrgente}`)).toContainText(TITULO_EDITADO);
  });

  test("3 · fixar/desfixar persiste após reload", async ({ page }) => {
    await login(page, contaA.email, SENHA);
    await irParaAbaMeus(page);

    const btnFixar = page.locator(`#btn-fixar-lembrete-${idUrgente}`);
    await expect(btnFixar).toHaveAttribute("title", "Fixar");
    await btnFixar.click();
    await expect(btnFixar).toHaveAttribute("title", "Desfixar");

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-meus").click();
    await expect(page.locator(`#btn-fixar-lembrete-${idUrgente}`)).toHaveAttribute("title", "Desfixar");

    await page.locator(`#btn-fixar-lembrete-${idUrgente}`).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-meus").click();
    await expect(page.locator(`#btn-fixar-lembrete-${idUrgente}`)).toHaveAttribute("title", "Fixar");
  });

  test("5 · concluir é definitivo — some da lista e não volta após reload", async ({ page }) => {
    await login(page, contaA.email, SENHA);
    await irParaAbaMeus(page);

    await page.locator(`#btn-concluir-lembrete-${idUrgente}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator(`#lembrete-card-${idUrgente}`)).toHaveCount(0, { timeout: 10000 });

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#tab-meus").click();
    await expect(page.locator(`#lembrete-card-${idUrgente}`)).toHaveCount(0);
  });

  test("6 · excluir some da lista", async ({ page }) => {
    await login(page, contaA.email, SENHA);
    await irParaAbaMeus(page);

    // 2º lembrete, só pra ter algo dedicado pra excluir sem mexer no idUrgente
    // usado pelos outros testes.
    await page.locator("#btn-novo-recado").click();
    await page.locator("#lembrete-titulo").fill(TITULO_ATENCAO);
    await page.locator("#lembrete-mensagem").fill("Mensagem de teste do lembrete de atenção.");
    await selectOption(page, "lembrete-tipo", "Atenção");
    await page.locator("#btn-lembrete-salvar").click();
    // Espera a UI confirmar a criação (modal fechado + item na lista) antes
    // de consultar a API — sem isso, a chamada abaixo pode correr antes do
    // POST disparado pelo clique terminar (mesma sincronização de test 1).
    await expect(page.getByText(TITULO_ATENCAO, { exact: false }).first()).toBeVisible();

    const lista = (await (await page.request.get("/api/lembretes")).json()) as Array<{ id: string; titulo: string }>;
    idAtencao = lista.find((l) => l.titulo === TITULO_ATENCAO)?.id ?? "";
    expect(idAtencao).toBeTruthy();
    await irParaAbaMeus(page);

    await page.locator(`#btn-excluir-lembrete-${idAtencao}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator(`#lembrete-card-${idAtencao}`)).toHaveCount(0);
  });
});
