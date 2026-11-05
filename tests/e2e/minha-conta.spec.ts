import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";

// Aba "Minha conta" em /configuracoes (Fase C). Mesmo gate dos outros specs: contas de teste por cargo
// (E2E_ADMIN_*, E2E_SOCIO_*, E2E_OPERACIONAL_*, E2E_CONSULTOR_*) e o .env de um Supabase LOCAL com a
// service role — assertSupabaseLocal aborta antes de qualquer escrita se a URL não for de loopback.
// Cada teste pula sozinho quando faltam as credenciais do cargo que ele usa.
//
// Os testes que ALTERAM a conta (e-mail, senha) usam uma conta DESCARTÁVEL criada aqui pela service role
// (sócio, prefixo TESTE) e apagada no fim — nunca as contas compartilhadas. Os de cargo só LEEM.

const credenciais = {
  administrador: { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" },
  socio: { email: process.env.E2E_SOCIO_EMAIL ?? "", password: process.env.E2E_SOCIO_PASSWORD ?? "" },
  operacional: { email: process.env.E2E_OPERACIONAL_EMAIL ?? "", password: process.env.E2E_OPERACIONAL_PASSWORD ?? "" },
  consultor: { email: process.env.E2E_CONSULTOR_EMAIL ?? "", password: process.env.E2E_CONSULTOR_PASSWORD ?? "" },
} as const;
type Cargo = keyof typeof credenciais;
const tem = (c: Cargo): boolean => Boolean(credenciais[c].email && credenciais[c].password);

function lerEnv(): { url: string; serviceKey: string } {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const map = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
    return { url: map.NUXT_PUBLIC_SUPABASE_URL ?? "", serviceKey: map.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "" };
  } catch {
    return { url: "", serviceKey: "" };
  }
}

// Aborta (antes de qualquer escrita) se o Supabase em uso não for o local do harness.
assertSupabaseLocal();
const env = lerEnv();
const temServiceRole = Boolean(env.url && env.serviceKey);

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function abrirConfiguracoes(page: Page, query = ""): Promise<void> {
  await page.goto(`/configuracoes${query}`, { waitUntil: "networkidle" });
}

// ── Abas por cargo ──────────────────────────────────────────────────────────

