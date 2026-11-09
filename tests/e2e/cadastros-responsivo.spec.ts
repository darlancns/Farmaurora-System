import { test, expect, type Page } from "@playwright/test";

// Responsividade de Configurações → Cadastros (só administrador): 360px (celular), 768px (tablet) e 1280px (desktop).
// Sem rolagem horizontal; abaixo do breakpoint do PAINEL (700px: só no celular) a lista vira cards e a tabela some; o seletor das 3
// listas cabe em 360px (texto sem cortar); o modal cabe na tela e os alvos de toque têm >= 44px abaixo de lg.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
//
// Só roda no Supabase local do harness (guarda tests/e2e/_guards/globalSetup.ts). Cria 1 item "TESTE e2e …" por rodada
// (não existe exclusão; o item fica no banco local).

const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
const hasAdmin = Boolean(admin.email && admin.password);

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(admin.email);
    await page.locator("#login-password").fill(admin.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

const semOverflowHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const viewports = [
  { nome: "360px (celular)", width: 360, height: 800, cards: true, abaixoDeLg: true },
  // Em 768px o BottomNav vale (sem a sidebar) e o painel tem ~711px: já passa de 700px, então mostra a TABELA (como em
  // Contas — ver configuracoes-responsivo.spec.ts). Os cards ficam para o celular.
  { nome: "768px (tablet)", width: 768, height: 1024, cards: false, abaixoDeLg: true },
  { nome: "1280px (desktop)", width: 1280, height: 900, cards: false, abaixoDeLg: false },
];

test.describe("Responsividade de Configurações → Cadastros", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  for (const vp of viewports) {
    test.describe(vp.nome, () => {
      let nomeItem = "";

      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await login(page);
        nomeItem = `TESTE e2e Resp ${vp.width} ${Date.now()}`;
        const criado = await page.request.post("/api/cadastros/fornecedores", {
          data: { nome: nomeItem, pais: "País de Teste", prazoAlertaDias: 5, semAlerta: false },
        });
        expect(criado.status()).toBe(200);
        await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
        await expect(page.locator("#cadastros-tab")).toBeVisible();
      });

      test("sem rolagem horizontal nas 3 listas", async ({ page }) => {
        for (const lista of ["fornecedores", "despachantes", "temperaturas"]) {
          await page.locator(`#cadastro-lista-escolha-${lista}`).click();
          await expect(page.locator(`#cadastro-lista-${lista}`)).toBeVisible();
          expect(await semOverflowHorizontal(page), lista).toBe(true);
        }
      });

      test(`${vp.cards ? "cards visíveis e tabela oculta" : "tabela visível e cards ocultos"}`, async ({ page }) => {
        const lista = page.locator("#cadastro-lista-fornecedores");
        const tabela = lista.locator("table");
        const cards = lista.locator("[id^='cadastro-card-fornecedores-']").first();
        await expect(lista.locator("tr", { hasText: nomeItem }).or(lista.locator("[id^='cadastro-card-']", { hasText: nomeItem })).first()).toBeAttached();
        if (vp.cards) {
          await expect(tabela).toBeHidden();
          await expect(cards).toBeVisible();
        } else {
          await expect(tabela).toBeVisible();
          await expect(cards).toBeHidden();
        }
      });

      test("o seletor das 3 listas cabe: texto sem cortar e alvo >= 44px abaixo de lg", async ({ page }) => {
        const botoes = page.locator("#cadastro-lista-escolha button");
        await expect(botoes).toHaveCount(3);
        for (let i = 0; i < 3; i++) {
          const b = botoes.nth(i);
          const medidas = await b.evaluate((el) => ({ cabe: el.scrollWidth <= el.clientWidth + 1, altura: el.getBoundingClientRect().height }));
          expect(medidas.cabe, `texto do botão ${i} cortado`).toBe(true);
          if (vp.abaixoDeLg) expect(medidas.altura).toBeGreaterThanOrEqual(43.99);
        }
        // As 3 numa linha só (grade de 3 colunas).
        const topos = await botoes.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(new Set(topos).size).toBe(1);
      });

      test("o modal 'Novo fornecedor' cabe na tela, sem overflow, e os campos têm alvo >= 44px abaixo de lg", async ({ page }) => {
        await page.locator("#btn-novo-cadastro").click();
        const modal = page.locator("#cadastro-form-overlay > div");
        await expect(modal).toBeVisible();
        const caixa = (await modal.boundingBox())!;
        expect(caixa.x).toBeGreaterThanOrEqual(0);
        expect(caixa.x + caixa.width).toBeLessThanOrEqual(vp.width + 0.5);
        expect(caixa.y + caixa.height).toBeLessThanOrEqual(vp.height + 0.5);
        expect(await semOverflowHorizontal(page)).toBe(true);

        // O alerta nasce sem escolha; "Número de dias" abre o campo de dias.
        await expect(page.locator("#cadastro-form-alerta-dias")).not.toBeChecked();
        await page.locator("label[for='cadastro-form-alerta-dias']").click();
        await expect(page.locator("#cadastro-form-prazo")).toBeVisible();

        if (vp.abaixoDeLg) {
          for (const id of ["#cadastro-form-nome", "#cadastro-form-pais", "#cadastro-form-prazo", "#btn-cadastro-cancelar", "#btn-cadastro-salvar"]) {
            const altura = (await page.locator(id).boundingBox())!.height;
            expect(altura, id).toBeGreaterThanOrEqual(43.99);
          }
          for (const forAttr of ["cadastro-form-alerta-dias", "cadastro-form-alerta-sem"]) {
            const altura = (await page.locator(`label[for='${forAttr}']`).boundingBox())!.height;
            expect(altura, forAttr).toBeGreaterThanOrEqual(43.99);
          }
        }
        await page.locator("#btn-cadastro-cancelar").click();
        await expect(page.locator("#cadastro-form-overlay")).toBeHidden();
      });

      test("editar mostra o nome só como leitura e o menu de ações abre", async ({ page }) => {
        const gatilho = page
          .locator(vp.cards ? "[id^='btn-acoes-cadastro-card-fornecedores-']" : "[id^='btn-acoes-cadastro-fornecedores-']")
          .first();
        await gatilho.click();
        await page.locator("[id^='btn-editar-cadastro-fornecedores-']").first().click();
        await expect(page.locator("#cadastro-form-nome")).toHaveCount(0);
        await expect(page.locator("#cadastro-form-nome-leitura")).toBeVisible();
        expect(await semOverflowHorizontal(page)).toBe(true);
      });
    });
  }
});
