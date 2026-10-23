import { test, expect, type Page } from "@playwright/test";

// /processos de lg (1024px) pra cima — regra crítica do refino do breakpoint lg: o desktop NÃO
// muda. Este spec trava o layout de sempre: sidebar visível, BottomNav oculto,
// filtros em linha, sem ícone de filtro nem bottom sheet, e o botão
// "+ Novo processo" no mesmo lugar (estático, à direita da linha de filtros).
// A comparação de pixels contra o baseline é feita à parte (screenshots); aqui
// ficam as asserções explícitas de estilo/posição que o garantem.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback — precisa de
//   escrita em processos pra o botão "+ Novo processo" existir)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const VIEWPORTS = [
  { name: "1024x768 (limite inferior de lg)", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

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

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}

const centerY = (b: { y: number; height: number }): number => b.y + b.height / 2;

test.describe("/processos em lg+ — desktop inalterado", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await login(page);
        await page.goto("/processos", { waitUntil: "networkidle" });
        await expect(page.locator("#tab-andamento")).toBeVisible();
      });

      test("sidebar visível, BottomNav oculto e sem reserva de espaço pra ele", async ({ page }) => {
        await expect(page.locator("#sidebar-nav")).toBeVisible();
        await expect(page.locator("#bottom-nav")).toBeHidden();
        expect(await page.locator("#bottom-nav").boundingBox()).toBeNull();

        const sidebar = await box(page, "#sidebar-nav");
        expect(Math.round(sidebar.width)).toBe(192);
        expect(await page.locator("#app-main-content").evaluate((el) => getComputedStyle(el).paddingBottom)).toBe(
          "40px",
        );
        expect(await page.locator("#processos-page").evaluate((el) => getComputedStyle(el).paddingBottom)).toBe("0px");
      });

      test("filtros em linha: busca 216px + 3 selects lado a lado, sem ícone de filtro nem painel", async ({ page }) => {
        const linha = await page.locator("#processo-filtros").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { display: cs.display, flexDirection: cs.flexDirection, flexWrap: cs.flexWrap, alignItems: cs.alignItems };
        });
        expect(linha).toEqual({ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center" });

        const busca = await box(page, "#processo-search");
        const status = await box(page, "#filtro-status");
        const empresa = await box(page, "#filtro-empresa");
        const responsavel = await box(page, "#filtro-responsavel");

        expect(Math.round(busca.width)).toBe(216);
        // Mesma linha (centros alinhados) e na ordem busca → status → empresa → responsável.
        for (const b of [status, empresa, responsavel]) {
          expect(Math.abs(centerY(b) - centerY(busca))).toBeLessThanOrEqual(2);
        }
        expect(status.x).toBeGreaterThanOrEqual(busca.x + busca.width);
        expect(empresa.x).toBeGreaterThanOrEqual(status.x + status.width);
        expect(responsavel.x).toBeGreaterThanOrEqual(empresa.x + empresa.width);
        // Gap de 10px (gap-2.5) entre os itens, igual a antes.
        expect(Math.round(status.x - (busca.x + busca.width))).toBe(10);

        // O wrapper busca+ícone some do fluxo (display: contents) e o ícone não ocupa espaço.
        expect(
          await page.locator("#processo-search").evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).display),
        ).toBe("contents");
        await expect(page.locator("#btn-filtros-processo")).toBeHidden();
        expect(await page.locator("#btn-filtros-processo").boundingBox()).toBeNull();
        await expect(page.locator("#badge-filtros-ativos")).toHaveCount(0);
        await expect(page.locator("#processo-filtros-sheet")).toHaveCount(0);
        // Altura da busca de sempre (py-2), não a versão de toque do mobile.
        expect(Math.round(busca.height)).toBeLessThanOrEqual(39);
      });

      test("'+ Novo processo' no mesmo lugar: estático, à direita da linha de filtros, sem flutuar", async ({ page }) => {
        const novo = page.locator("#btn-novo-processo");
        if ((await novo.count()) === 0) {
          test.skip(true, "conta de teste sem permissão de escrita em processos");
        }

        const estilo = await novo.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            position: cs.position,
            zIndex: cs.zIndex,
            marginLeft: cs.marginLeft,
            radius: cs.borderTopLeftRadius,
            shadow: cs.boxShadow,
            flexShrink: cs.flexShrink,
          };
        });
        expect(estilo.position).toBe("static");
        expect(estilo.zIndex).toBe("auto");
        // O botão flutuante "+" (só abaixo de lg) não renderiza nem ocupa espaço aqui.
        await expect(page.locator("#fab-novo-processo")).toBeHidden();
        expect(estilo.radius).toBe("8px");
        // `shadow-none` do Tailwind computa 5 sombras transparentes de 0px: sem sombra visível.
        expect(estilo.shadow === "none" || /^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(estilo.shadow)).toBe(true);
        expect(estilo.flexShrink).toBe("0");
        expect(estilo.marginLeft).not.toBe("0px"); // ml-auto empurra pra direita

        const linha = await box(page, "#processo-filtros");
        const busca = await box(page, "#processo-search");
        const botao = await box(page, "#btn-novo-processo");
        expect(Math.abs(botao.x + botao.width - (linha.x + linha.width))).toBeLessThanOrEqual(1);
        if (viewport.width >= 1280) {
          expect(Math.abs(centerY(botao) - centerY(busca))).toBeLessThanOrEqual(2);
        } else {
          // 1024px: busca + 3 selects + botão não cabem numa linha — como sempre foi (flex-wrap),
          // o botão quebra pra linha de baixo, ainda colado à direita.
          expect(botao.y).toBeGreaterThanOrEqual(busca.y + busca.height);
        }
        // Dentro da linha de filtros (não solto na tela) e largura natural (não full-width).
        expect(botao.y).toBeGreaterThanOrEqual(linha.y - 1);
        expect(botao.y + botao.height).toBeLessThanOrEqual(linha.y + linha.height + 1);
        expect(botao.width).toBeLessThan(200);
      });

      test("header e abas de sempre: título livre pra quebrar, nome+cargo visíveis, abas à esquerda com linha de 2px", async ({
        page,
      }) => {
        expect(await page.locator("h1").evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("normal");
        expect(await page.locator("h1").locator("xpath=../..").evaluate((el) => getComputedStyle(el).display)).toBe("flex");

        const identidade = page.locator("#header-identity");
        await expect(identidade.locator("p").first()).toBeVisible();
        await expect(identidade.locator("p").nth(1)).toBeVisible();
        const estiloIdentidade = await identidade.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { borderLeft: cs.borderLeftWidth, paddingLeft: cs.paddingLeft };
        });
        expect(estiloIdentidade).toEqual({ borderLeft: "1px", paddingLeft: "16px" });
        const avatar = await identidade.evaluate((el) => {
          // O 1º filho é a raiz do menu da conta (lg:hidden, sem caixa); o avatar de sempre é o círculo visível.
          const b = [...el.querySelectorAll("div.rounded-full")].find((c) => c.getBoundingClientRect().width > 0)!.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height) };
        });
        expect(avatar).toEqual({ w: 36, h: 36 });

        // Abas na largura do conteúdo (não 50/50), 4px entre elas, sublinhado de 2px.
        const andamento = await box(page, "#tab-andamento");
        const entregues = await box(page, "#tab-entregues");
        const container = await box(page, "#tab-andamento >> xpath=..");
        expect(andamento.width).toBeLessThan(container.width / 3);
        expect(Math.round(entregues.x - (andamento.x + andamento.width))).toBe(4);
        expect(await page.locator("#tab-andamento").evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe("2px");
        expect(await page.locator("#tab-andamento").evaluate((el) => getComputedStyle(el).flexGrow)).toBe("0");
      });

      test("sem overflow horizontal e sem sheet/ícone ao alternar abas", async ({ page }) => {
        for (const tabId of ["#tab-andamento", "#tab-entregues"]) {
          await page.locator(tabId).click();
          await page.waitForTimeout(150);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
            `overflow em ${tabId}`,
          ).toBe(false);
          await expect(page.locator("#btn-filtros-processo")).toBeHidden();
        }
      });
    });
  }
});
