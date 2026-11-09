import { test, expect, type Page } from "@playwright/test";

// Responsividade de Configurações → Cadastros (só administrador): 360px (celular), 768px (tablet) e 1280px (desktop).
// Tela única com 3 blocos (cards) empilhados: sem rolagem horizontal; abaixo do breakpoint do PAINEL (700px: só no
// celular) a lista vira cards e a tabela some; o botão "+ Novo …" de cada bloco cabe e tem >= 44px abaixo de lg; o modal
// cabe na tela e os alvos de toque têm >= 44px abaixo de lg.
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

      test("os 3 blocos aparecem empilhados, com a mesma largura, e sem rolagem horizontal", async ({ page }) => {
        const blocos = page.locator("#cadastros-tab > section");
        await expect(blocos).toHaveCount(3);
        const caixas = await blocos.evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.x), width: Math.round(r.width), top: r.top, bottom: r.bottom };
          }),
        );
        expect(new Set(caixas.map((c) => c.x)).size, "mesmo x").toBe(1);
        expect(new Set(caixas.map((c) => c.width)).size, "mesma largura").toBe(1);
        expect(caixas[0]!.x).toBeGreaterThanOrEqual(0);
        expect(caixas[0]!.x + caixas[0]!.width).toBeLessThanOrEqual(vp.width + 0.5);
        // Empilhados: cada bloco começa depois do fim do anterior.
        expect(caixas[1]!.top).toBeGreaterThanOrEqual(caixas[0]!.bottom - 0.5);
        expect(caixas[2]!.top).toBeGreaterThanOrEqual(caixas[1]!.bottom - 0.5);
        expect(await semOverflowHorizontal(page)).toBe(true);
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

      test("o botão '+ Novo …' de cada bloco cabe (texto sem cortar) e tem >= 44px abaixo de lg", async ({ page }) => {
        for (const lista of ["fornecedores", "despachantes", "cias-aereas"]) {
          const botao = page.locator(`#btn-novo-cadastro-${lista}`);
          await expect(botao).toBeVisible();
          const medidas = await botao.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { cabe: el.scrollWidth <= el.clientWidth + 1, altura: r.height, direita: r.right };
          });
          expect(medidas.cabe, `${lista}: texto cortado`).toBe(true);
          expect(medidas.direita, `${lista}: botão fora da tela`).toBeLessThanOrEqual(vp.width + 0.5);
          if (vp.abaixoDeLg) expect(medidas.altura, lista).toBeGreaterThanOrEqual(43.99);
        }
      });

      test("o modal 'Novo fornecedor' cabe na tela, sem overflow, e os campos têm alvo >= 44px abaixo de lg", async ({ page }) => {
        await page.locator("#btn-novo-cadastro-fornecedores").click();
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
