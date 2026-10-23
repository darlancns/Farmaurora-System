import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import PizZip from "pizzip";

// Prestação — primeiro e2e do módulo (Round 9-e2e). Cobre criar paciente, o
// diálogo de confirmação ao reduzir Remessas (Round 9-fix), staging de anexo e
// submit completo (modo "completo" de getRequiredSlots). O formulário abre num
// modal pelo botão "+ Nova prestação" (ou pelo lápis de cada card) e os anexos
// ficam numa seção expansível DENTRO dele (AttachmentsPanel).
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

// Aborta (antes de qualquer escrita) se o Supabase em uso não for o local do harness.
assertSupabaseLocal();
const env = lerEnv();
const runnable = Boolean(writer.email && writer.password && env.url && env.serviceKey);

const RUN = String(Date.now()).slice(-9);
const P1 = `Paciente ${RUN} Criacao`;
const P3 = `Paciente ${RUN} Anexo`;
const P4 = `Paciente ${RUN} Completo`;
const P5 = `Paciente ${RUN} Word`;

// IDs de paciente criados durante a suíte.
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

// Container do slot dentro do AttachmentsPanel, localizado pelo texto do rótulo.
function slotContainer(page: Page, label: string): Locator {
  return page
    .locator("#attachments-panel > div")
    .filter({ has: page.getByText(label, { exact: true }) });
}

// "+ Nova prestação" abre o formulário num modal (desktop; abaixo de lg é o FAB).
async function abrirFormNovo(page: Page): Promise<void> {
  await page.locator("#btn-nova-prestacao").click();
  await expect(page.locator("#patient-form")).toBeVisible();
}

async function expandirAnexos(page: Page): Promise<void> {
  await page.locator("#btn-open-attachments").click();
  await expect(page.locator("#attachments-panel")).toBeVisible();
}

// PNG aleatório (não comprime) acima de 5MB, gerado no browser.
async function pasteImagemGrande(target: Locator): Promise<number> {
  return target.evaluate(async (el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 65536) {
      crypto.getRandomValues(img.data.subarray(i, Math.min(i + 65536, img.data.length)));
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], "grande.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
    return blob.size;
  });
}

