import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Configurações → Cadastros (Fornecedores, Despachantes, Temperaturas): só o administrador vê a aba e edita; todos os
// cargos leem a API. Remover = desativar (não existe exclusão); o nome não muda depois de criado.
//
// Credenciais por env (mesmos nomes de rbac.spec.ts); cada teste é pulado sem elas:
//   E2E_ADMIN_EMAIL / _PASSWORD, E2E_SOCIO_EMAIL / _PASSWORD,
//   E2E_OPERACIONAL_EMAIL / _PASSWORD, E2E_CONSULTOR_EMAIL / _PASSWORD
//
// ATENÇÃO: o fluxo CRIA itens. Como NÃO existe exclusão (nem para a service role: a migration só concede
// select/insert/update), os itens de teste ficam no banco do harness local, com nomes "TESTE e2e <timestamp>"
// (únicos, para não colidir com a unicidade por nome). Só roda no Supabase local do harness: a guarda
// tests/e2e/_guards/globalSetup.ts aborta a suíte se a URL do Supabase não for de loopback. Nunca contra produção.
// Pré-requisito: a migration supabase/migrations/*_cadastros.sql aplicada no Supabase local.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const socio = cred("SOCIO");
const operacional = cred("OPERACIONAL");
const consultor = cred("CONSULTOR");
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);

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

const nomeUnico = (rotulo: string) => `TESTE e2e ${rotulo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function apiCriar(req: APIRequestContext, lista: string, body: Record<string, unknown>) {
  const res = await req.post(`/api/cadastros/${lista}`, { data: body });
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function irParaCadastros(page: Page): Promise<void> {
  await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
  await expect(page.locator("#cadastros-tab")).toBeVisible();
}

async function escolherLista(page: Page, lista: "fornecedores" | "despachantes" | "temperaturas"): Promise<void> {
  await page.locator(`#cadastro-lista-escolha-${lista}`).click();
  await expect(page.locator(`#cadastro-lista-${lista}`)).toBeVisible();
}

async function abrirMenu(page: Page, lista: string, id: string): Promise<void> {
  await page.locator(`#btn-acoes-cadastro-${lista}-${id}`).click();
}

