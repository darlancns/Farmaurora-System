import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Prestação — primeiro e2e do módulo (Round 9-e2e). Cobre criar paciente, o
// diálogo de confirmação ao reduzir Remessas (Round 9-fix), staging de anexo e
// submit completo (modo "completo" de getRequiredSlots).
//
// Prestação só existe pra empresa FARMAURORA (hardcoded em PatientForm.vue) —
// não há o truque de isolamento por MAINZFARMA usado em Pagamentos. O paciente
// de teste é identificado por um RUN numérico embutido no nome (sobrevive ao
// toTitleCaseName porque dígitos não são recapitalizados — mesmo padrão de
// processos.spec.ts; evitamos siglas tipo "E2E" no nome porque
// toTitleCaseName lowercase-primeiro faria "E2E" virar "E2e").
//
// IMPORTANTE (achado da investigação): WRITE_ACCESS.patients em
// shared/utils/rbac.ts é SÓ ["administrador"] — diferente de Processos/
// Pagamentos, que também liberam "operacional". Por isso este spec usa só
// E2E_ADMIN_EMAIL/PASSWORD, sem fallback pra operacional.
const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
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

const RUN = String(Date.now()).slice(-9);
const P1 = `Paciente ${RUN} Criacao`;
const P3 = `Paciente ${RUN} Anexo`;
const P4 = `Paciente ${RUN} Completo`;

// IDs de paciente criados durante a suíte — usados no afterAll pra apagar
// tanto a linha em prestacao_pacientes quanto os arquivos de anexo em disco.
const criadosIds: string[] = [];

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

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

// Captura o id do paciente recém-criado a partir do atributo id da linha
// (patient-row-<id>) — evita depender de consulta ao Supabase só pra achar o id.
async function capturarIdDaLinha(page: Page, nomePaciente: string): Promise<string> {
  const row = page.locator('[id^="patient-row-"]').filter({ hasText: nomePaciente });
  await expect(row).toBeVisible();
  const domId = await row.getAttribute("id");
  const id = domId!.replace(/^patient-row-/, "");
  criadosIds.push(id);
  return id;
}

// 1x1 PNG transparente, só pra ter bytes de imagem válidos pro paste.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Simula colar uma imagem (Ctrl+V) no slot de anexo — o único jeito de anexar
// nesta tela é @paste (não existe <input type="file">), então construímos um
// ClipboardEvent com um File real e disparamos no elemento certo.
async function pasteImagem(target: Locator): Promise<void> {
  await target.evaluate((el, base64) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "print.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer });
    el.dispatchEvent(event);
  }, PNG_BASE64);
}

// Container do slot dentro do AttachmentsModal, localizado pelo texto do rótulo.
function slotContainer(page: Page, label: string): Locator {
  return page
    .locator("#attachments-modal-overlay .grid > div")
    .filter({ has: page.getByText(label, { exact: true }) });
}

function attachmentDir(patientId: string): string {
  return join(process.cwd(), "public", "uploads", "attachments", patientId);
}

