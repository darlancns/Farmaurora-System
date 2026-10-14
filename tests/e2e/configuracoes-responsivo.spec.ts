import { test, expect, type Page } from "@playwright/test";

// Responsividade de /configuracoes (Rodada 5 do plano de responsividade — só
// CSS/layout, nenhuma lógica de RBAC/permissões/CRUD de conta tocada). Roda
// contra dados reais já existentes na conta de teste.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_SOCIO_EMAIL / E2E_SOCIO_PASSWORD (fallback — só socio e administrador
//   leem "config", ver shared/utils/rbac.ts; os demais cargos são
//   redirecionados pra fora de /configuracoes)
//
// A tabela de contas (ContasTab.vue) e a lista de cards equivalente
// coexistem no DOM (mesmo esquema de SidebarNav/BottomNav da Rodada 1) —
// alternadas por @container, nunca as duas visíveis ao mesmo tempo. Por isso
// os testes verificam explicitamente qual das duas está com display:none.

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

async function gotoConfiguracoes(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/configuracoes", { waitUntil: "networkidle" });
}

test.describe("Responsividade de /configuracoes", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "375px", width: 375, height: 900 },
    { name: "768px", width: 768, height: 1024 },
  ]) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
        await gotoConfiguracoes(page, viewport);
      });

      test("sem overflow horizontal", async ({ page }) => {
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("tabela oculta, lista de cards visível, sem dado cortado", async ({ page }) => {
        await expect(page.locator("#contas-tab table")).toBeHidden();

        const primeiroCard = page.locator("[id^='conta-card-']").first();
        if ((await primeiroCard.count()) === 0) {
          test.skip(true, "sem contas na conta de teste");
        }
        await expect(primeiroCard).toBeVisible();

        const box = await primeiroCard.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      });

      test("e-mail nunca trunca — quebra em várias linhas quando necessário", async ({ page }) => {
        const emailEl = page.locator("[id^='conta-card-'] p.break-all").first();
        if ((await emailEl.count()) === 0) {
          test.skip(true, "sem contas na conta de teste");
        }

        // Confirma o mecanismo de quebra com um valor propositalmente longo
        // (só o texto — não altera nada real nem toca em nenhuma conta).
        await emailEl.evaluate((el) => {
          el.textContent =
            "um.email.propositalmente.longo.para.testar.quebra.de.linha.sem.truncar@dominio-de-teste-bem-comprido.com.br";
        });
        expect(await emailEl.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });
    });
  }

  // 768px já é o próprio breakpoint `md` (mesmo usado pela sidebar desde a
  // Rodada 1 e pelos botões de ação nas Rodadas 2-4): nele o botão de ações já
  // volta ao tamanho compacto de sempre por design (`md:h-7 md:w-7`). A
  // asserção de toque ≥44px só faz sentido abaixo de `md`.
  test("abaixo de md (375px): botão de ações (⋮) tem toque de pelo menos 44px", async ({ page }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoConfiguracoes(page, { width: 375, height: 900 });

    const btn = page.locator("[id^='btn-acoes-conta-card-']").first();
    if ((await btn.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de gerenciar contas");
    }
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("md+ (1440px): tabela visível (cards ocultos), botão de ações no tamanho compacto de sempre (28px)", async ({
    page,
  }) => {
    test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
    await gotoConfiguracoes(page, { width: 1440, height: 900 });

    await expect(page.locator("#contas-tab table")).toBeVisible();
    const cardsWrap = page.locator("[id^='conta-card-']").first();
    if (await cardsWrap.count()) {
      await expect(cardsWrap).toBeHidden();
    }

    const btn = page.locator("[id^='btn-acoes-conta-']:not([id*='card'])").first();
    if ((await btn.count()) === 0) {
      test.skip(true, "conta de teste sem permissão de gerenciar contas");
    }
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(28);
    expect(Math.round(box!.height)).toBe(28);
  });
});