test.describe("Minha conta — abas por cargo", () => {
  test.describe.configure({ retries: 2 });

  for (const cargo of ["administrador", "socio"] as const) {
    test(`${cargo}: vê Minha conta + Contas (Minha conta PRIMEIRO e padrão) e respeita ?aba=`, async ({ page }) => {
      test.skip(!tem(cargo), `defina as credenciais E2E de ${cargo}`);
      await login(page, credenciais[cargo].email, credenciais[cargo].password);

      // Sem ?aba=: abre em Minha conta e a URL não ganha parâmetro nenhum.
      await abrirConfiguracoes(page);
      await expect(page).toHaveURL(/\/configuracoes$/);
      await expect(page.locator("#tab-minha-conta")).toBeVisible();
      await expect(page.locator("#tab-contas")).toBeVisible();
      await expect(page.locator("#minha-conta-tab")).toBeVisible();
      await expect(page.locator("#contas-tab")).toHaveCount(0);
      // Ordem das abas: Minha conta antes de Contas.
      const ordem = await page.locator("[id^='tab-']").evaluateAll((els) => els.map((el) => el.id));
      expect(ordem).toEqual(["tab-minha-conta", "tab-contas"]);
      await expect(page.locator("#tab-minha-conta")).toHaveClass(/border-accent-dark/);

      // ?aba=contas continua abrindo Contas pra quem a vê.
      await abrirConfiguracoes(page, "?aba=contas");
      await expect(page.locator("#contas-tab")).toBeVisible();
      await expect(page.locator("#minha-conta-tab")).toHaveCount(0);

      // Inválido cai na aba padrão (Minha conta), sem erro.
      await abrirConfiguracoes(page, "?aba=xpto");
      await expect(page.locator("#minha-conta-tab")).toBeVisible();
      await expect(page.locator("#contas-tab")).toHaveCount(0);

      // Clicar nas abas alterna e grava ?aba= na URL.
      await page.locator("#tab-contas").click();
      await expect(page).toHaveURL(/aba=contas/);
      await expect(page.locator("#contas-tab")).toBeVisible();
      await page.locator("#tab-minha-conta").click();
      await expect(page).toHaveURL(/aba=minha-conta/);
      await expect(page.locator("#minha-conta-tab")).toBeVisible();
    });

    test(`${cargo}: o subtítulo acompanha a aba ativa (Gestão de contas… só em Contas)`, async ({ page }) => {
      test.skip(!tem(cargo), `defina as credenciais E2E de ${cargo}`);
      await login(page, credenciais[cargo].email, credenciais[cargo].password);

      await abrirConfiguracoes(page);
      await expect(page.getByText("Seus dados de acesso.")).toBeVisible();
      await expect(page.getByText("Gestão de contas e acessos da equipe.")).toHaveCount(0);

      await abrirConfiguracoes(page, "?aba=contas");
      await expect(page.getByText("Gestão de contas e acessos da equipe.")).toBeVisible();
    });
  }

  for (const cargo of ["operacional", "consultor"] as const) {
    test(`${cargo}: a página abre e mostra SÓ Minha conta; ?aba=contas cai nela; /api/admin segue 403`, async ({ page }) => {
      test.skip(!tem(cargo), `defina as credenciais E2E de ${cargo}`);
      await login(page, credenciais[cargo].email, credenciais[cargo].password);

      await abrirConfiguracoes(page);
      await expect(page).toHaveURL(/\/configuracoes$/); // antes, o cargo era redirecionado pra fora
      await expect(page.locator("#minha-conta-tab")).toBeVisible();
      await expect(page.locator("#tab-minha-conta")).toBeVisible();
      await expect(page.locator("#tab-contas")).toHaveCount(0);
      await expect(page.locator("#contas-tab")).toHaveCount(0);

      await abrirConfiguracoes(page, "?aba=contas");
      await expect(page.locator("#minha-conta-tab")).toBeVisible();
      await expect(page.locator("#contas-tab")).toHaveCount(0);

      // A página liberou, as APIs de gestão NÃO.
      expect((await page.request.get("/api/admin/users")).status()).toBe(403);
      const criar = await page.request.post("/api/admin/users", {
        data: { email: `e2e+bloqueado-${Date.now()}@farmaurora.com.br`, password: "senha-super-forte-123", role: "socio", nome: "x" },
      });
      expect(criar.status()).toBe(403);
    });

    test(`${cargo}: o campo Nome vem desabilitado com a orientação de pedir ao administrador`, async ({ page }) => {
      test.skip(!tem(cargo), `defina as credenciais E2E de ${cargo}`);
      await login(page, credenciais[cargo].email, credenciais[cargo].password);
      await abrirConfiguracoes(page);

      await expect(page.locator("#minha-conta-nome")).toBeDisabled();
      await expect(page.locator("#minha-conta-nome-bloqueado")).toHaveText("Peça ao administrador para alterar seu nome.");
      await expect(page.locator("#btn-salvar-nome")).toHaveCount(0);

      // Mesmo forçando a chamada, o servidor recusa (403, orientando a falar com o administrador).
      const res = await page.request.patch("/api/auth/conta/nome", { data: { nome: "Nome Forçado" } });
      expect(res.status()).toBe(403);
    });
  }

  for (const cargo of ["administrador", "socio"] as const) {
    test(`${cargo}: o campo Nome é editável (sem salvar nada na conta compartilhada)`, async ({ page }) => {
      test.skip(!tem(cargo), `defina as credenciais E2E de ${cargo}`);
      await login(page, credenciais[cargo].email, credenciais[cargo].password);
      await abrirConfiguracoes(page, "?aba=minha-conta");

      await expect(page.locator("#minha-conta-nome")).toBeEnabled();
      await expect(page.locator("#minha-conta-nome-bloqueado")).toHaveCount(0);
      await expect(page.locator("#btn-salvar-nome")).toBeVisible();
    });
  }
});

// ── Responsividade ──────────────────────────────────────────────────────────