// Lê o anexo de um slot direto do Storage (signed URL de leitura gerada pelo servidor,
// como o preview e o Word fazem). null se o slot não tem arquivo.
async function baixarAnexo(page: Page, patientId: string, slotKey: string): Promise<Buffer | null> {
  const resposta = await page.request.get(`/api/attachments/signed-urls?patientId=${patientId}&slots=${slotKey}`);
  expect(resposta.ok()).toBe(true);
  const { urls } = (await resposta.json()) as { urls: Record<string, string> };
  const url = urls[slotKey];
  if (!url) return null;
  const arquivo = await page.request.get(url);
  return arquivo.ok() ? await arquivo.body() : null;
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

  // Apaga toda linha (e a pasta de anexos correspondente no Storage) cujo `paciente`
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
      const { data: arquivos } = await db.storage.from("attachments").list(row.id, { limit: 1000 });
      const caminhos = (arquivos ?? []).map((arquivo) => `${row.id}/${arquivo.name}`);
      if (caminhos.length > 0) await db.storage.from("attachments").remove(caminhos);
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
    await purgarRun();
  });

  test("0 · formulário começa fechado, a lista ocupa a largura toda e o botão abre/fecha o modal", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await expect(page.locator("#patient-form")).toHaveCount(0);
    await expect(page.locator("#btn-nova-prestacao")).toBeVisible();
    await expect(page.locator("#btn-nova-prestacao")).toHaveText("+ Nova prestação");

    // Sem coluna lateral: a busca (topo da lista) ocupa quase toda a largura útil do conteúdo.
    const search = await page.locator("#patient-search").boundingBox();
    const viewport = page.viewportSize()!;
    expect(search!.width).toBeGreaterThan(viewport.width * 0.5);

    await abrirFormNovo(page);
    await expect(page.locator("#btn-add-patient")).toHaveText("+ Adicionar prestação");
    await page.locator("#btn-close-patient-form").click();
    await expect(page.locator("#patient-form")).toHaveCount(0);

    await abrirFormNovo(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#patient-form")).toHaveCount(0);
  });

  test("1 · cria um paciente novo e a tabela mostra os valores calculados", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await abrirFormNovo(page);

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
    await expect(page.locator("#toast-notice")).toContainText("Prestação adicionada");
    await expect(page.locator("#patient-form")).toHaveCount(0);

    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P1 });
    await expect(row).toBeVisible();
    await expect(row).toContainText("R$400,00"); // nota
    await expect(row).toContainText("R$64,00"); // imposto

    await capturarIdDaLinha(page, P1);
  });

  test("2 · diálogo de confirmação ao reduzir Remessas (cancelar preserva, confirmar aplica)", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await abrirFormNovo(page);

    await page.locator("#f-remessas").fill("3");
    await expect(page.locator("#f-despesa-2")).toBeVisible();
    await page.locator("#f-despesa-2").fill("50000");
    await expect(page.locator("#f-despesa-2")).toHaveValue("500,00");

    // Reduzir pra 2 tem dado a perder na remessa 3 → diálogo deve aparecer.
    await page.locator("#f-remessas").fill("2");
    await expect(page.locator("#confirm-dialog-overlay")).toBeVisible();
    await expect(page.locator("#confirm-dialog-overlay")).toContainText("3");

    // Cancelar: campo volta pra 3, dado da remessa 3 continua lá.
    // Esc fecha só o diálogo (não o formulário por baixo).
    await page.keyboard.press("Escape");
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    await expect(page.locator("#patient-form")).toBeVisible();
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
    await abrirFormNovo(page);

    await page.locator("#f-paciente").fill(P3);
    await selectOption(page, "f-consultor", "Vinícius Alves");
    await page.locator("#f-qtd-0").fill("1");
    await page.locator("#f-medicamento-0").fill("Paracetamol");
    await page.locator("#f-alvara").fill("100000");
    await page.locator("#f-custo").fill("10000");

    await expect(page.locator("#attachments-panel")).toHaveCount(0);
    await expandirAnexos(page);

    // Stage sem patientId (paciente ainda não existe) — o painel cai no branch
    // `emit("stage", ...)` de AttachmentsPanel.vue.
    const slot = slotContainer(page, "Nota de Prestação de Serviço");
    await pasteImagem(slot.locator('[tabindex="0"]'));
    await expect(slot.locator("img")).toBeVisible();

    // Recolher a seção mantém o anexo em staging e o contador.
    await page.locator("#btn-open-attachments").click();
    await expect(page.locator("#attachments-panel")).toHaveCount(0);
    await expect(page.locator("#btn-open-attachments")).toContainText("1/");

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Prestação adicionada com anexos");
    await expect(page.locator("#patient-form")).toHaveCount(0);

    const id = await capturarIdDaLinha(page, P3);

    // Persistido de verdade no Storage.
    expect((await baixarAnexo(page, id, "servico"))?.length).toBeGreaterThan(0);

    // Visível ao reabrir o registro (edição carrega attachedSlots do paciente).
    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P3 });
    await row.locator(`#btn-edit-patient-${id}`).click();
    await expect(page.locator("#patient-form")).toBeVisible();
    await expect(page.locator("#f-paciente")).toHaveValue(P3);
    await expandirAnexos(page);
    const slotReaberto = slotContainer(page, "Nota de Prestação de Serviço");
    await expect(slotReaberto.locator("img")).toBeVisible();

    // Fechar a edição fecha o modal.
    await page.locator("#btn-close-patient-form").click();
    await expect(page.locator("#patient-form")).toHaveCount(0);
  });

  test("4 · submit completo com despesa e transporte exige os anexos certos (inclui remessa fora de ordem)", async ({
    page,
  }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await abrirFormNovo(page);

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

    await expandirAnexos(page);

    // Modo completo (despesaTotal > 0): invoice/câmbio por remessa...
    await expect(slotContainer(page, "Invoice (remessa 1)")).toBeVisible();
    await expect(slotContainer(page, "Invoice (remessa 2)")).toBeVisible();
    await expect(slotContainer(page, "Contrato de Câmbio (remessa 1)")).toBeVisible();
    await expect(slotContainer(page, "Contrato de Câmbio (remessa 2)")).toBeVisible();
    // ...e exatamente 1 slot de Despachante (countFilled conta a posição
    // preenchida mesmo estando "fora de ordem" — despachanteRemessas = 1),
    // rotulado como remessa 1 independente de qual posição tinha o valor.
    await expect(slotContainer(page, "Despachante (remessa 1)")).toBeVisible();
    await expect(page.locator("#attachments-panel")).not.toContainText("Despachante (remessa 2)");
    // Nenhum slot de Transporte (transporteTotal = 0) nem "dsi" (exige os dois > 0).
    await expect(page.locator("#attachments-panel")).not.toContainText("Transporte (remessa");
    await expect(page.locator("#attachments-panel")).not.toContainText("DSI");
    await expect(slotContainer(page, "Nota de Prestação de Serviço")).toBeVisible();

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Prestação adicionada");

    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P4 });
    await expect(row).toContainText("R$100,00"); // Despachante (despesaTotal)
    await expect(row).toContainText("R$0,00"); // Transporte (transporteTotal)

    await capturarIdDaLinha(page, P4);
  });

  test("5 · edita pelo lápis, anexa no formulário inline, persiste e o Word leva as imagens", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    await abrirFormNovo(page);

    await page.locator("#f-paciente").fill(P5);
    await selectOption(page, "f-consultor", "Vinícius Alves");
    await page.locator("#f-qtd-0").fill("2");
    await page.locator("#f-medicamento-0").fill("Keytruda");
    await page.locator("#f-alvara").fill("300000");
    await page.locator("#f-custo").fill("100000");
    await page.locator("#f-despesa-0").fill("10000");
    await page.locator("#f-transporte-0").fill("5000");

    await expandirAnexos(page);
    // Captions do slot de Invoice (medicamentos) e de Câmbio (custo).
    await expect(slotContainer(page, "Invoice (remessa 1)")).toContainText("2 KEYTRUDA");
    await expect(slotContainer(page, "Contrato de Câmbio (remessa 1)")).toContainText("R$ 1.000,00");

    const labels = [
      "Invoice (remessa 1)",
      "Contrato de Câmbio (remessa 1)",
      "Despachante (remessa 1)",
      "Transporte (remessa 1)",
      "DSI",
      "Nota de Prestação de Serviço",
    ];
    for (const label of labels) {
      await pasteImagem(slotContainer(page, label).locator('[tabindex="0"]'));
      await expect(slotContainer(page, label).locator("img")).toBeVisible();
    }
    await expect(page.locator("#btn-open-attachments")).toContainText("6/6");

    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Prestação adicionada com anexos");
    const id = await capturarIdDaLinha(page, P5);
    for (const key of ["invoice_1", "cambio_1", "despachante_1", "transporte_1", "dsi", "servico"]) {
      expect((await baixarAnexo(page, id, key))?.length, key).toBeGreaterThan(0);
    }

    // Reabre pelo lápis: formulário preenchido, anexos persistidos (6/6), mudar remessas atualiza os slots.
    await page.locator(`#btn-edit-patient-${id}`).click();
    await expect(page.locator("#f-paciente")).toHaveValue(P5);
    await expect(page.locator("#btn-open-attachments")).toContainText("6/6");
    await expandirAnexos(page);
    await expect(slotContainer(page, "Invoice (remessa 1)").locator("img")).toBeVisible();
    await page.locator("#f-remessas").fill("2");
    await expect(slotContainer(page, "Invoice (remessa 2)")).toBeVisible();
    await expect(page.locator("#btn-open-attachments")).toContainText("6/8");
    await page.locator("#f-remessas").fill("1");
    await expect(page.locator("#btn-open-attachments")).toContainText("6/6");

    // Salvar fecha o formulário.
    await page.locator("#btn-add-patient").click();
    await expect(page.locator("#toast-notice")).toContainText("Prestação atualizada");
    await expect(page.locator("#patient-form")).toHaveCount(0);

    // Word: as 6 imagens anexadas entram no .docx (nenhuma cai no placeholder).
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(`#btn-generate-word-${id}`).click(),
    ]);
    const zip = new PizZip(readFileSync(await download.path()));
    const png = (await baixarAnexo(page, id, "servico"))!;
    const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n]!.dir);
    const comAnexo = media.filter((n) => Buffer.compare(Buffer.from(zip.file(n)!.asUint8Array()), png) === 0);
    expect(comAnexo.length).toBe(6);
  });

  test("6 · imagem grande (>5MB) sobe direto ao Storage e fica salva", async ({ page }) => {
    await page.goto("/prestacao", { waitUntil: "networkidle" });
    const row = page.locator('[id^="patient-row-"]').filter({ hasText: P5 });
    await row.locator('[id^="btn-edit-patient-"]').click();
    await expandirAnexos(page);

    // Troca o anexo de Invoice por uma imagem grande: remove e cola a nova.
    const slot = slotContainer(page, "Invoice (remessa 1)");
    await slot.getByRole("button", { name: "Remover" }).click();
    await expect(page.locator("#toast-notice")).toContainText("Anexo removido");
    const tamanho = await pasteImagemGrande(slot.locator('[tabindex="0"]'));
    expect(tamanho).toBeGreaterThan(5 * 1024 * 1024);

    await expect(page.locator("#toast-notice")).toContainText("Anexo salvo", { timeout: 60000 });
    await expect(slot.locator("img")).toBeVisible();

    const id = (await row.getAttribute("id"))!.replace(/^patient-row-/, "");
    expect((await baixarAnexo(page, id, "invoice_1"))!.length).toBe(tamanho);
  });
});
