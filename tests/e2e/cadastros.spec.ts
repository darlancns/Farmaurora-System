import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Configurações → Cadastros (Fornecedores, Despachantes, Transportadoras, Cias aéreas, Consultores, Temperaturas e Medicamentos): só o administrador vê a aba e
// edita; todos os cargos leem a API (a chave PIX só vai para o administrador e para quem lê Pagamentos). A tela tem SETE
// seções recolhíveis, todas fechadas ao abrir (as linhas só existem no DOM com a seção aberta, em páginas de 50); busca por nome no topo; painel lateral de criar/editar; chave "Ativo" que
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
// Pré-requisito: as migrations supabase/migrations/*_cadastros.sql e *_cadastros_transportadoras_pix.sql, *_cadastro_consultores.sql e
// *_cadastro_temperaturas_medicamentos.sql aplicadas no Supabase local. As chaves PIX usadas aqui são FICTÍCIAS e nunca são impressas.

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

const LISTAS = ["fornecedores", "despachantes", "transportadoras", "cias-aereas", "consultores", "temperaturas", "medicamentos"] as const;

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

  test("1. a aba Cadastros aparece depois de Contas, com 7 seções recolhíveis, todas FECHADAS (sem abas internas)", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await page.goto("/configuracoes", { waitUntil: "networkidle" });
    await expect(page.locator("[id^='tab-']")).toHaveText(["Minha conta", "Contas", "Cadastros"]);

    await page.locator("#tab-cadastros").click();
    await expect(page).toHaveURL(/\/configuracoes\?aba=cadastros$/);
    await expect(page.locator("#cadastros-tab")).toBeVisible();
    const secoes = page.locator("#cadastros-tab > section");
    await expect(secoes).toHaveCount(LISTAS.length);
    await expect(secoes.locator("h2")).toHaveText([
      "Fornecedores",
      "Despachantes",
      "Transportadoras",
      "Cias aéreas",
      "Consultores",
      "Temperaturas",
      "Medicamentos",
    ]);
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

  test("9. temperatura: cria pela tela; o painel só mostra o nome (que não muda); desativa pela chave; duplicado 409; nome não muda (422)", async ({ page }) => {
    await login(page, admin.email, admin.password);
    await irParaCadastros(page);
    const nome = nomeUnico("Temp");

    await page.locator("#btn-adicionar-cadastro-temperaturas").click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Nova temperatura");
    await page.locator("#cadastro-form-nome").fill(nome);
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(page.locator("#btn-secao-temperaturas")).toHaveAttribute("aria-expanded", "true");
    const linha = linhaDe(page, "temperaturas", nome);
    await expect(linha).toBeVisible();
    const id = (await linha.getAttribute("id"))!.replace("cadastro-row-temperaturas-", "");

    await linha.click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Editar temperatura");
    await expect(page.locator("#cadastro-form-nome")).toBeDisabled();
    await expect(page.locator("#cadastro-form-so-nome")).toContainText("chave Ativo");
    await expect(page.locator("#btn-cadastro-salvar")).toHaveCount(0);
    await page.locator("#btn-cadastro-cancelar").click(); // vira "Fechar"
    await expect(page.locator("#cadastro-painel")).toBeHidden();

    const chave = page.locator(`#cadastro-switch-temperaturas-${id}`);
    await chave.click();
    await expect(linha).toContainText("(inativo)");
    await page.locator("#btn-cadastro-desfazer").click();
    await expect(chave).toHaveAttribute("aria-checked", "true");

    const req = page.request;
    expect((await apiCriar(req, "temperaturas", { nome: nome.toLowerCase() })).status).toBe(409);
    expect((await apiCriar(req, "temperaturas", { nome: "OUTRO" })).status).toBe(400);
    const trocaNome = await req.patch(`/api/cadastros/temperaturas/${id}`, { data: { nome: `${nome} X` } });
    expect(trocaNome.status()).toBe(422);
  });

  test("10. medicamento pela tela: nome em MAIÚSCULAS, temperatura só entre as ATIVAS, duplicado com Reativar, renomear e desativar", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const temp = nomeUnico("TempMed");
    const tempInativa = nomeUnico("TempInativa");
    expect((await apiCriar(req, "temperaturas", { nome: temp })).status).toBe(200);
    const inativa = await apiCriar(req, "temperaturas", { nome: tempInativa });
    await req.patch(`/api/cadastros/temperaturas/${String(inativa.json.id)}`, { data: { ativo: false } });
    await irParaCadastros(page);
    const nome = nomeUnico("Medicamento").toUpperCase();
    const opcao = (texto: string) => page.locator("#cadastro-form-temperatura-listbox [role=option]", { hasText: texto });

    await page.locator("#btn-adicionar-cadastro-medicamentos").click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Novo medicamento");
    // Digitar em minúsculas: o campo converte para MAIÚSCULAS.
    await page.locator("#cadastro-form-nome").fill(nome.toLowerCase());
    await expect(page.locator("#cadastro-form-nome")).toHaveValue(nome);
    // Sem temperatura não salva (aviso por toast, o painel continua aberto).
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#toast-notice")).toContainText("Informe a temperatura.");
    await expect(page.locator("#cadastro-painel")).toBeVisible();
    // O select oferece a temperatura ativa e NÃO oferece a inativa.
    await page.locator("#cadastro-form-temperatura").click();
    await expect(opcao(temp)).toBeVisible();
    await expect(opcao(tempInativa)).toHaveCount(0);
    await opcao(temp).click();
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();

    const linha = linhaDe(page, "medicamentos", nome);
    await expect(linha).toContainText(temp);
    const id = (await linha.getAttribute("id"))!.replace("cadastro-row-medicamentos-", "");

    // Desativar pela chave e tentar criar de novo o mesmo nome: avisa e oferece Reativar.
    await page.locator(`#cadastro-switch-medicamentos-${id}`).click();
    await expect(linha).toContainText("(inativo)");
    await page.locator("#btn-adicionar-cadastro-medicamentos").click();
    await page.locator("#cadastro-form-nome").fill(nome.toLowerCase());
    await expect(page.locator("#cadastro-form-aviso-duplicado")).toContainText("Reative-o");
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled();
    await page.locator("#btn-cadastro-reativar-duplicado").click();
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(linha).not.toContainText("(inativo)");

    // Renomear: o nome é editável, a dica diz que só muda este cadastro e NÃO há janela de confirmação de consultor.
    await linha.click();
    await expect(page.locator("#cadastro-painel-titulo")).toHaveText("Editar medicamento");
    await expect(page.locator("#cadastro-form-nome")).toBeEnabled();
    await expect(page.locator("#cadastro-form-nome-dica")).toContainText("muda só este cadastro");
    await expect(page.locator("#btn-cadastro-salvar")).toBeDisabled(); // nada mudou
    const novoNome = `${nome} RENOMEADO`;
    await page.locator("#cadastro-form-nome").fill(novoNome.toLowerCase());
    await page.locator("#btn-cadastro-salvar").click();
    await expect(page.locator("#confirm-dialog-overlay")).toHaveCount(0);
    await expect(page.locator("#cadastro-painel")).toBeHidden();
    await expect(linhaDe(page, "medicamentos", novoNome)).toBeVisible();
  });

  test("11. API de medicamentos: MAIÚSCULAS, temperatura ativa (422), duplicado 409, renomear (409 se for de outro), rotas de consultor são 404", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const temp = nomeUnico("TempApi");
    const tempInativa = nomeUnico("TempApiInativa");
    expect((await apiCriar(req, "temperaturas", { nome: temp })).status).toBe(200);
    const inativa = await apiCriar(req, "temperaturas", { nome: tempInativa });
    await req.patch(`/api/cadastros/temperaturas/${String(inativa.json.id)}`, { data: { ativo: false } });

    const nome = nomeUnico("MedApi");
    const criado = await apiCriar(req, "medicamentos", { nome, temperatura: temp });
    expect(criado.status).toBe(200);
    expect(criado.json.nome).toBe(nome.toUpperCase());
    expect(criado.json.temperatura).toBe(temp);
    const id = String(criado.json.id);

    // Temperatura que não existe e temperatura inativa: 422; sem temperatura: 400.
    expect((await apiCriar(req, "medicamentos", { nome: nomeUnico("MedSemTemp"), temperatura: "-999°C inexistente" })).status).toBe(422);
    expect((await apiCriar(req, "medicamentos", { nome: nomeUnico("MedInativa"), temperatura: tempInativa })).status).toBe(422);
    expect((await apiCriar(req, "medicamentos", { nome: nomeUnico("MedSemCampo") })).status).toBe(400);
    expect((await apiCriar(req, "medicamentos", { nome: nome.toLowerCase(), temperatura: temp })).status).toBe(409);

    // Renomear: um UPDATE só; nome de OUTRO medicamento é 409.
    const outro = await apiCriar(req, "medicamentos", { nome: nomeUnico("MedOutro"), temperatura: temp });
    const renomeado = await req.patch(`/api/cadastros/medicamentos/${id}`, { data: { nome: `${nome} v2` } });
    expect(renomeado.status()).toBe(200);
    expect(((await renomeado.json()) as { nome: string }).nome).toBe(`${nome} v2`.toUpperCase());
    const tomado = await req.patch(`/api/cadastros/medicamentos/${id}`, { data: { nome: String(outro.json.nome).toLowerCase() } });
    expect(tomado.status()).toBe(409);
    // Trocar para temperatura inativa: 422.
    const paraInativa = await req.patch(`/api/cadastros/medicamentos/${id}`, { data: { temperatura: tempInativa } });
    expect(paraInativa.status()).toBe(422);

    // As rotas de impacto e de renomear contas são SÓ dos consultores.
    expect((await req.get(`/api/cadastros/medicamentos/${id}/impacto`)).status()).toBe(404);
    expect((await req.post(`/api/cadastros/medicamentos/${id}/renomear-contas`, { data: { nomeAntigo: "X" } })).status()).toBe(404);
    expect((await req.delete(`/api/cadastros/medicamentos/${id}`)).status()).toBeGreaterThanOrEqual(400);
  });

  test("12. com mais de 50 medicamentos: a seção desenha 50 por vez e 'Mostrar mais (N de M)' soma outra página; fechar volta aos 50", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const req = page.request;
    const temp = nomeUnico("TempPag");
    expect((await apiCriar(req, "temperaturas", { nome: temp })).status).toBe(200);
    // Completa até 51 medicamentos (no banco local, que não apaga nada: só cria os que faltam).
    const existentes = (await (await req.get("/api/cadastros/medicamentos")).json()) as unknown[];
    for (let i = existentes.length; i < 51; i++) {
      expect((await apiCriar(req, "medicamentos", { nome: nomeUnico(`MedPag${i}`), temperatura: temp })).status).toBe(200);
    }
    const total = ((await (await req.get("/api/cadastros/medicamentos")).json()) as unknown[]).length;
    await irParaCadastros(page);

    // Fechada: nenhuma linha no DOM (o corpo existe, escondido).
    await expect(page.locator("[id^='cadastro-row-medicamentos-']")).toHaveCount(0);
    await page.locator("#btn-secao-medicamentos").click();
    await expect(page.locator("#cadastro-lista-medicamentos tbody tr")).toHaveCount(50);
    await expect(page.locator("#btn-mostrar-mais-medicamentos")).toHaveText(`Mostrar mais (${Math.min(50, total - 50)} de ${total - 50})`);
    await page.locator("#btn-mostrar-mais-medicamentos").click();
    await expect(page.locator("#cadastro-lista-medicamentos tbody tr")).toHaveCount(Math.min(100, total));
    // Fechar e abrir de novo volta aos 50 primeiros.
    await page.locator("#btn-secao-medicamentos").click();
    await expect(page.locator("[id^='cadastro-row-medicamentos-']")).toHaveCount(0);
    await page.locator("#btn-secao-medicamentos").click();
    await expect(page.locator("#cadastro-lista-medicamentos tbody tr")).toHaveCount(50);
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

    test(`o ${rotulo} lê as 7 listas (200) e leva 403 ao criar e ao alterar, inclusive com chave PIX`, async ({ page }) => {
      await login(page, conta.email, conta.password);
      const req = page.request;
      for (const lista of LISTAS) {
        const res = await req.get(`/api/cadastros/${lista}`);
        expect(res.status(), `GET ${lista}`).toBe(200);
        expect(Array.isArray(await res.json())).toBe(true);
      }
      expect((await apiCriar(req, "cias-aereas", { nome: nomeUnico("Proibido") })).status).toBe(403);
      expect((await apiCriar(req, "temperaturas", { nome: nomeUnico("Proibido") })).status).toBe(403);
      expect((await apiCriar(req, "medicamentos", { nome: nomeUnico("Proibido"), temperatura: "Ambiente" })).status).toBe(403);
      expect((await req.patch("/api/cadastros/medicamentos/qualquer", { data: { nome: "TESTE" } })).status()).toBe(403);
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
