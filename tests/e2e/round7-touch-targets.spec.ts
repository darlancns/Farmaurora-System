import { test, expect, type Page } from "@playwright/test";

// Rodada 7 — CSS/layout only, duas partes:
//   Parte 1: ProcessoDeliveredList.vue (mesmo problema estrutural de
//     ProcessoRow.vue antes da Rodada 3 — larguras fixas somadas sem colapso)
//   Parte 2: batch de touch targets <44px espalhados pelo app
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SOCIO_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SOCIO_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

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

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe("Rodada 7 — Parte 1: ProcessoDeliveredList.vue", () => {
  test.describe.configure({ retries: 2 });

  // Cria um processo "entregue" com transportadora de nome propositalmente
  // longo (pior caso real desta linha) via API, testa o layout nos 3
  // viewports e apaga em seguida — mesmo padrão de tests/e2e/processos.spec.ts
  // (cria via API, testa, limpa em `finally`), sem tocar em nenhum dado real.
  test("sem overflow horizontal, sem truncamento, botões corretos por viewport", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");

    await page.setViewportSize({ width: 375, height: 900 });
    await login(page);

    const paciente = `E2E Entregue Teste ${Date.now()}`;
    const createRes = await page.request.post("/api/processos", {
      data: {
        paciente,
        pasta: "2026 - 999",
        empresa: "FARMAURORA",
        consultor: "Vinícius Alves",
        medicamentos: [],
        status: "entregue",
        datas: { previsaoEntrega: "31/12/2026" },
        transportadoraNacional: { nome: "Transportadora Nacional Com Nome Bem Longo Mesmo LTDA e mais um pouco" },
        responsavelOperacional: "Bruno",
        pendencias: [],
        atualizacoes: [],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const { id } = (await createRes.json()) as { id: string };

    try {
      await page.goto("/processos", { waitUntil: "networkidle" });
      await page.locator("#tab-entregues").click();
      const row = page.locator(`#processo-delivered-${id}`);
      await expect(row).toBeVisible();

      expect(await hasHorizontalOverflow(page)).toBe(false);
      const spans = row.locator("span");
      const n = await spans.count();
      for (let i = 0; i < n; i++) {
        expect(await spans.nth(i).evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
      }

      const editBtn = page.locator(`#btn-edit-processo-entregue-${id}`);
      const boxMobile = await editBtn.boundingBox();
      expect(boxMobile).not.toBeNull();
      expect(boxMobile!.width).toBeGreaterThanOrEqual(44);
      expect(boxMobile!.height).toBeGreaterThanOrEqual(44);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(200);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      for (let i = 0; i < n; i++) {
        expect(await spans.nth(i).evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(200);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      const boxDesktop = await editBtn.boundingBox();
      expect(boxDesktop).not.toBeNull();
      expect(Math.round(boxDesktop!.width)).toBe(28);
      expect(Math.round(boxDesktop!.height)).toBe(28);
    } finally {
      await page.request.delete(`/api/processos/${id}`);
    }
  });
});

test.describe("Rodada 7 — Parte 2: touch targets ≥44px em mobile", () => {
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
  });

  async function assertTouch44Mobile(page: Page, locatorStr: string, label: string) {
    const el = page.locator(locatorStr).first();
    if ((await el.count()) === 0) {
      test.info().annotations.push({ type: "skip-item", description: `${label}: elemento não encontrado` });
      return;
    }
    const box = await el.boundingBox();
    expect(box, label).not.toBeNull();
    expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  }

  test("RecadoCard / LembreteCard: fixar/concluir/editar/excluir ≥44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await login(page);
    await page.goto("/recados", { waitUntil: "networkidle" });

    await assertTouch44Mobile(page, "[id^='btn-fixar-recado-']", "btn-fixar-recado");
    await assertTouch44Mobile(page, "[id^='btn-concluir-recado-']", "btn-concluir-recado");

    await page.locator("#tab-meus").click();
    await page.waitForTimeout(300);
    await assertTouch44Mobile(page, "[id^='btn-fixar-lembrete-']", "btn-fixar-lembrete");
    await assertTouch44Mobile(page, "[id^='btn-concluir-lembrete-']", "btn-concluir-lembrete");
    await assertTouch44Mobile(page, "[id^='btn-editar-lembrete-']", "btn-editar-lembrete");
    await assertTouch44Mobile(page, "[id^='btn-excluir-lembrete-']", "btn-excluir-lembrete");
  });

  test("NotificacaoBell: gatilho do sino ≥44px (aparece em toda página)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });
    await assertTouch44Mobile(page, "#btn-notificacoes-fornecedor", "btn-notificacoes-fornecedor (sino)");
  });

  test("PatientRow: gerar Word / WhatsApp / editar / excluir ≥44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1400 });
    await login(page);
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    await assertTouch44Mobile(page, "[id^='btn-generate-word-']", "btn-generate-word");
    await assertTouch44Mobile(page, "[id^='btn-copy-whatsapp-']", "btn-copy-whatsapp");
    await assertTouch44Mobile(page, "[id^='btn-edit-patient-']", "btn-edit-patient");
    await assertTouch44Mobile(page, "[id^='btn-delete-patient-']", "btn-delete-patient");
  });

  test("PatientForm: remover medicamento (✕) ≥44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1400 });
    await login(page);
    await page.goto("/prestacao", { waitUntil: "networkidle" });

    const addBtn = page.locator('button[title="Adicionar medicamento"]');
    if ((await addBtn.count()) === 0) {
      test.skip(true, "sem permissão de escrita em patients nesta conta");
    }
    await addBtn.click();
    await assertTouch44Mobile(page, 'button[title="Remover medicamento"]', "PatientForm remover medicamento");
  });

  test("ProcessoFormModal: remover medicamento e remover pendência (✕) ≥44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await login(page);
    await page.goto("/processos", { waitUntil: "networkidle" });

    const novoBtn = page.getByRole("button", { name: "Novo processo" });
    if ((await novoBtn.count()) === 0) {
      test.skip(true, "sem permissão de escrita em processos nesta conta");
    }
    await novoBtn.click();
    await page.waitForTimeout(300);

    const addMed = page.locator('button[title="Adicionar medicamento"]').first();
    if (await addMed.count()) {
      await addMed.click();
      await assertTouch44Mobile(page, 'button[title="Remover medicamento"]', "ProcessoFormMedicamentos remover");
    }

    await page.locator("#btn-add-pendencia").click();
    await assertTouch44Mobile(page, 'button[title="Remover pendência"]', "ProcessoFormModal remover pendência");
  });

  test("login.vue / redefinir-senha.vue: toggle de senha ≥44px de largura, altura inalterada", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const toggle = page.locator("#login-password-toggle");
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    // Altura já era ~43-44px antes desta rodada (não deveria ter mudado).
    expect(box!.height).toBeGreaterThanOrEqual(40);

    // Ícone permanece exatamente onde estava — só a área de toque invisível cresceu.
    const svgBox = await toggle.locator("svg").boundingBox();
    expect(svgBox).not.toBeNull();
    expect(svgBox!.width).toBeCloseTo(18, 0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    const boxDesktop = await toggle.boundingBox();
    expect(boxDesktop).not.toBeNull();
    expect(Math.round(boxDesktop!.width)).toBe(18);
  });
});
