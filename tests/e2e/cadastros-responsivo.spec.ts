import { test, expect, type Page } from "@playwright/test";

// Responsividade de Configurações → Cadastros (só administrador): 390px (celular), 768px (tablet) e 1280px (desktop).
// Quatro seções recolhíveis empilhadas (todas fechadas ao abrir): sem rolagem horizontal; abaixo do breakpoint da SEÇÃO
// (700px: só no celular) cada linha vira um item de duas linhas e a tabela some; o "+ Adicionar", a busca e a chave Ativo
// têm >= 44px abaixo de lg; o painel lateral é TELA CHEIA abaixo de lg e tem 600px, à direita, em lg+.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
//
// ESCRITO, NÃO EXECUTADO nesta rodada. Só roda no Supabase local do harness (guarda tests/e2e/_guards/globalSetup.ts).
// Cria 1 fornecedor e 1 transportadora "TESTE e2e …" por rodada (não existe exclusão; os itens ficam no banco local). A
// chave PIX usada é FICTÍCIA e nunca é impressa.

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

const LISTAS = ["fornecedores", "despachantes", "transportadoras", "cias-aereas"] as const;

const viewports = [
  { nome: "390px (celular)", width: 390, height: 844, cards: true, abaixoDeLg: true },
  // Em 768px o BottomNav vale (sem a sidebar) e a seção tem ~711px: já passa de 700px, então mostra a TABELA (como em
  // Contas — ver configuracoes-responsivo.spec.ts). Os itens de duas linhas ficam para o celular.
  { nome: "768px (tablet)", width: 768, height: 1024, cards: false, abaixoDeLg: true },
  { nome: "1280px (desktop)", width: 1280, height: 900, cards: false, abaixoDeLg: false },
];