test.describe.serial("Prestação de Contas", () => {
  // O dev server + Vite às vezes derruba o worker do Playwright no meio de uma
  // suíte longa (crash nativo, sem relação com as asserções) — ver mesma nota
  // em pagamentos-fluxo.spec.ts. Uma re-execução limpa recupera.
  test.describe.configure({ retries: 2 });

  test.skip(
    !runnable,
    "defina E2E_ADMIN_EMAIL/_PASSWORD e o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY",
  );

  // Apaga toda linha (e o diretório de anexos correspondente) cujo `paciente`
  // contenha o RUN desta execução. Usado tanto no beforeAll (auto-cura: uma
  // tentativa anterior que crashou no meio, sem rodar o afterAll, deixaria
  // paciente(s) com o MESMO nome — já que RUN é fixo por processo — o que
  // quebraria os locators por texto na próxima tentativa) quanto no afterAll.
  async function purgarRun(): Promise<void> {
    if (!runnable) return;
    const db = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await db.from("prestacao_pacientes").select("id").ilike("paciente", `%${RUN}%`);
    for (const row of (data ?? []) as Array<{ id: string }>) {
      const dir = attachmentDir(row.id);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    await db.from("prestacao_pacientes").delete().ilike("paciente", `%${RUN}%`);
  }

  test.beforeAll(async () => {
    await purgarRun();
    criadosIds.length = 0;
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterAll(async () => {
    try {
      await purgarRun();
    } finally {
      for (const id of criadosIds) {
        const dir = attachmentDir(id);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test("1 · cria um paciente novo e a tabela mostra os valores calculados", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await page.locator("#f-data").fill("1009");
    // maskDateDdMm (Patient) completa o ano corrente quando chega a 4 dígitos —
    // diferente da máscara de Processo, que fica só "DD/MM" (ver Round 1b).
    await expect(page.locator("#f-data")).toHaveValue(/^10\/09\/\d{4}$/);

    await page.locator("#f-paciente").fill(P1);
    await selectOption(page, "f-consultor", "André Vitório");

    await page.locator("#f-qtd-0").fill("2");
    await page.locator("#f-medicamento-0").fill("Dipirona");

    // alvara = 1.000,00 ; custoImportacao = 600,00 → (600/1000)=0.6, NÃO é
    // nota cheia → valorNota = 1000-600 = 400 ; imposto = 400*0.16 = 64.
    await page.locator("#f-alvara").fill("100000");
    await expect(page.locator("#f-alvara")).toHaveValue("1.000,00");
    await page.locator("#f-custo").fill("60000");
    await expect(page.locator("#f-custo")).toHaveValue("600,00");

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Lançamento adicionado");

    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P1 });
    await expect(row).toBeVisible();
    await expect(row).toContainText("R$400,00"); // nota
    await expect(row).toContainText("R$64,00"); // imposto

    await capturarIdDaLinha(page, P1);
  });

  test("2 · diálogo de confirmação ao reduzir Remessas (cancelar preserva, confirmar aplica)", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await page.locator("#f-remessas").fill("3");
    await expect(page.locator("#f-despesa-2")).toBeVisible();
    await page.locator("#f-despesa-2").fill("50000");
    await expect(page.locator("#f-despesa-2")).toHaveValue("500,00");

    // Reduzir pra 2 tem dado a perder na remessa 3 → diálogo deve aparecer.
    await page.locator("#f-remessas").fill("2");
    await expect(page.locator("#confirm-dialog-overlay")).toBeVisible();
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("3");

    // Cancelar: campo volta pra 3, dado da remessa 3 continua lá.
    await page.locator("#btn-confirm-dialog-cancel").click();
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    await expect(page.locator("#f-remessas")).toHaveValue("3");
    await expect(page.locator("#f-despesa-2")).toBeVisible();
    await expect(page.locator("#f-despesa-2")).toHaveValue("500,00");

    // Reduzir de novo e confirmar: a remessa 3 some de fato.
    await page.locator("#f-remessas").fill("2");
    await expect(page.locator("#confirm-dialog-overlay")).toBeVisible();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    await expect(page.locator("#f-remessas")).toHaveValue("2");
    await expect(page.locator("#f-despesa-2")).toHaveCount(0);

    // Reduzir sem dado preenchido não pede confirmação.
    await page.locator("#f-remessas").fill("1");
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
  });

  test("3 · staging de anexo antes do submit é persistido e sobrevive a reabrir o registro", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await page.locator("#f-paciente").fill(P3);
    await selectOption(page, "f-consultor", "Vinícius Alves");
    await page.locator("#f-qtd-0").fill("1");
    await page.locator("#f-medicamento-0").fill("Paracetamol");
    await page.locator("#f-alvara").fill("100000");
    await page.locator("#f-custo").fill("10000");

    await page.locator("#btn-open-attachments").click();
    await expect(page.locator("#attachments-modal-overlay")).toBeVisible();

    // Stage sem patientId (paciente ainda não existe) — o modal cai no branch
    // `emit("stage", ...)` de AttachmentsModal.vue.
    const slot = slotContainer(page, "Nota de Prestação de Serviço");
    await pasteImagem(slot.locator('[tabindex="0"]'));
    await expect(slot.locator("img")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#attachments-modal-overlay")).toHaveCount(0);
    await expect(page.locator("#btn-open-attachments")).toContainText("1/");

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Lançamento adicionado com anexos");

    const id = await capturarIdDaLinha(page, P3);

    // Persistido em disco de verdade.
    expect(existsSync(join(attachmentDir(id), "servico.png"))).toBe(true);

    // Visível ao reabrir o registro (edição carrega attachedSlots do paciente).
    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P3 });
    await row.locator(`#btn-edit-patient-${id}`).click();
    await page.locator("#btn-open-attachments").click();
    await expect(page.locator("#attachments-modal-overlay")).toBeVisible();
    const slotReaberto = slotContainer(page, "Nota de Prestação de Serviço");
    await expect(slotReaberto.locator("img")).toBeVisible();
  });

  test("4 · submit completo com despesa e transporte exige os anexos certos (inclui remessa fora de ordem)", async ({
    page,
  }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await page.locator("#f-paciente").fill(P4);
    await selectOption(page, "f-consultor", "Gabriela Megda");
    await page.locator("#f-qtd-0").fill("3");
    await page.locator("#f-medicamento-0").fill("Enhertu");
    await page.locator("#f-alvara").fill("200000"); // 2.000,00
    await page.locator("#f-custo").fill("20000"); // 200,00

    await page.locator("#f-remessas").fill("2");
    // Fora de ordem: remessa 1 (index 0) fica vazia, só a remessa 2 (index 1)
    // recebe despesa — achado 2 da Round 9-prep, corrigido na Round 9-fix.
    await expect(page.locator("#f-despesa-0")).toHaveValue("");
    await page.locator("#f-despesa-1").fill("10000"); // 100,00 na remessa 2

    await page.locator("#btn-open-attachments").click();
    await expect(page.locator("#attachments-modal-overlay")).toBeVisible();

    // Modo completo (despesaTotal > 0): invoice/câmbio por remessa...
    await expect(slotContainer(page, "Invoice (remessa 1)")).toBeVisible();
    await expect(slotContainer(page, "Invoice (remessa 2)")).toBeVisible();
    await expect(slotContainer(page, "Contrato de Câmbio (remessa 1)")).toBeVisible();
    await expect(slotContainer(page, "Contrato de Câmbio (remessa 2)")).toBeVisible();
    // ...e exatamente 1 slot de Despachante (countFilled conta a posição
    // preenchida mesmo estando "fora de ordem" — despachanteRemessas = 1),
    // rotulado como remessa 1 independente de qual posição tinha o valor.
    await expect(slotContainer(page, "Despachante (remessa 1)")).toBeVisible();
    await expect(page.locator("#attachments-modal-overlay")).not.toContainText("Despachante (remessa 2)");
    // Nenhum slot de Transporte (transporteTotal = 0) nem "dsi" (exige os dois > 0).
    await expect(page.locator("#attachments-modal-overlay")).not.toContainText("Transporte (remessa");
    await expect(page.locator("#attachments-modal-overlay")).not.toContainText("DSI");
    await expect(slotContainer(page, "Nota de Prestação de Serviço")).toBeVisible();

    await page.keyboard.press("Escape");

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Lançamento adicionado");

    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P4 });
    await expect(row).toContainText("R$100,00"); // Despachante (despesaTotal)
    await expect(row).toContainText("R$0,00"); // Transporte (transporteTotal)

    await capturarIdDaLinha(page, P4);
  });
});
