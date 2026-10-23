import { test, expect, type Page } from "@playwright/test";

// /recados: abas centralizadas e botão flutuante "+" abaixo de lg, e desktop (>= lg)
// como sempre foi (sem a aba "Todos", removida em todas as larguras). "recados" é a
// única seção liberada pra todos os cargos (ver shared/utils/rbac.ts), então qualquer
// conta de teste válida serve. O botão "+" de /processos só existe pra quem escreve em
// processos — por isso a comparação entre as duas páginas usa a conta de escrita.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido, escreve em processos)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback, escreve em processos)
//   E2E_USER_EMAIL / E2E_USER_PASSWORD (qualquer cargo — só pra /recados)
//
// Não cria nem apaga nada: abre os formulários e fecha sem salvar.

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const user = { email: process.env.E2E_USER_EMAIL ?? "", password: process.env.E2E_USER_PASSWORD ?? "" };
const hasWriter = Boolean(writer.email && writer.password);
const account = hasWriter ? writer : user;
const hasAccount = Boolean(account.email && account.password);

const MOBILE_VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768 (último pixel antes de lg)", width: 1023, height: 768 },
];

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(account.email);
    await page.locator("#login-password").fill(account.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} sem caixa (oculto?)`).not.toBeNull();
  return b!;
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

async function gotoRecados(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await login(page);
  await page.goto("/recados", { waitUntil: "networkidle" });
  await expect(page.locator("#tab-recebidos")).toBeVisible();
}

// O que está desenhado por cima do centro do elemento (true = ele mesmo ou um filho).
function topoNoCentro(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const topo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return topo !== null && el.contains(topo);
  }, selector);
}

test.describe("Responsividade de /recados — abaixo de lg", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of MOBILE_VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasAccount, "defina E2E_ADMIN_EMAIL/PASSWORD (ou E2E_USER_EMAIL/PASSWORD)");
        await gotoRecados(page, viewport);
      });

      test("sem overflow horizontal", async ({ page }) => {
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("aba 'Todos' não existe: só 3 abas, padrão 'Recebidos'", async ({ page }) => {
        await expect(page.locator("#tab-todos")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Todos/ })).toHaveCount(0);
        const abas = page.locator("#tab-recebidos").locator("xpath=..").locator("> button[id^='tab-']");
        await expect(abas).toHaveCount(3);
        expect(await abas.evaluateAll((els) => els.map((e) => e.id))).toEqual(["tab-recebidos", "tab-enviados", "tab-meus"]);
        await expect(page.locator("#tab-recebidos")).toHaveClass(/border-accent-dark/);
        await expect(page.locator("#tab-enviados")).not.toHaveClass(/border-accent-dark/);
      });

      test("abas centralizadas na barra, com toque >= 44px, e clicáveis", async ({ page }) => {
        const barra = await page.locator("#tab-recebidos").evaluate((el) => {
          const r = el.parentElement!.getBoundingClientRect();
          return { x: r.x, width: r.width };
        });
        const abas = [await box(page, "#tab-recebidos"), await box(page, "#tab-enviados"), await box(page, "#tab-meus")];
        for (const aba of abas) expect(aba.height).toBeGreaterThanOrEqual(44);

        const esquerda = Math.min(...abas.map((a) => a.x));
        const direita = Math.max(...abas.map((a) => a.x + a.width));
        expect(Math.abs((esquerda + direita) / 2 - (barra.x + barra.width / 2))).toBeLessThanOrEqual(2);
        // Nenhuma aba solta em outra linha: todas começam na mesma altura.
        expect(Math.max(...abas.map((a) => a.y)) - Math.min(...abas.map((a) => a.y))).toBeLessThanOrEqual(1);

        for (const id of ["#tab-enviados", "#tab-meus", "#tab-recebidos"]) {
          await page.locator(id).click();
          await expect(page.locator(id)).toHaveClass(/border-accent-dark/);
        }
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("abas: respiro igual acima e abaixo do texto, 44px, 1 linha; 3ª aba 'Meus (N)' com nome acessível 'Meus lembretes'", async ({ page }) => {
        for (const id of ["#tab-recebidos", "#tab-enviados", "#tab-meus"]) await verificarRespiroAba(page, id);
        const meus = page.locator("#tab-meus");
        // useInnerText: só o texto VISÍVEL (o textContent inclui a variante display:none).
        await expect(meus).toHaveText(/^Meus \(\d+\)$/, { useInnerText: true });
        await expect(meus).toHaveAccessibleName(/^Meus lembretes \(\d+\)$/);
        // A variante longa fica display:none: só um texto visível dentro da aba.
        await expect(meus.locator("span:visible")).toHaveCount(1);
        expect(await meus.innerText()).not.toContain("lembretes");
        // As 3 abas com a mesma altura (nenhuma quebra em 2 linhas).
        const alturas = await Promise.all(["#tab-recebidos", "#tab-enviados", "#tab-meus"].map(async (id) => (await box(page, id)).height));
        expect(Math.max(...alturas) - Math.min(...alturas)).toBeLessThanOrEqual(0.5);
        const barraH = await page.locator("#tab-recebidos").evaluate((el) => el.parentElement!.getBoundingClientRect().height);
        console.log(`[medida] /recados barra de abas: ${barraH}px (abas ${alturas.join("/")}px)`);
        // Troca de aba continua funcionando com o rótulo curto.
        await meus.click();
        await expect(meus).toHaveClass(/border-accent-dark/);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      });

      test("botão '+' flutuante: 56x56, sem texto, aria-label 'Novo recado', canto inferior direito acima do BottomNav", async ({
        page,
      }) => {
        const botao = page.getByRole("button", { name: "Novo recado" });
        await expect(botao).toBeVisible();
        await expect(botao).toHaveText("");
        await expect(botao).toHaveAttribute("title", "Novo recado");
        // O botão com texto do desktop não ocupa espaço aqui.
        await expect(page.locator("#btn-novo-recado")).toBeHidden();

        const fab = await box(page, "#fab-novo-recado");
        const nav = await box(page, "#bottom-nav");
        expect(Math.round(fab.width)).toBe(56);
        expect(Math.round(fab.height)).toBe(56);
        expect(Math.abs(viewport.width - (fab.x + fab.width) - 16)).toBeLessThanOrEqual(1);
        expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y - 8);
        expect(nav.y - (fab.y + fab.height)).toBeLessThanOrEqual(24);

        const estilo = await botao.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { position: cs.position, background: cs.backgroundColor, zIndex: cs.zIndex };
        });
        expect(estilo.position).toBe("fixed");
        expect(estilo.background).toBe("rgb(11, 57, 86)");
        expect(estilo.zIndex).toBe("30");
      });

      test("botão '+' abre o formulário de recado e some por baixo do overlay; na aba Meus abre o de lembrete", async ({
        page,
      }) => {
        await page.getByRole("button", { name: "Novo recado" }).click();
        await expect(page.locator("#recado-form-overlay")).toBeVisible();
        expect(await topoNoCentro(page, "#fab-novo-recado")).toBe(false);
        await page.keyboard.press("Escape");
        await expect(page.locator("#recado-form-overlay")).toHaveCount(0);

        await page.locator("#tab-meus").click();
        const botao = page.getByRole("button", { name: "Novo lembrete" });
        await expect(botao).toBeVisible();
        await botao.click();
        await expect(page.locator("#lembrete-form-overlay")).toBeVisible();
        expect(await topoNoCentro(page, "#fab-novo-recado")).toBe(false);
        await page.keyboard.press("Escape");
        await expect(page.locator("#lembrete-form-overlay")).toHaveCount(0);
      });

      test("botão '+' não cobre o último card nem o BottomNav", async ({ page }) => {
        for (const [aba, lista] of [
          ["#tab-recebidos", "#recados-lista"],
          ["#tab-enviados", "#recados-lista"],
          ["#tab-meus", "#lembretes-lista"],
        ] as const) {
          await page.locator(aba).click();
          if ((await page.locator(lista).count()) === 0) continue; // aba vazia: nada a cobrir
          const fimLista = await page.evaluate((sel) => {
            const main = document.querySelector<HTMLElement>("#app-main-content")!;
            main.scrollTop = main.scrollHeight;
            return document.querySelector(sel)!.lastElementChild!.getBoundingClientRect().bottom;
          }, lista);
          const fab = await box(page, "#fab-novo-recado");
          const nav = await box(page, "#bottom-nav");
          expect(fimLista, aba).toBeLessThanOrEqual(fab.y);
          expect(fab.y + fab.height, aba).toBeLessThanOrEqual(nav.y);
        }
      });

      test("botão '+' de /recados e de /processos: mesmo tamanho, mesmo offset direito e acima do BottomNav", async ({
        page,
      }) => {
        test.skip(!hasWriter, "precisa de conta com escrita em processos (E2E_ADMIN_* ou E2E_OPERACIONAL_*)");
        const recados = await box(page, "#fab-novo-recado");
        const navRecados = await box(page, "#bottom-nav");

        await page.goto("/processos", { waitUntil: "networkidle" });
        await expect(page.getByRole("button", { name: "Novo processo" })).toBeVisible();
        const processos = await box(page, "#fab-novo-processo");
        const navProcessos = await box(page, "#bottom-nav");
        await expect(page.getByRole("button", { name: "Novo processo" })).toHaveText("");

        expect(Math.round(processos.width)).toBe(56);
        expect(Math.round(processos.height)).toBe(56);
        expect(processos.width).toBeCloseTo(recados.width, 0);
        expect(processos.height).toBeCloseTo(recados.height, 0);
        expect(processos.x + processos.width).toBeCloseTo(recados.x + recados.width, 0);
        expect(navProcessos.y - (processos.y + processos.height)).toBeCloseTo(
          navRecados.y - (recados.y + recados.height),
          0,
        );
      });
    });
  }
});

test.describe("/recados — desktop (>= lg) como sempre", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of [
    { name: "1024x768 (primeiro pixel de lg)", width: 1024, height: 768 },
    { name: "1280x800", width: 1280, height: 800 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test(`${viewport.name}: 3ª aba 'Meus lembretes (N)', nome acessível 'Meus lembretes', sem texto visível duplicado`, async ({ page }) => {
      test.skip(!hasAccount, "defina E2E_ADMIN_EMAIL/PASSWORD (ou E2E_USER_EMAIL/PASSWORD)");
      await gotoRecados(page, viewport);
      const meus = page.locator("#tab-meus");
      await expect(meus).toHaveText(/^Meus lembretes \(\d+\)$/, { useInnerText: true });
      await expect(meus).toHaveAccessibleName(/^Meus lembretes \(\d+\)$/);
      await expect(meus.locator("span:visible")).toHaveCount(1);
    });
  }

  for (const viewport of [
    { name: "1280x800", width: 1280, height: 800 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test(`${viewport.name}: sem 'Todos', abas à esquerda, botão com texto à direita da barra e sem botão flutuante`, async ({
      page,
    }) => {
      test.skip(!hasAccount, "defina E2E_ADMIN_EMAIL/PASSWORD (ou E2E_USER_EMAIL/PASSWORD)");
      await gotoRecados(page, viewport);

      await expect(page.locator("#tab-todos")).toHaveCount(0);
      await expect(page.locator("#fab-novo-recado")).toBeHidden();

      const botao = page.locator("#btn-novo-recado");
      await expect(botao).toBeVisible();
      await expect(botao).toHaveText("+ Novo recado");
      await expect(botao).toHaveCSS("position", "absolute");

      const barra = await page.locator("#tab-recebidos").evaluate((el) => {
        const r = el.parentElement!.getBoundingClientRect();
        return { x: r.x, width: r.width };
      });
      const recebidos = await box(page, "#tab-recebidos");
      const enviados = await box(page, "#tab-enviados");
      const meus = await box(page, "#tab-meus");
      const b = await box(page, "#btn-novo-recado");

      // Abas à esquerda (a primeira cola na borda da barra), lado a lado, sem altura mínima de toque.
      expect(Math.abs(recebidos.x - barra.x)).toBeLessThanOrEqual(1);
      expect(enviados.x).toBeGreaterThan(recebidos.x + recebidos.width);
      expect(meus.x).toBeGreaterThan(enviados.x + enviados.width);
      expect(recebidos.height).toBeLessThan(44);
      // Botão colado à direita da barra, depois das abas, na mesma linha.
      expect(Math.abs(b.x + b.width - (barra.x + barra.width))).toBeLessThanOrEqual(1);
      expect(b.x).toBeGreaterThan(meus.x + meus.width);
      expect(Math.abs(b.y - enviados.y)).toBeLessThan(30);

      // Aba Meus: o mesmo botão vira "+ Novo lembrete".
      await page.locator("#tab-meus").click();
      await expect(botao).toHaveText("+ Novo lembrete");
    });
  }
});