test.describe("Responsividade de Configurações → Cadastros", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!hasAdmin, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  for (const vp of viewports) {
    test.describe(vp.nome, () => {
      let nomeItem = "";
      let idItem = "";

      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await login(page);
        nomeItem = `TESTE e2e Resp ${vp.width} ${Date.now()}`;
        const criado = await page.request.post("/api/cadastros/fornecedores", {
          data: { nome: nomeItem, pais: "País de Teste", prazoAlertaDias: 5, semAlerta: false },
        });
        expect(criado.status()).toBe(200);
        idItem = String(((await criado.json()) as { id: string }).id);
        const transp = await page.request.post("/api/cadastros/transportadoras", {
          data: { nome: `${nomeItem} T`, chavePix: `e2e-chave-ficticia-${vp.width}-${Date.now()}` },
        });
        expect(transp.status()).toBe(200);
        await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
        await expect(page.locator("#cadastros-tab")).toBeVisible();
      });

      test("as 4 seções aparecem empilhadas, fechadas, com a mesma largura e sem rolagem horizontal", async ({ page }) => {
        const secoes = page.locator("#cadastros-tab > section");
        await expect(secoes).toHaveCount(4);
        for (const lista of LISTAS) await expect(page.locator(`#btn-secao-${lista}`)).toHaveAttribute("aria-expanded", "false");
        const caixas = await secoes.evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.x), width: Math.round(r.width), top: r.top, bottom: r.bottom };
          }),
        );
        expect(new Set(caixas.map((c) => c.x)).size, "mesmo x").toBe(1);
        expect(new Set(caixas.map((c) => c.width)).size, "mesma largura").toBe(1);
        expect(caixas[0]!.x).toBeGreaterThanOrEqual(0);
        expect(caixas[0]!.x + caixas[0]!.width).toBeLessThanOrEqual(vp.width + 0.5);
        // Empilhadas: cada seção começa depois do fim da anterior.
        for (let i = 1; i < caixas.length; i++) expect(caixas[i]!.top).toBeGreaterThanOrEqual(caixas[i - 1]!.bottom - 0.5);
        expect(await semOverflowHorizontal(page)).toBe(true);
      });

      test("abertas, as 4 seções continuam sem rolagem horizontal", async ({ page }) => {
        for (const lista of LISTAS) await page.locator(`#btn-secao-${lista}`).click();
        for (const lista of LISTAS) await expect(page.locator(`#cadastro-corpo-${lista}`)).toBeVisible();
        expect(await semOverflowHorizontal(page)).toBe(true);
      });

      test(`${vp.cards ? "itens de duas linhas visíveis e tabela oculta" : "tabela visível e itens ocultos"}`, async ({ page }) => {
        await page.locator("#btn-secao-fornecedores").click();
        const tabela = page.locator("#cadastro-lista-fornecedores");
        const item = page.locator(`#cadastro-card-fornecedores-${idItem}`);
        await expect(page.locator(`#cadastro-row-fornecedores-${idItem}, #cadastro-card-fornecedores-${idItem}`).first()).toBeAttached();
        if (vp.cards) {
          await expect(tabela).toBeHidden();
          await expect(item).toBeVisible();
          // Duas linhas: o nome em cima e "país · prazo" embaixo; a chave Ativo à direita.
          await expect(item).toContainText(nomeItem);
          await expect(item).toContainText("País de Teste · 5 dias");
          const caixa = (await item.boundingBox())!;
          const chave = (await page.locator(`#cadastro-switch-card-fornecedores-${idItem}`).boundingBox())!;
          expect(chave.x + chave.width).toBeLessThanOrEqual(caixa.x + caixa.width + 0.5);
          expect(chave.x).toBeGreaterThan(caixa.x + caixa.width / 2);
        } else {
          await expect(tabela).toBeVisible();
          await expect(item).toBeHidden();
          await expect(page.locator("#cadastro-lista-fornecedores thead th")).toHaveText(["Nome", "País", "Prazo de alerta", "Ativo"]);
        }
        expect(await semOverflowHorizontal(page)).toBe(true);
      });

      test("o '+ Adicionar' de cada seção cabe (texto sem cortar) e tem >= 44px abaixo de lg; a busca também", async ({ page }) => {
        for (const lista of LISTAS) {
          const botao = page.locator(`#btn-adicionar-cadastro-${lista}`);
          await expect(botao).toBeVisible();
          const medidas = await botao.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { cabe: el.scrollWidth <= el.clientWidth + 1, altura: r.height, direita: r.right };
          });
          expect(medidas.cabe, `${lista}: texto cortado`).toBe(true);
          expect(medidas.direita, `${lista}: botão fora da tela`).toBeLessThanOrEqual(vp.width + 0.5);
          if (vp.abaixoDeLg) expect(medidas.altura, lista).toBeGreaterThanOrEqual(43.99);
        }
        const busca = (await page.locator("#cadastros-busca").boundingBox())!;
        expect(busca.x + busca.width).toBeLessThanOrEqual(vp.width + 0.5);
        if (vp.abaixoDeLg) expect(busca.height).toBeGreaterThanOrEqual(43.99);
      });

      test("a chave Ativo tem alvo >= 44px de altura abaixo de lg e o clique nela não abre o painel", async ({ page }) => {
        await page.locator("#btn-secao-fornecedores").click();
        const chave = page.locator(vp.cards ? `#cadastro-switch-card-fornecedores-${idItem}` : `#cadastro-switch-fornecedores-${idItem}`);
        await expect(chave).toBeVisible();
        await expect(chave).toHaveAttribute("role", "switch");
        if (vp.abaixoDeLg) expect((await chave.boundingBox())!.height).toBeGreaterThanOrEqual(43.99);
        await chave.click();
        await expect(page.locator("#cadastro-painel")).toHaveCount(0);
        await expect(page.locator("#cadastro-desfazer")).toBeVisible();
        await page.locator("#btn-cadastro-desfazer").click(); // deixa o item ativo de novo
        await expect(chave).toHaveAttribute("aria-checked", "true");
      });

      test("o painel lateral: tela cheia abaixo de lg; 600px à direita em lg+; sem overflow; alvos >= 44px abaixo de lg", async ({ page }) => {
        await page.locator("#btn-adicionar-cadastro-fornecedores").click();
        const painel = page.locator("#cadastro-painel");
        await expect(painel).toBeVisible();
        const caixa = (await painel.boundingBox())!;
        if (vp.abaixoDeLg) {
          expect(Math.round(caixa.width), "tela cheia").toBe(vp.width);
          expect(Math.round(caixa.x)).toBe(0);
        } else {
          expect(Math.round(caixa.width), "600px").toBe(600);
          expect(Math.round(caixa.x + caixa.width), "colado à direita").toBe(vp.width);
        }
        expect(caixa.y + caixa.height).toBeLessThanOrEqual(vp.height + 0.5);
        expect(await semOverflowHorizontal(page)).toBe(true);

        // O alerta nasce sem escolha; "Número de dias" abre o campo de dias.
        await expect(page.locator("#cadastro-form-alerta-dias")).not.toBeChecked();
        await page.locator("label[for='cadastro-form-alerta-dias']").click();
        await expect(page.locator("#cadastro-form-prazo")).toBeVisible();

        if (vp.abaixoDeLg) {
          for (const id of ["#cadastro-form-nome", "#cadastro-form-pais", "#cadastro-form-prazo", "#btn-cadastro-cancelar", "#btn-cadastro-salvar", "#btn-painel-cadastro-fechar"]) {
            const altura = (await page.locator(id).boundingBox())!.height;
            expect(altura, id).toBeGreaterThanOrEqual(43.99);
          }
          for (const forAttr of ["cadastro-form-alerta-dias", "cadastro-form-alerta-sem"]) {
            const altura = (await page.locator(`label[for='${forAttr}']`).boundingBox())!.height;
            expect(altura, forAttr).toBeGreaterThanOrEqual(43.99);
          }
        }
        await page.locator("#btn-cadastro-cancelar").click();
        await expect(painel).toBeHidden();
        await expect(page.locator("#btn-adicionar-cadastro-fornecedores")).toBeFocused(); // foco devolvido
      });

      test("editar: o painel mostra o nome desabilitado e, ao fechar, o foco volta à linha", async ({ page }) => {
        await page.locator("#btn-secao-fornecedores").click();
        await page.locator(vp.cards ? `#cadastro-card-fornecedores-${idItem}` : `#cadastro-row-fornecedores-${idItem}`).click();
        await expect(page.locator("#cadastro-form-nome")).toBeDisabled();
        await expect(page.locator("#cadastro-form-nome")).toHaveValue(nomeItem);
        expect(await semOverflowHorizontal(page)).toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.locator("#cadastro-painel")).toBeHidden();
        await expect(page.locator(vp.cards ? `#cadastro-abrir-card-fornecedores-${idItem}` : `#cadastro-abrir-fornecedores-${idItem}`)).toBeFocused();
      });

      test("chave PIX da transportadora: campo oculto no painel, 'Mostrar' e 'Copiar' cabem e têm >= 44px abaixo de lg", async ({ page }) => {
        await page.locator("#btn-secao-transportadoras").click();
        await expect(page.locator("#cadastro-corpo-transportadoras")).toContainText("PIX"); // "PIX cadastrada" (celular) ou a coluna PIX (tabela)
        await page.locator("#cadastros-busca").fill(`${nomeItem} T`);
        await page.locator(vp.cards ? "[id^='cadastro-card-transportadoras-']" : "[id^='cadastro-row-transportadoras-']").first().click();
        await expect(page.locator("#cadastro-form-pix")).toHaveAttribute("type", "password");
        for (const id of ["#btn-cadastro-pix-mostrar", "#btn-cadastro-pix-copiar"]) {
          const medidas = await page.locator(id).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { altura: r.height, direita: r.right, cabe: el.scrollWidth <= el.clientWidth + 1 };
          });
          expect(medidas.cabe, `${id}: texto cortado`).toBe(true);
          expect(medidas.direita, `${id}: fora da tela`).toBeLessThanOrEqual(vp.width + 0.5);
          if (vp.abaixoDeLg) expect(medidas.altura, id).toBeGreaterThanOrEqual(43.99);
        }
        expect(await semOverflowHorizontal(page)).toBe(true);
      });
    });
  }
});
