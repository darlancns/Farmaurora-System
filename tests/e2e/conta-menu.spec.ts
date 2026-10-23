import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL } from "../../shared/constants/roles";

// Menu da conta do GlobalHeader (shell global): abaixo de lg o avatar vira um botão que abre um
// menu com nome, cargo e "Sair" (a sidebar, que tem o "Sair", não existe nessa faixa); em lg+ o
// avatar continua não interativo e a sidebar mantém o "Sair" de sempre.
//
// Não cria nem apaga dado nenhum. O logout é interceptado na rede (page.route → 204) e o spec
// afirma a chamada e o redirecionamento — assim também não revoga a sessão da conta de teste.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido)
//   E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD (fallback)

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const LOGOUT_URL = "**/auth/v1/logout*";

const MOBILE_VIEWPORTS = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1023x768 (último pixel antes de lg)", width: 1023, height: 768 },
];

const DESKTOP_VIEWPORTS = [
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

async function irPara(page: Page, viewport: { width: number; height: number }, rota = "/processos"): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await login(page);
  await page.goto(rota, { waitUntil: "networkidle" });
  await expect(page.locator("#header-identity")).toBeVisible();
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `${selector} sem caixa (oculto?)`).not.toBeNull();
  return b!;
}

const centerY = (b: { y: number; height: number }): number => b.y + b.height / 2;
const direita = (b: { x: number; width: number }): number => b.x + b.width;

// Nome e cargo exatamente como o GlobalHeader os resolve (nome, ou parte do e-mail antes do @).
async function identidadeEsperada(page: Page): Promise<{ nome: string; cargo: string }> {
  const me = (await (await page.request.get("/api/auth/me")).json()) as {
    nome?: string;
    email: string;
    role: keyof typeof ROLE_LABEL;
  };
  return { nome: me.nome ?? me.email.split("@")[0] ?? "", cargo: ROLE_LABEL[me.role] };
}

// Intercepta o logout (204) e conta as chamadas.
async function interceptarLogout(page: Page): Promise<{ chamadas: () => number }> {
  let chamadas = 0;
  await page.route(LOGOUT_URL, async (route) => {
    chamadas += 1;
    await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });
  return { chamadas: () => chamadas };
}

