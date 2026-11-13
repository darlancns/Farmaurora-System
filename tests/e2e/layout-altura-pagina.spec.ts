import { test, expect, type Page } from "@playwright/test";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import { fixarVisao } from "./_helpers/visaoProcessos";

// Uma ÚNICA rolagem vertical: a do <main id="app-main-content"> (DefaultLayout é h-screen). O documento nunca pode
// ficar mais alto que a janela. Regressão: o <p id="kanban-anuncio" class="sr-only"> (position: absolute) no fim de
// #processos-page não tinha ancestral posicionado dentro do <main>, escapava do overflow dele e esticava o documento
// até o fim do conteúdo (Kanban com 90 processos: documento de ~4200px numa janela de 800px, duas rolagens e faixa
// vazia abaixo do menu). A correção é o `relative` do <main>.
//
// A sonda injeta, no fim do <main>, um bloco alto (3 janelas) seguido de um sr-only — o mesmo padrão do aviso do
// Kanban —, para o teste valer mesmo com pouco dado no banco local. Só leitura: não cria nem apaga nada.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido) ou E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD

assertSupabaseLocal();

const conta = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const temConta = Boolean(conta.email && conta.password);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const TELAS: { nome: string; rota: string; visao: "kanban" | "lista" }[] = [
  { nome: "Follow-Up (Kanban)", rota: "/processos", visao: "kanban" },
  { nome: "Follow-Up (Lista)", rota: "/processos", visao: "lista" },
  { nome: "Pagamentos", rota: "/pagamentos", visao: "kanban" },
  { nome: "Recados", rota: "/recados", visao: "kanban" },
];

async function login(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(conta.email);
    await page.locator("#login-password").fill(conta.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

type Alturas = { janela: number; documento: number; mainCliente: number; mainConteudo: number };

function medir(page: Page): Promise<Alturas> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#app-main-content");
    return {
      janela: window.innerHeight,
      documento: document.documentElement.scrollHeight,
      mainCliente: main?.clientHeight ?? 0,
      mainConteudo: main?.scrollHeight ?? 0,
    };
  });
}

function injetarSonda(page: Page): Promise<void> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#app-main-content");
    if (!main) throw new Error("sem #app-main-content");
    const sonda = document.createElement("div");
    sonda.id = "e2e-altura-sonda";
    const alto = document.createElement("div");
    alto.style.height = `${window.innerHeight * 3}px`;
    const aviso = document.createElement("p");
    aviso.className = "sr-only";
    aviso.textContent = "sonda";
    sonda.append(alto, aviso);
    main.append(sonda);
  });
}

test.describe("Altura da página — uma única rolagem vertical (a do <main>)", () => {
  test.skip(!temConta, "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou E2E_OPERACIONAL_*)");

  for (const vp of VIEWPORTS) {
    for (const tela of TELAS) {
      test(`${tela.nome} em ${vp.width}x${vp.height}: o documento não passa da janela`, async ({ page }) => {
        await page.setViewportSize(vp);
        await fixarVisao(page, tela.visao);
        await login(page);
        await page.goto(tela.rota, { waitUntil: "networkidle" });
        await expect(page.locator("#app-main-content")).toBeVisible();
        if (tela.rota === "/processos" && tela.visao === "kanban") {
          await expect(page.locator("#processo-kanban")).toBeVisible();
        }

        // Com o conteúdo real (no Kanban, o aviso sr-only fica no fim da página).
        const real = await medir(page);
        expect(real.documento, `documento ${real.documento}px numa janela de ${real.janela}px`).toBeLessThanOrEqual(real.janela + 1);

        // Com conteúdo garantidamente mais alto que a janela: quem rola é o <main>, não o documento.
        await injetarSonda(page);
        const alto = await medir(page);
        expect(alto.mainConteudo).toBeGreaterThan(alto.mainCliente);
        expect(alto.documento, `documento ${alto.documento}px numa janela de ${alto.janela}px`).toBeLessThanOrEqual(alto.janela + 1);
      });
    }
  }
});
