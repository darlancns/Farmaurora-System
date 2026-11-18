import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Configurações → Cadastros (Fornecedores, Despachantes, Transportadoras, Cias aéreas): só o administrador vê a aba e
// edita; todos os cargos leem a API (a chave PIX só vai para o administrador e para quem lê Pagamentos). A tela tem QUATRO
// seções recolhíveis, todas fechadas ao abrir; busca por nome no topo; painel lateral de criar/editar; chave "Ativo" que
// aplica na hora com "Desativado. Desfazer". Remover = desativar (não existe exclusão); o nome não muda depois de criado.
//
// ESCRITO, NÃO EXECUTADO nesta rodada (a integração local aponta para produção; o e2e só roda no Supabase falso local).
//
// Credenciais por env (mesmos nomes de rbac.spec.ts); cada teste é pulado sem elas:
//   E2E_ADMIN_EMAIL / _PASSWORD, E2E_SOCIO_EMAIL / _PASSWORD,
//   E2E_OPERACIONAL_EMAIL / _PASSWORD, E2E_CONSULTOR_EMAIL / _PASSWORD
//
// ATENÇÃO: o fluxo CRIA itens. Como NÃO existe exclusão (nem para a service role: a migration só concede
// select/insert/update), os itens de teste ficam no banco do harness local, com nomes "TESTE e2e <timestamp>"
// (únicos, para não colidir com a unicidade por nome). Só roda no Supabase local do harness: a guarda
// tests/e2e/_guards/globalSetup.ts aborta a suíte se a URL do Supabase não for de loopback. Nunca contra produção.
// Pré-requisito: as migrations supabase/migrations/*_cadastros.sql e *_cadastros_transportadoras_pix.sql aplicadas no
// Supabase local. As chaves PIX usadas aqui são FICTÍCIAS e nunca são impressas.

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
const pixFicticio = () => `e2e-chave-ficticia-${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function apiCriar(req: APIRequestContext, lista: string, body: Record<string, unknown>) {
  const res = await req.post(`/api/cadastros/${lista}`, { data: body });
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function irParaCadastros(page: Page): Promise<void> {
  await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
  await expect(page.locator("#cadastros-tab")).toBeVisible();
}

const LISTAS = ["fornecedores", "despachantes", "transportadoras", "cias-aereas"] as const;

/** Abre a seção (se estiver fechada) e devolve o botão do título. */
async function abrirSecao(page: Page, lista: (typeof LISTAS)[number]): Promise<void> {
  const titulo = page.locator(`#btn-secao-${lista}`);
  if ((await titulo.getAttribute("aria-expanded")) !== "true") await titulo.click();
  await expect(titulo).toHaveAttribute("aria-expanded", "true");
}

const linhaDe = (page: Page, lista: string, nome: string) => page.locator(`#cadastro-lista-${lista} tr`, { hasText: nome });