test.describe("Configurações → Cadastros (administrador)", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("1. a aba Cadastros aparece depois de Contas, com as 3 listas", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });
    const abas = page.locator("[id^='tab-']");
    await expect(abas).toHaveText(["Minha conta", "Contas", "Cadastros"]);

    await page.locator("#tab-cadastros").click();
    await expect(page).toHaveURL(/\/configuracoes\?aba=cadastros$/);
    await expect(page.locator("#cadastros-tab")).toBeVisible();
    for (const lista of ["fornecedores", "despachantes", "temperaturas"] as const) {
      await expect(page.locator(`#cadastro-lista-escolha-${lista}`)).toBeVisible();
    }
    await expect(page.locator("#cadastro-lista-fornecedores")).toBeVisible();
  });

  test("2. fornecedor: não salva sem decidir o alerta; cria com número de dias; edita (nome só leitura); desativa e reativa", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    const nome = nomeUnico("Fornecedor");

    await page.locator("#btn-novo-cadastro").click();
    await page.locator("#cadastro-form-nome").fill(nome);
    // Nada pré-selecionado: tenta salvar sem decidir.
    await expect(page.locator("#cadastro-form-alerta-dias")).not.toBeChecked();
    await expect(page.locator("#cadastro-form-alerta-sem")).not.toBeChecked();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("Defina o alerta");
    await expect(page.locator("#cadastro-form-overlay")).toBeVisible();

    await page.locator("label[for='cadastro-form-alerta-dias']").click();
    await page.locator("#cadastro-form-prazo").fill("400");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("1 a 365");
    await page.locator("#cadastro-form-prazo").fill("7");
    await page.locator("#cadastro-form-pais").fill("Japão");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-form-overlay")).toBeHidden();

    const linha = page.locator("#cadastro-lista-fornecedores tr", { hasText: nome });
    await expect(linha).toContainText("Japão");
    await expect(linha).toContainText("7 dias");
    await expect(linha).toContainText("Ativo");

    // Editar: o nome é só leitura.
    const id = (await linha.getAttribute("id"))!.replace("cadastro-row-fornecedores-", "");
    await abrirMenu(page, "fornecedores", id);
    await page.locator(`#btn-editar-cadastro-fornecedores-${id}`).click();
    await expect(page.locator("#cadastro-form-nome")).toHaveCount(0);
    await expect(page.locator("#cadastro-form-nome-leitura")).toHaveText(nome);
    await page.locator("label[for='cadastro-form-alerta-sem']").click();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-form-overlay")).toBeHidden();
    await expect(linha).toContainText("Sem alerta");

    // Desativar (com confirmação): continua na lista, marcado (inativo).
    await abrirMenu(page, "fornecedores", id);
    await page.locator(`#btn-desativar-cadastro-fornecedores-${id}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(linha).toContainText("(inativo)");
    await expect(linha).toContainText("Inativo");

    // Criar de novo o mesmo nome: avisa e oferece Reativar (não cria outro).
    await page.locator("#btn-novo-cadastro").click();
    await page.locator("#cadastro-form-nome").fill(nome.toLowerCase());
    await expect(page.locator("#cadastro-form-aviso-duplicado")).toContainText("Reative-o");
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled();
    await page.locator("#btn-cadastro-reativar-duplicado").click();
    await expect(page.locator("#cadastro-form-overlay")).toBeHidden();
    await expect(linha).toContainText("Ativo");
    await expect(linha).not.toContainText("(inativo)");
  });

  test("3. despachante (empresa com contato) e temperatura (só desativar/reativar, sem Editar)", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);

    await escolherLista(page, "despachantes");
    const empresa = nomeUnico("Despachante");
    await page.locator("#btn-novo-cadastro").click();
    await page.locator("#cadastro-form-nome").fill(empresa);
    await page.locator("#cadastro-form-email").fill("sem-arroba");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("e-mail");
    await page.locator("#cadastro-form-email").fill("contato@teste.com");
    await page.locator("#cadastro-form-telefone").fill("11 3333-4444");
    await page.locator("#cadastro-form-contato").fill("Fulano de Teste");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-form-overlay")).toBeHidden();
    const linhaDesp = page.locator("#cadastro-lista-despachantes tr", { hasText: empresa });
    await expect(linhaDesp).toContainText("Fulano de Teste");
    await expect(linhaDesp).toContainText("contato@teste.com");

    await escolherLista(page, "temperaturas");
    const temperatura = nomeUnico("Temperatura");
    await page.locator("#btn-novo-cadastro").click();
    await page.locator("#cadastro-form-nome").fill(temperatura);
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-form-overlay")).toBeHidden();
    const linhaTemp = page.locator("#cadastro-lista-temperaturas tr", { hasText: temperatura });
    await expect(linhaTemp).toBeVisible();
    const id = (await linhaTemp.getAttribute("id"))!.replace("cadastro-row-temperaturas-", "");
    await abrirMenu(page, "temperaturas", id);
    await expect(page.locator(`#btn-editar-cadastro-temperaturas-${id}`)).toHaveCount(0);
    await expect(page.locator(`#btn-desativar-cadastro-temperaturas-${id}`)).toBeVisible();
  });

  test('4. nome "Outro" é recusado na tela e na API; duplicado vira 409; nome não muda (422); não existe DELETE', async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    await escolherLista(page, "temperaturas");
    await page.locator("#btn-novo-cadastro").click();
    await page.locator("#cadastro-form-nome").fill("outro");
    await expect(page.locator("#cadastro-form-aviso-reservado")).toBeVisible();
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled();

    const req = page.request;
    expect((await apiCriar(req, "temperaturas", { nome: "OUTRO" })).status).toBe(400);

    const nome = nomeUnico("Api");
    const criado = await apiCriar(req, "temperaturas", { nome });
    expect(criado.status).toBe(200);
    const id = String(criado.json.id);
    expect((await apiCriar(req, "temperaturas", { nome: nome.toLowerCase() })).status).toBe(409);

    const trocaNome = await req.patch(`/api/cadastros/temperaturas/${id}`, { data: { nome: `${nome} X` } });
    expect(trocaNome.status()).toBe(422);
    expect(((await trocaNome.json()) as { statusMessage?: string; message?: string }).statusMessage ?? "").toMatch(/nome não pode/i);

    const semDelete = await req.delete(`/api/cadastros/temperaturas/${id}`);
    expect(semDelete.status()).toBeGreaterThanOrEqual(400);
    const lista = (await (await req.get("/api/cadastros/temperaturas")).json()) as Array<{ id: string; nome: string }>;
    expect(lista.find((i) => i.id === id)?.nome).toBe(nome);
  });

  test("5. a API ordena ativos primeiro e inativos depois, e devolve `ativo`", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const a = await apiCriar(req, "temperaturas", { nome: nomeUnico("Ordem A") });
    await req.patch(`/api/cadastros/temperaturas/${String(a.json.id)}`, { data: { ativo: false } });
    await apiCriar(req, "temperaturas", { nome: nomeUnico("Ordem B") });
    const lista = (await (await req.get("/api/cadastros/temperaturas")).json()) as Array<{ ativo: boolean }>;
    const primeiroInativo = lista.findIndex((i) => !i.ativo);
    expect(primeiroInativo).toBeGreaterThan(-1);
    expect(lista.slice(primeiroInativo).every((i) => !i.ativo)).toBe(true);
    expect(lista.slice(0, primeiroInativo).every((i) => i.ativo)).toBe(true);
  });
});

for (const [rotulo, conta] of [
  ["sócio", socio],
  ["operacional", operacional],
  ["consultor", consultor],
] as const) {
  test.describe(`Cadastros — ${rotulo}: lê a API, não vê a aba e não escreve`, () => {
    test.describe.configure({ retries: 2 });
    test.skip(!tem(conta), `defina E2E_${rotulo === "sócio" ? "SOCIO" : rotulo.toUpperCase()}_EMAIL / _PASSWORD`);

    test(`a aba Cadastros não existe para o ${rotulo}; ?aba=cadastros cai em Minha conta`, async ({ page }) => {
      await login(page, conta.email, conta.password);
      await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
      await expect(page.locator("#tab-minha-conta")).toBeVisible();
      await expect(page.locator("#tab-cadastros")).toHaveCount(0);
      await expect(page.locator("#cadastros-tab")).toHaveCount(0);
    });

    test(`o ${rotulo} lê as 3 listas (200) e leva 403 ao criar e ao alterar`, async ({ page }) => {
      await login(page, conta.email, conta.password);
      const req = page.request;
      for (const lista of ["fornecedores", "despachantes", "temperaturas"]) {
        const res = await req.get(`/api/cadastros/${lista}`);
        expect(res.status(), `GET ${lista}`).toBe(200);
        expect(Array.isArray(await res.json())).toBe(true);
      }
      expect((await apiCriar(req, "temperaturas", { nome: nomeUnico("Proibido") })).status).toBe(403);
      expect((await req.patch("/api/cadastros/temperaturas/qualquer", { data: { ativo: false } })).status()).toBe(403);
    });
  });
}