test.describe("Minha conta — responsividade", () => {
  test.describe.configure({ retries: 2 });

  test("360px: sem scroll horizontal, cartões na largura da tela e alvos de toque >= 44px", async ({ page }) => {
    const cargo = (["administrador", "socio", "operacional", "consultor"] as const).find(tem);
    test.skip(!cargo, "defina as credenciais E2E de algum cargo");
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, credenciais[cargo!].email, credenciais[cargo!].password);
    await abrirConfiguracoes(page, "?aba=minha-conta");
    await expect(page.locator("#minha-conta-tab")).toBeVisible();

    const semScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(semScroll).toBe(true);
    for (const id of ["minha-conta-bloco-nome", "minha-conta-bloco-email", "minha-conta-bloco-senha"]) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(360);
    }

    const alvos = page.locator("#minha-conta-tab input:not([aria-hidden='true']):not([disabled]), #minha-conta-tab button");
    const total = await alvos.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      const box = (await alvos.nth(i).boundingBox())!;
      expect(box.height, `alvo ${i}`).toBeGreaterThanOrEqual(43.5);
    }
    // Abas também.
    expect((await page.locator("#tab-minha-conta").boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

    // Inputs a 16px no mobile (o iOS não dá zoom ao focar).
    const fontes = await page
      .locator("#minha-conta-tab input:not([aria-hidden='true'])")
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(fontes.length).toBeGreaterThan(0);
    for (const f of fontes) expect(f).toBeGreaterThanOrEqual(16);

    // A barra de abas cabe na largura (sem rolar na horizontal).
    const barraCabe = await page.evaluate(() => {
      const barra = document.querySelector("[id^='tab-']")!.parentElement!;
      return barra.scrollWidth <= barra.clientWidth;
    });
    expect(barraCabe).toBe(true);

    // No fim da página o último botão não fica atrás da BottomNav fixa.
    await page.evaluate(() => {
      const main = document.getElementById("app-main-content")!;
      main.scrollTop = main.scrollHeight;
    });
    const botao = (await page.locator("#btn-redefinir-senha").boundingBox())!;
    const nav = (await page.locator("#bottom-nav").boundingBox())!;
    expect(botao.y + botao.height).toBeLessThanOrEqual(nav.y);
  });

  // ── Layout desktop (lg+). Abaixo de lg nada mudou: 360 e 768 seguem com as medidas de antes. ─────────────
  const cargoDeTeste = () => (["administrador", "socio", "operacional", "consultor"] as const).find(tem);

  interface Caixa {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  async function caixas(page: Page, ids: string[]): Promise<Record<string, Caixa | null>> {
    return page.evaluate((lista) => {
      const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
      for (const id of lista) {
        const el = document.getElementById(id);
        if (!el) {
          out[id] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        out[id] = { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      return out;
    }, ids);
  }
  const IDS_LAYOUT = [
    "minha-conta-tab",
    "minha-conta-bloco-nome",
    "minha-conta-bloco-email",
    "minha-conta-bloco-senha",
    "minha-conta-nome",
    "btn-salvar-nome",
    "btn-salvar-email",
    "btn-redefinir-senha",
  ];
  const aprox = (a: number, b: number, tol = 1): boolean => Math.abs(a - b) <= tol;

  for (const [largura, altura] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    test(`desktop ${largura}×${altura}: Nome numa linha; E-mail e Senha lado a lado, mesma altura, botões no rodapé`, async ({ page }) => {
      const cargo = cargoDeTeste();
      test.skip(!cargo, "defina as credenciais E2E de algum cargo");
      await page.setViewportSize({ width: largura, height: altura });
      await login(page, credenciais[cargo!].email, credenciais[cargo!].password);
      await abrirConfiguracoes(page, "?aba=minha-conta");
      await expect(page.locator("#minha-conta-tab")).toBeVisible();

      const c = await caixas(page, IDS_LAYOUT);
      const tab = c["minha-conta-tab"]!;
      const nomeCartao = c["minha-conta-bloco-nome"]!;
      const email = c["minha-conta-bloco-email"]!;
      const senha = c["minha-conta-bloco-senha"]!;

      // Ocupa o contêiner padrão das páginas (mx-auto max-w-[1400px] dentro do main de 192px de sidebar + 24px de
      // padding de cada lado), não mais os 560px de antes.
      expect(aprox(tab.w, Math.min(1400, largura - 240), 1.5)).toBe(true);
      expect(nomeCartao.w).toBeCloseTo(tab.w, 0);

      // E-mail e Senha: lado a lado, mesmo topo, mesma altura, colunas iguais preenchendo a largura.
      expect(aprox(email.y, senha.y, 0.5)).toBe(true);
      expect(aprox(email.h, senha.h, 0.5)).toBe(true);
      expect(email.x).toBeLessThan(senha.x);
      expect(email.x + email.w).toBeLessThan(senha.x);
      expect(aprox(email.w, senha.w, 1)).toBe(true);
      expect(aprox(senha.x + senha.w, tab.x + tab.w, 1)).toBe(true);
      expect(email.y).toBeGreaterThan(nomeCartao.y + nomeCartao.h - 1); // abaixo do Nome, não ao lado

      // Botão de cada cartão alinhado no rodapé do cartão (padding p-5 de 20px + borda de 1px).
      for (const [botao, cartao] of [
        [c["btn-salvar-email"]!, email],
        [c["btn-redefinir-senha"]!, senha],
      ] as const) {
        const folga = cartao.y + cartao.h - (botao.y + botao.h);
        expect(folga).toBeGreaterThan(19);
        expect(folga).toBeLessThan(22);
      }
      expect(aprox(c["btn-salvar-email"]!.y, c["btn-redefinir-senha"]!.y, 0.5)).toBe(true);

      // Nome: campo e botão na MESMA linha (mesmo topo, mesma altura), campo ocupando o resto.
      const campo = c["minha-conta-nome"]!;
      expect(campo.w).toBeGreaterThan(nomeCartao.w * 0.7);
      const botaoNome = c["btn-salvar-nome"];
      if (botaoNome) {
        expect(aprox(botaoNome.y, campo.y, 0.5)).toBe(true);
        expect(aprox(botaoNome.h, campo.h, 0.5)).toBe(true);
        expect(botaoNome.x).toBeGreaterThan(campo.x + campo.w);
      }

      // Tipografia e sidebar de sempre; sem rolagem horizontal.
      expect(await page.locator("#minha-conta-nome").evaluate((el) => getComputedStyle(el).fontSize)).toBe("13.5px");
      const config = (await page.locator('#sidebar-nav a[href="/configuracoes"]').boundingBox())!;
      const sair = (await page.locator("#logout-button").boundingBox())!;
      expect(config.y + config.height).toBeLessThanOrEqual(sair.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // Em 1366×768 e 1920×1080 os três blocos cabem sem rolagem vertical (1280×720 fica a poucos px).
      if (altura >= 768) {
        const falta = await page.evaluate(() => {
          const main = document.getElementById("app-main-content")!;
          return main.scrollHeight - main.clientHeight;
        });
        expect(falta).toBeLessThanOrEqual(0);
      }
    });
  }

  test("desktop: a ordem de tabulação segue a ordem visual (Nome → E-mail → Senha)", async ({ page }) => {
    const cargo = cargoDeTeste();
    test.skip(!cargo, "defina as credenciais E2E de algum cargo");
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, credenciais[cargo!].email, credenciais[cargo!].password);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    const ordem = await page
      .locator("#minha-conta-tab input:not([aria-hidden='true']):not([disabled]), #minha-conta-tab button:not([tabindex='-1'])")
      .evaluateAll((els) => els.map((el) => el.id));
    const pos = (id: string) => ordem.indexOf(id);
    expect(pos("minha-conta-email-novo")).toBeGreaterThan(-1);
    if (pos("minha-conta-nome") >= 0) {
      expect(pos("minha-conta-nome")).toBeLessThan(pos("minha-conta-email-novo"));
      expect(pos("btn-salvar-nome")).toBe(pos("minha-conta-nome") + 1); // o botão (à direita) vem logo depois do campo
    }
    expect(pos("btn-salvar-email")).toBeLessThan(pos("minha-conta-senha-atual"));
    expect(pos("minha-conta-senha-atual")).toBeLessThan(pos("btn-redefinir-senha"));

    // Tab de verdade: do botão "Salvar nome" (se houver) o foco vai pro primeiro campo do E-mail.
    if (pos("btn-salvar-nome") >= 0) {
      await page.locator("#btn-salvar-nome").focus();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("minha-conta-email-novo");
    }
  });

  test("entre lg e xl (1100px): coluna única, largura máxima de 720px", async ({ page }) => {
    const cargo = cargoDeTeste();
    test.skip(!cargo, "defina as credenciais E2E de algum cargo");
    await page.setViewportSize({ width: 1100, height: 800 });
    await login(page, credenciais[cargo!].email, credenciais[cargo!].password);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    const c = await caixas(page, IDS_LAYOUT);
    const email = c["minha-conta-bloco-email"]!;
    const senha = c["minha-conta-bloco-senha"]!;
    expect(c["minha-conta-tab"]!.w).toBeLessThanOrEqual(720.5);
    expect(aprox(email.x, senha.x, 0.5)).toBe(true); // empilhados, não lado a lado
    expect(senha.y).toBeGreaterThan(email.y + email.h);
    // O Nome já vem numa linha só (campo + botão) a partir de lg.
    const botaoNome = c["btn-salvar-nome"];
    if (botaoNome) expect(aprox(botaoNome.y, c["minha-conta-nome"]!.y, 0.5)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("tablet (768px): NADA mudou — cartões de 720px empilhados, campos de 44px/16px, Nome em coluna", async ({ page }) => {
    const cargo = cargoDeTeste();
    test.skip(!cargo, "defina as credenciais E2E de algum cargo");
    await page.setViewportSize({ width: 768, height: 1024 });
    await login(page, credenciais[cargo!].email, credenciais[cargo!].password);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    const c = await caixas(page, IDS_LAYOUT);
    for (const id of ["minha-conta-bloco-nome", "minha-conta-bloco-email", "minha-conta-bloco-senha"]) {
      expect(c[id]!.w, id).toBeCloseTo(720, 0); // 768 − 2×24 de padding
    }
    expect(c["minha-conta-bloco-senha"]!.y).toBeGreaterThan(c["minha-conta-bloco-email"]!.y + c["minha-conta-bloco-email"]!.h);
    expect(c["minha-conta-nome"]!.h).toBeCloseTo(44, 0);
    expect(c["btn-salvar-email"]!.h).toBeCloseTo(44, 0);
    const botaoNome = c["btn-salvar-nome"];
    if (botaoNome) {
      expect(botaoNome.y).toBeGreaterThan(c["minha-conta-nome"]!.y + c["minha-conta-nome"]!.h); // botão ABAIXO do campo
      expect(botaoNome.w).toBeCloseTo(106, 0);
    }
    expect(await page.locator("#minha-conta-nome").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// ── Ações na conta: conta DESCARTÁVEL ───────────────────────────────────────

test.describe.serial("Minha conta — e-mail e senha (conta descartável)", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!temServiceRole, "precisa do .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY (Supabase local)");

  const sufixo = Date.now().toString(36);
  const SENHA_INICIAL = "SenhaInicial#2026";
  const SENHA_NOVA = "OutraSenha#2027";
  const emailInicial = `e2e+minhaconta-${sufixo}@farmaurora.com.br`;
  const emailNovo = `e2e+minhaconta-novo-${sufixo}@farmaurora.com.br`;
  let db: SupabaseClient;
  let contaId = "";

  test.beforeAll(async () => {
    db = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await db.auth.admin.createUser({
      email: emailInicial,
      password: SENHA_INICIAL,
      email_confirm: true,
      app_metadata: { role: "socio", nome: `TESTE Minha Conta ${sufixo}` },
    });
    if (error || !data.user) throw new Error(`Falha ao criar a conta descartável: ${error?.message}`);
    contaId = data.user.id;
  });

  test.afterAll(async () => {
    if (contaId) await db.auth.admin.deleteUser(contaId);
  });

  test("e-mail: erros de formulário aparecem inline e NÃO abrem o aviso nem chamam o servidor", async ({ page }) => {
    let chamadas = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/conta/email")) chamadas++;
    });
    await login(page, emailInicial, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await expect(page.locator("#minha-conta-email-atual")).toHaveText(emailInicial);
    await page.locator("#minha-conta-email-novo").fill(emailNovo);
    await page.locator("#minha-conta-email-confirmacao").fill(`outro-${emailNovo}`);
    await page.locator("#minha-conta-email-senha").fill(SENHA_INICIAL);
    await page.locator("#btn-salvar-email").click();

    await expect(page.locator("#minha-conta-erro-email")).toHaveText("Os e-mails não coincidem.");
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);

    // Igual ao e-mail atual.
    await page.locator("#minha-conta-email-novo").fill(emailInicial);
    await page.locator("#minha-conta-email-confirmacao").fill(emailInicial);
    await page.locator("#btn-salvar-email").click();
    await expect(page.locator("#minha-conta-erro-email")).toHaveText("Esse já é o e-mail da sua conta.");
    expect(chamadas).toBe(0);
  });

  test("e-mail: só envia depois do 'Confirmar' do aviso; 'Voltar' não envia nada", async ({ page }) => {
    const chamadas: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/conta/email")) chamadas.push(r.method());
    });
    await login(page, emailInicial, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await page.locator("#minha-conta-email-novo").fill(emailNovo.toUpperCase());
    await page.locator("#minha-conta-email-confirmacao").fill(emailNovo);
    await page.locator("#minha-conta-email-senha").fill(SENHA_INICIAL);
    await page.locator("#btn-salvar-email").click();

    const aviso = page.locator("#confirm-dialog-message");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(`Confirma que o e-mail ${emailNovo} está correto?`);
    await expect(aviso).toContainText("Se estiver errado, você pode perder o acesso à conta.");

    await page.locator("#btn-confirm-dialog-cancel").click();
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    expect(chamadas).toEqual([]);

    await page.locator("#btn-salvar-email").click();
    await page.locator("#btn-confirm-dialog-confirm").click();

    await expect(page.locator("#toast-notice")).toContainText("E-mail alterado");
    await expect(page.locator("#minha-conta-email-atual")).toHaveText(emailNovo);
    expect(chamadas).toEqual(["POST"]);
    // Campos sensíveis limpos.
    await expect(page.locator("#minha-conta-email-novo")).toHaveValue("");
    await expect(page.locator("#minha-conta-email-confirmacao")).toHaveValue("");
    await expect(page.locator("#minha-conta-email-senha")).toHaveValue("");

    // No Supabase: o e-mail mudou direto, já confirmado, sem e-mail pendente.
    const { data } = await db.auth.admin.getUserById(contaId);
    expect(data.user?.email).toBe(emailNovo);
    expect(data.user?.email_confirmed_at).toBeTruthy();
    expect(data.user?.new_email ?? null).toBeNull();
  });

  test("e-mail: senha atual errada → erro inline, e-mail digitado mantido, senha limpa, continua logado", async ({ page }) => {
    await login(page, emailNovo, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await page.locator("#minha-conta-email-novo").fill(`terceiro-${sufixo}@farmaurora.com.br`);
    await page.locator("#minha-conta-email-confirmacao").fill(`terceiro-${sufixo}@farmaurora.com.br`);
    await page.locator("#minha-conta-email-senha").fill("senha-errada-123");
    await page.locator("#btn-salvar-email").click();
    await page.locator("#btn-confirm-dialog-confirm").click();

    await expect(page.locator("#minha-conta-erro-email")).toHaveText("A senha atual está incorreta.");
    await expect(page.locator("#minha-conta-email-novo")).toHaveValue(`terceiro-${sufixo}@farmaurora.com.br`);
    await expect(page.locator("#minha-conta-email-senha")).toHaveValue("");
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  });

  test("senha: validações no cliente (curta, confirmação diferente) não chamam o servidor", async ({ page }) => {
    let chamadas = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/auth/conta/senha")) chamadas++;
    });
    await login(page, emailNovo, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await page.locator("#minha-conta-senha-atual").fill(SENHA_INICIAL);
    await page.locator("#minha-conta-senha-nova").fill("curta");
    await page.locator("#minha-conta-senha-confirmacao").fill("curta");
    await page.locator("#btn-redefinir-senha").click();
    await expect(page.locator("#minha-conta-erro-senha")).toContainText("pelo menos 8 caracteres");

    await page.locator("#minha-conta-senha-nova").fill(SENHA_NOVA);
    await page.locator("#minha-conta-senha-confirmacao").fill(`${SENHA_NOVA}x`);
    await page.locator("#btn-redefinir-senha").click();
    await expect(page.locator("#minha-conta-erro-senha")).toHaveText("As senhas não coincidem.");
    expect(chamadas).toBe(0);
  });

  test("senha: senha atual errada mostra o erro, limpa os campos e MANTÉM a pessoa logada", async ({ page }) => {
    await login(page, emailNovo, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await page.locator("#minha-conta-senha-atual").fill("senha-errada-123");
    await page.locator("#minha-conta-senha-nova").fill(SENHA_NOVA);
    await page.locator("#minha-conta-senha-confirmacao").fill(SENHA_NOVA);
    await page.locator("#btn-redefinir-senha").click();

    await expect(page.locator("#minha-conta-erro-senha")).toHaveText("A senha atual está incorreta.");
    for (const id of ["minha-conta-senha-atual", "minha-conta-senha-nova", "minha-conta-senha-confirmacao"]) {
      await expect(page.locator(`#${id}`)).toHaveValue("");
    }
    // Não foi deslogada: continua na página e a sessão segue válida.
    await expect(page).toHaveURL(/\/configuracoes/);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("senha: troca com a senha atual certa, avisa, limpa os campos e a nova senha passa a valer no login", async ({ page }) => {
    await login(page, emailNovo, SENHA_INICIAL);
    await abrirConfiguracoes(page, "?aba=minha-conta");

    await page.locator("#minha-conta-senha-atual").fill(SENHA_INICIAL);
    await page.locator("#minha-conta-senha-nova").fill(SENHA_NOVA);
    await page.locator("#minha-conta-senha-confirmacao").fill(SENHA_NOVA);
    await page.locator("#btn-redefinir-senha").click();

    await expect(page.locator("#toast-notice")).toContainText("Senha alterada");
    for (const id of ["minha-conta-senha-atual", "minha-conta-senha-nova", "minha-conta-senha-confirmacao"]) {
      await expect(page.locator(`#${id}`)).toHaveValue("");
    }
    // Sessão atual segue válida; e a senha nova entra num login do zero.
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    await login(page, emailNovo, SENHA_NOVA);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ── Sino → ?aba=contas ──────────────────────────────────────────────────────

test.describe.serial("Minha conta — link do sino abre a aba Contas", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!temServiceRole || !tem("administrador"), "defina E2E_ADMIN_* e o .env com a service role (Supabase local)");

  const NOTIF_ID = `TESTE_notif_minhaconta_${Date.now().toString(36)}`;
  const MENSAGEM = `TESTE minha conta — Fulano editou o nome ${Date.now().toString(36)}`;
  let tipoContaDisponivel = false;

  test.beforeAll(async () => {
    const db = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: users, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
    const adminId = users.users.find((u) => u.email === credenciais.administrador.email)?.id;
    if (!adminId) throw new Error(`Conta ${credenciais.administrador.email} não encontrada`);
    const { error: erroInsert } = await db.from("notificacoes").insert({
      id: NOTIF_ID,
      destinatario_id: adminId,
      tipo: "conta_editada",
      recado_id: null,
      mensagem: MENSAGEM,
      lida: false,
      created_at: new Date().toISOString(),
    });
    // Falha se o enum local ainda não tem 'conta_editada' (migration não aplicada): os testes pulam.
    tipoContaDisponivel = !erroInsert;
  });

  test.afterAll(async () => {
    const db = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await db.from("notificacoes").delete().eq("id", NOTIF_ID);
  });

  test("estando em Minha conta, clicar no aviso do sino leva à aba Contas (?aba=contas)", async ({ page }) => {
    test.skip(!tipoContaDisponivel, "enum tipo_notificacao sem 'conta_editada' neste Supabase de teste");
    await login(page, credenciais.administrador.email, credenciais.administrador.password);
    await abrirConfiguracoes(page); // aba padrão: Minha conta
    await expect(page.locator("#minha-conta-tab")).toBeVisible();

    await page.locator("#btn-notificacoes-fornecedor").click();
    await page.locator(`#notificacao-conta-${NOTIF_ID}`).click();

    await expect(page).toHaveURL(/\/configuracoes\?aba=contas$/);
    await expect(page.locator("#contas-tab")).toBeVisible();
    await expect(page.locator("#minha-conta-tab")).toHaveCount(0);
    await expect(page.locator("#tab-contas")).toHaveClass(/border-accent-dark/);
  });
});