test.describe("Configurações → Cadastros (administrador)", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("1. a aba Cadastros aparece depois de Contas, com 4 seções recolhíveis, todas FECHADAS (sem abas internas)", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });
    await expect(page.locator("[id^='tab-']")).toHaveText(["Minha conta", "Contas", "Cadastros"]);

    await page.locator("#tab-cadastros").click();
    await expect(page).toHaveURL(/\/configuracoes\?aba=cadastros$/);
    await expect(page.locator("#cadastros-tab")).toBeVisible();
    const secoes = page.locator("#cadastros-tab > section");
    await expect(secoes).toHaveCount(4);
    await expect(secoes.locator("h2")).toHaveText(["Fornecedores", "Despachantes", "Transportadoras", "Cias aéreas"]);
    for (const lista of LISTAS) {
      await expect(page.locator(`#btn-secao-${lista}`)).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(`#btn-secao-${lista}`)).toHaveAttribute("aria-controls", `cadastro-corpo-${lista}`);
      await expect(page.locator(`#cadastro-corpo-${lista}`)).toBeHidden();
      await expect(page.locator(`#btn-adicionar-cadastro-${lista}`)).toHaveText("+ Adicionar");
      await expect(page.locator(`#cadastro-contagem-${lista}`)).toHaveText(/^\d+ · \d+ ativos?$/);
    }
    await expect(page.locator("#cadastro-lista-escolha")).toHaveCount(0);

    // Abrir e fechar pelo título.
    await page.locator("#btn-secao-cias-aereas").click();
    await expect(page.locator("#cadastro-corpo-cias-aereas")).toBeVisible();
    await page.locator("#btn-secao-cias-aereas").click();
    await expect(page.locator("#cadastro-corpo-cias-aereas")).toBeHidden();
  });

  test("2. busca por nome: abre só as seções com resultado e destaca a contagem encontrada", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const nome = nomeUnico("Busca");
    expect((await apiCriar(page.request, "transportadoras", { nome })).status).toBe(200);
    await irParaCadastros(page);

    await page.locator("#cadastros-busca").fill(nome.toUpperCase());
    await expect(page.locator("#btn-secao-transportadoras")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#btn-secao-fornecedores")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#cadastro-contagem-transportadoras")).toHaveText("1 encontrado");
    await expect(page.locator("#cadastro-contagem-fornecedores")).toHaveText("0 encontrados");
    await expect(page.locator("#cadastros-busca-resumo")).toHaveText("1 encontrado em 1 lista.");
    await expect(linhaDe(page, "transportadoras", nome)).toBeVisible();

    await page.locator("#cadastros-busca").fill("zzz-nao-existe-zzz");
    await expect(page.locator("#cadastros-busca-resumo")).toHaveText("Nenhum item encontrado.");

    await page.locator("#btn-cadastros-busca-limpar").click();
    await expect(page.locator("#cadastros-busca")).toHaveValue("");
    await expect(page.locator("#btn-secao-transportadoras")).toHaveAttribute("aria-expanded", "false");
  });

  test("3. fornecedor: não salva sem decidir o alerta; cria; edita no painel (nome desabilitado); desativa e reativa", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    const nome = nomeUnico("Fornecedor");

    await page.locator("#btn-adicionar-cadastro-fornecedores").click();
    await expect(page.locator("#cadastro-painel")).toBeVisible();
    await page.locator("#cadastro-form-nome").fill(nome);
    // Nada pré-selecionado: tenta salvar sem decidir.
    await expect(page.locator("#cadastro-form-alerta-dias")).not.toBeChecked();
    await expect(page.locator("#cadastro-form-alerta-sem")).not.toBeChecked();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("Defina o alerta");
    await expect(page.locator("#cadastro-painel")).toBeVisible();

    await page.locator("label[for='cadastro-form-alerta-dias']").click();
    await page.locator("#cadastro-form-prazo").fill("400");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("1 a 365");
    await page.locator("#cadastro-form-prazo").fill("7");
    await page.locator("#cadastro-form-pais").fill("Japão");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();

    // A seção abre sozinha depois de criar, e o item aparece.
    await expect(page.locator("#btn-secao-fornecedores")).toHaveAttribute("aria-expanded", "true");
    const linha = linhaDe(page, "fornecedores", nome);
    await expect(linha).toContainText("Japão");
    await expect(linha).toContainText("7 dias");
    const id = (await linha.getAttribute("id"))!.replace("cadastro-row-fornecedores-", "");

    // Editar: clicar na linha abre o painel; o nome fica desabilitado, com a dica.
    await linha.click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Editar fornecedor");
    await expect(page.locator("#cadastro-form-nome")).toBeDisabled();
    await expect(page.locator("#cadastro-form-nome")).toHaveValue(nome);
    await expect(page.locator("#cadastro-form-nome-dica")).toContainText("não pode ser alterado");
    await page.locator("label[for='cadastro-form-alerta-sem']").click();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(linha).toContainText("Sem alerta");
    // O foco volta para a linha (o botão do nome).
    await expect(page.locator(`#cadastro-abrir-fornecedores-${id}`)).toBeFocused();

    // Desativar pela chave: na hora, sem janela de confirmação; aviso com Desfazer.
    const chave = page.locator(`#cadastro-switch-fornecedores-${id}`);
    await expect(chave).toHaveAttribute("aria-label", `Ativo: ${nome}`);
    await chave.click();
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    await expect(page.locator("#cadastro-desfazer")).toContainText("Desativado.");
    await expect(linha).toContainText("(inativo)");
    await expect(chave).toHaveAttribute("aria-checked", "false");
    // Desfazer reativa.
    await page.locator("#btn-cadastro-desfazer").click();
    await expect(chave).toHaveAttribute("aria-checked", "true");
    await expect(linha).not.toContainText("(inativo)");
    await expect(page.locator("#toast-notice")).toContainText("Reativado.");

    // Desativa de novo e tenta criar o mesmo nome: avisa e oferece Reativar (não cria outro).
    await chave.click();
    await expect(linha).toContainText("(inativo)");
    await page.locator("#btn-adicionar-cadastro-fornecedores").click();
    await page.locator("#cadastro-form-nome").fill(nome.toLowerCase());
    await expect(page.locator("#cadastro-form-aviso-duplicado")).toContainText("Reative-o");
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled();
    await page.locator("#btn-cadastro-reativar-duplicado").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(linha).not.toContainText("(inativo)");
  });

  test("4. despachante com chave PIX: campo oculto no painel, coluna só diz 'Cadastrada', a chave nunca aparece na tela", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    const empresa = nomeUnico("Despachante");
    const pix = pixFicticio();

    await page.locator("#btn-adicionar-cadastro-despachantes").click();
    await page.locator("#cadastro-form-nome").fill(empresa);
    await page.locator("#cadastro-form-email").fill("sem-arroba");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("e-mail");
    await page.locator("#cadastro-form-email").fill("contato@teste.com");
    await page.locator("#cadastro-form-telefone").fill("11 3333-4444");
    await page.locator("#cadastro-form-contato").fill("Fulano de Teste");
    // A chave PIX nasce oculta (password); Mostrar revela só dentro do campo.
    const campoPix = page.locator("#cadastro-form-pix");
    await expect(campoPix).toHaveAttribute("type", "password");
    await campoPix.fill(pix);
    await page.locator("#btn-cadastro-pix-mostrar").click();
    await expect(campoPix).toHaveAttribute("type", "text");
    await expect(page.locator("#btn-cadastro-pix-mostrar")).toHaveText("Ocultar");
    await page.locator("#btn-cadastro-pix-mostrar").click();
    await expect(campoPix).toHaveAttribute("type", "password");
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();

    const linha = linhaDe(page, "despachantes", empresa);
    await expect(linha).toContainText("Fulano de Teste");
    await expect(linha).toContainText("contato@teste.com");
    await expect(linha).toContainText("Cadastrada");
    // A chave nunca aparece como texto da página (nem em toast).
    expect(await page.locator("body").innerText()).not.toContain(pix);

    // Reabrir: a chave vem preenchida (oculta); limpar com vazio grava NULL e a coluna volta a "—".
    await linha.click();
    await expect(page.locator("#cadastro-form-pix")).toHaveValue(pix);
    await page.locator("#cadastro-form-pix").fill("");
    await expect(page.locator("#btn-cadastro-pix-copiar")).toBeDisabled();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(linha).not.toContainText("Cadastrada");
  });

  test("5. transportadora (nome + chave PIX) e cia aérea (só desativar/reativar; o painel só mostra o nome)", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);

    const transp = nomeUnico("Transportadora");
    await page.locator("#btn-adicionar-cadastro-transportadoras").click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Nova transportadora");
    await page.locator("#cadastro-form-nome").fill(transp);
    await page.locator("#btn-cadastro-salvar").click(); // chave PIX é opcional
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    const linhaTransp = linhaDe(page, "transportadoras", transp);
    await expect(linhaTransp).toBeVisible();
    await expect(linhaTransp).not.toContainText("Cadastrada");

    const cia = nomeUnico("Cia");
    await page.locator("#btn-adicionar-cadastro-cias-aereas").click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Nova cia aérea");
    await page.locator("#cadastro-form-nome").fill(cia);
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    const linhaCia = linhaDe(page, "cias-aereas", cia);
    await expect(linhaCia).toBeVisible();
    await linhaCia.click();
    await expect(page.locator("#cadastro-form-so-nome")).toContainText("chave Ativo");
    await expect(page.locator("#btn-cadastro-salvar")).toHaveCount(0);
    await page.locator("#btn-cadastro-cancelar").click(); // vira "Fechar"
    await expect(page.locator("#cadastro-painel")).toBeHidden();
  });

  test('6. nome "Outro" é recusado na tela e na API; duplicado vira 409; nome não muda (422); não existe DELETE', async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    await page.locator("#btn-adicionar-cadastro-transportadoras").click();
    await page.locator("#cadastro-form-nome").fill("outro");
    await expect(page.locator("#cadastro-form-aviso-reservado")).toBeVisible();
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled();

    const req = page.request;
    expect((await apiCriar(req, "transportadoras", { nome: "OUTRO" })).status).toBe(400);

    const nome = nomeUnico("Api");
    const criado = await apiCriar(req, "transportadoras", { nome });
    expect(criado.status).toBe(200);
    const id = String(criado.json.id);
    expect((await apiCriar(req, "transportadoras", { nome: nome.toLowerCase() })).status).toBe(409);

    const trocaNome = await req.patch(`/api/cadastros/transportadoras/${id}`, { data: { nome: `${nome} X` } });
    expect(trocaNome.status()).toBe(422);
    expect(((await trocaNome.json()) as { statusMessage?: string; message?: string }).statusMessage ?? "").toMatch(/nome não pode/i);

    const semDelete = await req.delete(`/api/cadastros/transportadoras/${id}`);
    expect(semDelete.status()).toBeGreaterThanOrEqual(400);
    const lista = (await (await req.get("/api/cadastros/transportadoras")).json()) as Array<{ id: string; nome: string }>;
    expect(lista.find((i) => i.id === id)?.nome).toBe(nome);
  });

  test("7. a API ordena ativos primeiro e inativos depois, e devolve `ativo`", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const a = await apiCriar(req, "cias-aereas", { nome: nomeUnico("Ordem A") });
    await req.patch(`/api/cadastros/cias-aereas/${String(a.json.id)}`, { data: { ativo: false } });
    await apiCriar(req, "cias-aereas", { nome: nomeUnico("Ordem B") });
    const lista = (await (await req.get("/api/cadastros/cias-aereas")).json()) as Array<{ ativo: boolean }>;
    const primeiroInativo = lista.findIndex((i) => !i.ativo);
    expect(primeiroInativo).toBeGreaterThan(-1);
    expect(lista.slice(primeiroInativo).every((i) => !i.ativo)).toBe(true);
    expect(lista.slice(0, primeiroInativo).every((i) => i.ativo)).toBe(true);
  });

  test("8. API: o administrador recebe `chavePix` (despachantes e transportadoras); grava, troca e limpa com ''; 140 no máximo", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const pix = pixFicticio();
    const criado = await apiCriar(req, "transportadoras", { nome: nomeUnico("ApiPix"), chavePix: `  ${pix}  ` });
    expect(criado.status).toBe(200);
    expect(criado.json.chavePix).toBe(pix); // aparada
    const id = String(criado.json.id);

    const lista = (await (await req.get("/api/cadastros/transportadoras")).json()) as Array<Record<string, unknown>>;
    expect(lista.find((i) => i.id === id)).toHaveProperty("chavePix", pix);

    const limpa = await req.patch(`/api/cadastros/transportadoras/${id}`, { data: { chavePix: "" } });
    expect(limpa.status()).toBe(200);
    expect(((await limpa.json()) as { chavePix?: string }).chavePix).toBe("");

    const longa = await req.patch(`/api/cadastros/transportadoras/${id}`, { data: { chavePix: "x".repeat(141) } });
    expect(longa.status()).toBe(400);
    expect(await longa.text()).not.toContain("xxxxxxxxxx"); // a mensagem de erro não repete a chave

    // Fornecedores e cias aéreas nunca têm a propriedade.
    for (const l of ["fornecedores", "cias-aereas"]) {
      const itens = (await (await req.get(`/api/cadastros/${l}`)).json()) as Array<Record<string, unknown>>;
      for (const item of itens) expect(item, l).not.toHaveProperty("chavePix");
    }
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

    test(`o ${rotulo} lê as 4 listas (200) e leva 403 ao criar e ao alterar, inclusive com chave PIX`, async ({ page }) => {
      await login(page, conta.email, conta.password);
      const req = page.request;
      for (const lista of LISTAS) {
        const res = await req.get(`/api/cadastros/${lista}`);
        expect(res.status(), `GET ${lista}`).toBe(200);
        expect(Array.isArray(await res.json())).toBe(true);
      }
      expect((await apiCriar(req, "cias-aereas", { nome: nomeUnico("Proibido") })).status).toBe(403);
      expect((await apiCriar(req, "transportadoras", { nome: nomeUnico("Proibido"), chavePix: pixFicticio() })).status).toBe(403);
      expect((await req.patch("/api/cadastros/cias-aereas/qualquer", { data: { ativo: false } })).status()).toBe(403);
      expect((await req.patch("/api/cadastros/despachantes/qualquer", { data: { chavePix: "" } })).status()).toBe(403);
    });
  });
}

test.describe("Cadastros — consultor: a chave PIX NÃO existe na resposta", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!tem(consultor), "defina E2E_CONSULTOR_EMAIL / _PASSWORD");

  test("despachantes e transportadoras vêm sem a propriedade chavePix (nem null)", async ({ page }) => {
    await login(page, consultor.email, consultor.password);
    for (const lista of ["despachantes", "transportadoras"]) {
      const res = await page.request.get(`/api/cadastros/${lista}`);
      expect(res.status()).toBe(200);
      const itens = (await res.json()) as Array<Record<string, unknown>>;
      for (const item of itens) expect(item, lista).not.toHaveProperty("chavePix");
      expect(JSON.stringify(itens)).not.toContain("chavePix");
    }
  });
});