test.describe("menu da conta — abaixo de lg", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of MOBILE_VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await irPara(page, viewport);
      });

      test("o avatar é um botão de toque ≥44px, na mesma linha do sino, com aria-label e aria-haspopup; menu fechado não existe", async ({
        page,
      }) => {
        const botao = page.locator("#btn-conta-menu");
        await expect(botao).toBeVisible();
        expect(await botao.evaluate((el) => el.tagName)).toBe("BUTTON");
        await expect(botao).toHaveAttribute("aria-label", "Menu da conta");
        await expect(botao).toHaveAttribute("aria-haspopup", "menu");
        await expect(botao).toHaveAttribute("aria-expanded", "false");

        const b = await box(page, "#btn-conta-menu");
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        const sino = await box(page, "#btn-notificacoes-fornecedor");
        expect(Math.abs(centerY(b) - centerY(sino))).toBeLessThanOrEqual(2);
        expect(b.x).toBeGreaterThanOrEqual(direita(sino) - 1);

        // Mostra as iniciais (mesmo AvatarIniciais de antes) e nome/cargo continuam escondidos no header.
        const { nome } = await identidadeEsperada(page);
        const iniciais = (await botao.innerText()).trim();
        expect(iniciais.length).toBeGreaterThan(0);
        expect(iniciais).toBe(iniciais.toUpperCase());
        expect(nome.toUpperCase()).toContain(iniciais[0]);
        await expect(page.locator("#header-identity p").first()).toBeHidden();

        await expect(page.locator("#conta-menu")).toHaveCount(0);
      });

      test("tocar no avatar abre o menu ancorado sob ele, com nome, cargo e Sair; sem corte e sem ficar atrás do BottomNav", async ({
        page,
      }) => {
        const esperado = await identidadeEsperada(page);
        await page.locator("#btn-conta-menu").click();

        await expect(page.locator("#conta-menu")).toBeVisible();
        await expect(page.locator("#btn-conta-menu")).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("#conta-menu-nome")).toHaveText(esperado.nome);
        await expect(page.locator("#conta-menu-cargo")).toHaveText(esperado.cargo);
        await expect(page.locator("#btn-conta-sair")).toHaveText("Sair");
        await expect(page.locator("#btn-conta-sair svg")).toBeVisible();

        const botao = await box(page, "#btn-conta-menu");
        const menu = await box(page, "#conta-menu");
        const sair = await box(page, "#btn-conta-sair");
        const nav = await box(page, "#bottom-nav");

        // Sob o avatar, com a borda direita alinhada à dele, inteiro dentro da tela.
        expect(menu.y).toBeGreaterThanOrEqual(botao.y + botao.height);
        expect(menu.y - (botao.y + botao.height)).toBeLessThanOrEqual(12);
        expect(Math.abs(direita(menu) - direita(botao))).toBeLessThanOrEqual(1);
        expect(menu.x).toBeGreaterThanOrEqual(0);
        expect(direita(menu)).toBeLessThanOrEqual(viewport.width);
        // Nunca invade o BottomNav.
        expect(menu.y + menu.height).toBeLessThanOrEqual(nav.y);
        // "Sair" com toque ≥44px de altura e nome/cargo acima dele.
        expect(sair.height).toBeGreaterThanOrEqual(44);
        const nomeBox = await box(page, "#conta-menu-nome");
        const cargoBox = await box(page, "#conta-menu-cargo");
        expect(cargoBox.y).toBeGreaterThanOrEqual(nomeBox.y + nomeBox.height - 1);
        expect(sair.y).toBeGreaterThanOrEqual(cargoBox.y + cargoBox.height - 1);

        // Fora do <main> (que tem overflow-x-hidden): filho direto do <body>, e por cima de tudo
        // (o toque no centro do menu e no "Sair" cai nele, não no conteúdo nem no BottomNav).
        expect(await page.locator("#conta-menu").evaluate((el) => el.parentElement === document.body)).toBe(true);
        for (const [x, y] of [
          [menu.x + menu.width / 2, menu.y + 8],
          [sair.x + sair.width / 2, sair.y + sair.height / 2],
        ] as const) {
          expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest("#conta-menu"), [x, y])).toBe(true);
        }
        expect(
          await page.evaluate(() => {
            const z = getComputedStyle(document.querySelector("#conta-menu")!).zIndex;
            const nav = getComputedStyle(document.querySelector("#bottom-nav")!).zIndex;
            return Number(z) > Number(nav);
          }),
        ).toBe(true);

        // Foco no "Sair" ao abrir; página não ganha scroll horizontal.
        await expect(page.locator("#btn-conta-sair")).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(
          false,
        );
      });

      test("Escape fecha (e devolve o foco ao avatar); tocar de novo no avatar também fecha", async ({ page }) => {
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#conta-menu")).toHaveCount(0);
        await expect(page.locator("#btn-conta-menu")).toBeFocused();
        await expect(page.locator("#btn-conta-menu")).toHaveAttribute("aria-expanded", "false");

        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toBeVisible();
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toHaveCount(0);

        // Escape sem menu aberto não faz nada de estranho.
        await page.keyboard.press("Escape");
        await expect(page.locator("#conta-menu")).toHaveCount(0);
      });

      test("toque fora fecha o menu (e o toque dentro do menu, fora do Sair, não)", async ({ page }) => {
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toBeVisible();

        // Toque no nome/cargo (dentro do menu): continua aberto.
        await page.locator("#conta-menu-cargo").click();
        await expect(page.locator("#conta-menu")).toBeVisible();

        // Toque no título da página (fora): fecha.
        const h1 = await box(page, "h1");
        await page.mouse.click(h1.x + 4, h1.y + h1.height / 2);
        await expect(page.locator("#conta-menu")).toHaveCount(0);
        expect(new URL(page.url()).pathname).toBe("/processos");

        // Toque numa área vazia da lista / do BottomNav também fecha.
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toBeVisible();
        const nav = await box(page, "#bottom-nav");
        await page.mouse.click(2, nav.y + 2);
        await expect(page.locator("#conta-menu")).toHaveCount(0);
      });

      test("Sair executa o mesmo logout da sidebar (signOut no Supabase) e redireciona pro /login", async ({ page }) => {
        const logout = await interceptarLogout(page);
        await page.locator("#btn-conta-menu").click();

        const requisicao = page.waitForRequest((req) => /\/auth\/v1\/logout/.test(req.url()) && req.method() === "POST");
        await page.locator("#btn-conta-sair").click();
        await requisicao;

        await expect(page).toHaveURL(/\/login(\?|$)/);
        expect(logout.chamadas()).toBe(1);
        await expect(page.locator("#conta-menu")).toHaveCount(0);
        await expect(page.locator("#login-email")).toBeVisible();

        // Sessão encerrada de verdade: uma rota protegida volta pro /login.
        await page.goto("/processos", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/login(\?|$)/);
      });

      test("girar o tablet pra paisagem (>= lg) com o menu aberto fecha o menu e o avatar volta a ser não interativo", async ({
        page,
      }) => {
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#conta-menu")).toBeVisible();

        await page.setViewportSize({ width: 1180, height: 820 });
        await expect(page.locator("#conta-menu")).toHaveCount(0);
        await expect(page.locator("#btn-conta-menu")).toBeHidden();
        expect(await page.locator("#btn-conta-menu").boundingBox()).toBeNull();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      });

      test("o menu existe em outras páginas (header global): /pagamentos", async ({ page }) => {
        await page.goto("/pagamentos", { waitUntil: "networkidle" });
        await expect(page.locator("#btn-conta-menu")).toBeVisible();
        await page.locator("#btn-conta-menu").click();
        await expect(page.locator("#btn-conta-sair")).toBeVisible();
        const menu = await box(page, "#conta-menu");
        const nav = await box(page, "#bottom-nav");
        expect(menu.y + menu.height).toBeLessThanOrEqual(nav.y);
        await page.keyboard.press("Escape");
        await expect(page.locator("#conta-menu")).toHaveCount(0);
      });
    });
  }
});

