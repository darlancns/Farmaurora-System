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

// Respiro das abas: da base do elemento que precede a barra (o cabeçalho, ou a busca em /processos) até o topo do texto
// e da base do texto até a linha da barra (borda inferior). O texto é o dos nós de texto visíveis do botão (a variante
// display:none não conta); `desvio` = distância do centro do texto ao centro do botão sem o sublinhado.
async function respiroAba(page: Page, id: string): Promise<{ acima: number; abaixo: number; altura: number; linhas: number; desvio: number }> {
  return page.locator(id).evaluate((btn) => {
    const barra = btn.parentElement as HTMLElement;
    const anterior = (barra.previousElementSibling as HTMLElement).getBoundingClientRect().bottom;
    const retangulos: DOMRect[] = [];
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement?.offsetParent) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      retangulos.push(...Array.from(range.getClientRects()));
    }
    const topo = Math.min(...retangulos.map((r) => r.top));
    const base = Math.max(...retangulos.map((r) => r.bottom));
    const linhaBarra = barra.getBoundingClientRect().bottom - parseFloat(getComputedStyle(barra).borderBottomWidth);
    const b = btn.getBoundingClientRect();
    const sublinhado = parseFloat(getComputedStyle(btn).borderBottomWidth);
    return {
      acima: topo - anterior,
      abaixo: linhaBarra - base,
      altura: b.height,
      linhas: new Set(retangulos.map((r) => Math.round(r.top))).size,
      desvio: Math.abs((topo + base) / 2 - (b.top + (b.height - sublinhado) / 2)),
    };
  });
}

// Abaixo de lg, cada aba: toque >= 44px, texto numa linha só, centrado e com o mesmo respiro acima e abaixo (<= 1px).
async function verificarRespiroAba(page: Page, id: string): Promise<void> {
  const r = await respiroAba(page, id);
  expect(r.altura, `${id}: altura da aba`).toBeGreaterThanOrEqual(43.99);
  expect(r.linhas, `${id}: texto numa linha só`).toBe(1);
  expect(Math.abs(r.acima - r.abaixo), `${id}: respiro acima ${r.acima.toFixed(2)}px x abaixo ${r.abaixo.toFixed(2)}px`).toBeLessThanOrEqual(1);
  expect(r.desvio, `${id}: texto centralizado na vertical`).toBeLessThanOrEqual(1);
  console.log(`[medida] ${id}: acima ${r.acima.toFixed(2)}px, abaixo ${r.abaixo.toFixed(2)}px, aba ${r.altura}px`);
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

      // A tabela de contas troca por container query (@[700px] em ContasTab.vue). Com o
      // BottomNav valendo até 1023px (sem a sidebar de 192px), o conteúdo em 768px passa a ter
      // ~711px e já mostra a tabela; os cards ficam pra celular (375px).
      if (viewport.width >= 768) {
        test("tabela visível (cards ocultos), sem dado cortado", async ({ page }) => {
          const tabela = page.locator("#contas-tab table");
          await expect(tabela).toBeVisible();

          const box = await tabela.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);

          const primeiroCard = page.locator("[id^='conta-card-']").first();
          if (await primeiroCard.count()) {
            await expect(primeiroCard).toBeHidden();
          }
        });
      } else {
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
      }

      test("e-mail nunca trunca — quebra em várias linhas quando necessário", async ({ page }) => {
        test.skip(viewport.width >= 768, "cards ocultos a partir de 768px (tabela no lugar)");
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

  // Aba "Contas" abaixo de lg: 44px, texto centrado e o mesmo respiro acima (linha do cabeçalho) e abaixo (linha da barra).
  for (const viewport of [
    { name: "375x667", width: 375, height: 667 },
    { name: "390x844", width: 390, height: 844 },
    { name: "768x1024", width: 768, height: 1024 },
    { name: "820x1180", width: 820, height: 1180 },
    { name: "1023x768", width: 1023, height: 768 },
  ]) {
    test(`${viewport.name}: aba 'Contas' com toque >= 44px e respiro igual acima e abaixo do texto`, async ({ page }) => {
      test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_SOCIO_EMAIL/PASSWORD");
      await gotoConfiguracoes(page, viewport);
      await expect(page.locator("#tab-contas")).toBeVisible();
      await verificarRespiroAba(page, "#tab-contas");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  // 768px já é o próprio breakpoint `md` (usado pelos botões de ação nas
  // Rodadas 2-4; a sidebar, desde o refino do breakpoint lg, só aparece a partir de 1024px): nele o botão de ações já
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