test.describe("menu da conta — lg+ (desktop inalterado)", () => {
  test.describe.configure({ retries: 2 });

  for (const viewport of DESKTOP_VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");
        await irPara(page, viewport);
      });

      test("avatar não interativo (div 36px, sem botão), nome e cargo ao lado, menu ausente", async ({ page }) => {
        await expect(page.locator("#btn-conta-menu")).toBeHidden();
        expect(await page.locator("#btn-conta-menu").boundingBox()).toBeNull();
        await expect(page.locator("#conta-menu")).toHaveCount(0);

        const avatar = page.locator("#header-identity div.rounded-full:visible").first();
        const estilo = await avatar.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName,
            dentroDeBotao: el.closest("button") !== null,
            tabindex: el.getAttribute("tabindex"),
            role: el.getAttribute("role"),
            cursor: cs.cursor,
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
            fundo: cs.backgroundColor,
            fonte: cs.fontSize,
          };
        });
        expect(estilo).toEqual({
          tag: "DIV", dentroDeBotao: false, tabindex: null, role: null, cursor: "auto",
          w: 36, h: 36, fundo: "rgb(11, 57, 86)", fonte: "13px",
        });

        // Nome + cargo visíveis ao lado e divisória vertical de sempre.
        const esperado = await identidadeEsperada(page);
        await expect(page.locator("#header-identity p").nth(0)).toHaveText(esperado.nome);
        await expect(page.locator("#header-identity p").nth(1)).toHaveText(esperado.cargo);
        const bloco = await page.locator("#header-identity").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { borda: cs.borderLeftWidth, cor: cs.borderLeftColor, pad: cs.paddingLeft, gap: cs.columnGap };
        });
        expect(bloco).toEqual({ borda: "1px", cor: "rgb(201, 211, 209)", pad: "16px", gap: "10px" });

        // Tocar no avatar não abre nada.
        await avatar.click();
        await expect(page.locator("#conta-menu")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.locator("#conta-menu")).toHaveCount(0);

        // Avatar, nome e cargo na mesma fileira, na ordem de sempre.
        const a = await box(page, "#header-identity div.rounded-full:visible");
        const nome = await box(page, "#header-identity p >> nth=0");
        expect(nome.x).toBeGreaterThanOrEqual(direita(a) - 1);
        expect(Math.abs(centerY(a) - centerY(nome))).toBeLessThanOrEqual(14);
      });

      test("sidebar com o Sair de sempre: mesmo botão, texto, estilo e posição no rodapé; BottomNav ausente", async ({ page }) => {
        await expect(page.locator("#bottom-nav")).toBeHidden();
        const sair = page.locator("#logout-button");
        await expect(sair).toBeVisible();
        await expect(sair).toHaveText("Sair");
        await expect(sair).toHaveAttribute("type", "button");
        expect(await sair.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);

        const estilo = await sair.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            cor: cs.color, fonte: cs.fontSize, peso: cs.fontWeight, raio: cs.borderTopLeftRadius,
            pad: `${cs.paddingTop} ${cs.paddingLeft}`, gap: cs.columnGap, fundo: cs.backgroundColor,
          };
        });
        // text-white/70: o Chrome devolve a cor como oklab(... / 0.7), então só a opacidade é afirmada.
        expect(estilo.cor).toMatch(/ 0\.7\)$/);
        expect({ ...estilo, cor: undefined }).toEqual({
          cor: undefined, fonte: "13.5px", peso: "500", raio: "6px",
          pad: "6px 8px", gap: "8px", fundo: "rgba(0, 0, 0, 0)",
        });
        const icone = await box(page, "#logout-button svg");
        expect(Math.round(icone.width)).toBe(15);

        // Rodapé da sidebar: Configurações logo acima do Sair, ambos colados no fim (mt-auto).
        const sidebar = await box(page, "#sidebar-nav");
        const b = await box(page, "#logout-button");
        expect(Math.round(sidebar.width)).toBe(192);
        expect(sidebar.y + sidebar.height - (b.y + b.height)).toBeLessThanOrEqual(26); // py-6 (24px) + folga
        expect(b.y).toBeGreaterThan(sidebar.y + sidebar.height / 2);
        const config = await box(page, '#sidebar-nav a[href="/configuracoes"]');
        expect(config.y + config.height).toBeLessThanOrEqual(b.y + 1);

        // O menu da conta (mobile) não está em lugar nenhum da sidebar nem ocupa espaço.
        await expect(page.locator("#conta-menu")).toHaveCount(0);
      });

      test("Sair da sidebar continua fazendo signOut e indo pro /login", async ({ page }) => {
        const logout = await interceptarLogout(page);
        const requisicao = page.waitForRequest((req) => /\/auth\/v1\/logout/.test(req.url()) && req.method() === "POST");
        await page.locator("#logout-button").click();
        await requisicao;
        await expect(page).toHaveURL(/\/login(\?|$)/);
        expect(logout.chamadas()).toBe(1);
        await page.goto("/processos", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/login(\?|$)/);
      });
    });
  }
});
