import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// A decisão dos pré-cadastros de medicamento (8): a seção "Pendentes de aprovação" na aba Medicamentos de Cadastros (aprovar com o item da compra
// ligado, rejeitar com confirmação e o aviso na compra, nome que já existe no Cadastro e "Vincular ao cadastro existente") e a barreira de quem não
// escreve nos Cadastros (a lista e as decisões respondem 403).
//
// ESCRITO, NÃO EXECUTADO (só foi conferido com `npx playwright test --list`). A e2e só roda no Supabase LOCAL (a guarda em tests/e2e/_guards aborta
// fora de loopback). Cada teste CRIA dados no banco local: uma compra e pré-cadastros "TESTE E2E PRE ..." e, ao aprovar, medicamentos com o
// mesmo nome no Cadastro. O app não apaga nada (nem compras, nem pré-cadastros, nem medicamentos): recrie o banco local para limpar.
// NUNCA rode contra produção. Ver tests/e2e/README.md.
//
// Os dados são montados pela API (a tela é usada para o que é da tela). A temperatura vem de `POST /api/compras/temperaturas` ("TESTE E2E TEMP"),
// então nenhum cadastro prévio é necessário além das contas.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const operacional = cred("OPERACIONAL");
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);

const TEMPERATURA = "TESTE E2E TEMP";
const unico = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

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

interface CompraApi {
  id: string;
  anoMes: string;
  sequencia: number;
  updatedAt: string;
  itens: Array<{ id: string; medicamentoCadastroId: string | null; preCadastroId: string | null; preCadastroStatus?: string | null }>;
}
interface PreApi {
  id: string;
  nome: string;
}

/** Uma compra com UM medicamento fora do Cadastro, já com o pré-cadastro pedido (como o formulário faz). */
async function compraComPreCadastro(request: APIRequestContext, nome: string): Promise<{ compra: CompraApi; pre: PreApi; itemId: string }> {
  const temperatura = await request.post("/api/compras/temperaturas", { data: { nome: TEMPERATURA } });
  expect(temperatura.ok(), await temperatura.text()).toBe(true);

  const criada = await request.post("/api/compras");
  expect(criada.ok()).toBe(true);
  const compra = (await criada.json()) as CompraApi;

  const pedido = await request.post("/api/compras/pre-cadastro-medicamentos", { data: { nome, temperatura: TEMPERATURA, compraId: compra.id } });
  expect(pedido.ok(), await pedido.text()).toBe(true);
  const pre = ((await pedido.json()) as { preCadastro: PreApi }).preCadastro;

  const itemId = `itm_e2e_pre_${unico()}`;
  const salvou = await request.patch(`/api/compras/${compra.id}`, {
    data: {
      atualizadoEm: compra.updatedAt,
      paciente: `TESTE E2E PACIENTE ${unico()}`,
      itens: [{ id: itemId, medicamento: nome, medicamentoCadastroId: null, preCadastroId: pre.id, temperatura: TEMPERATURA, quantidade: "2 caixas" }],
    },
  });
  expect(salvou.ok(), await salvou.text()).toBe(true);
  return { compra: (await salvou.json()) as CompraApi, pre, itemId };
}

async function lerCompra(request: APIRequestContext, id: string): Promise<CompraApi> {
  const r = await request.get(`/api/compras/${id}`);
  expect(r.ok()).toBe(true);
  return (await r.json()) as CompraApi;
}
const itemDe = (c: CompraApi, itemId: string) => c.itens.find((i) => i.id === itemId)!;

async function abrirCadastros(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
  await expect(page.locator("#cadastros-tab")).toBeVisible();
}

test.describe("Pendentes de aprovação — administrador", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / _PASSWORD");

  test.beforeEach(async ({ page }) => {
    await login(page, admin.email, admin.password);
  });

  test("a seção fica acima de Medicamentos, com a etiqueta no título, e mostra nome, temperatura, a compra (sem paciente), quem pediu e quando", async ({ page }) => {
    const nome = `TESTE E2E PRE ALFA ${unico()}`;
    const { compra, pre } = await compraComPreCadastro(page.request, nome);
    await abrirCadastros(page);

    await expect(page.locator("#cadastro-pendentes")).toBeVisible();
    const ids = await page.locator("#cadastros-tab > section").evaluateAll((s) => s.map((x) => x.id));
    expect(ids.indexOf("cadastro-pendentes")).toBe(ids.indexOf("cadastro-secao-medicamentos") - 1);
    await expect(page.locator("#cadastro-pendentes-etiqueta-medicamentos")).toContainText("pendente");

    const linha = page.locator(`#pendente-${pre.id}`);
    await expect(page.locator(`#pendente-${pre.id}-nome`)).toHaveValue(nome);
    await expect(page.locator(`#pendente-${pre.id}-temperatura`)).toContainText(TEMPERATURA);
    await expect(page.locator(`#pendente-${pre.id}-compra`)).toContainText(`Compra ${String(compra.sequencia).padStart(2, "0")}`);
    await expect(linha).not.toContainText("PACIENTE"); // o paciente da compra não aparece na linha
    await expect(linha.locator(`#pendente-${pre.id}-meta`)).toContainText("por ");
  });

  test("aprovar: o pendente some, o medicamento passa a existir no Cadastro e o item da compra fica ligado (sem aviso de pré-cadastro) com a versão da compra nova", async ({ page }) => {
    const nome = `TESTE E2E PRE ALFA ${unico()}`;
    const { compra, pre, itemId } = await compraComPreCadastro(page.request, nome);
    await abrirCadastros(page);

    await page.locator(`#btn-pendente-aprovar-${pre.id}`).click();
    await expect(page.locator(`#pendente-${pre.id}`)).toHaveCount(0);

    const depois = await lerCompra(page.request, compra.id);
    const item = itemDe(depois, itemId);
    expect(item.medicamentoCadastroId).not.toBeNull();
    expect(item.preCadastroId).toBeNull();
    expect(depois.updatedAt).not.toBe(compra.updatedAt);

    // O medicamento está no Cadastro (a lista é lida de novo depois de aprovar).
    const lista = await page.request.get("/api/cadastros/medicamentos");
    const medicamentos = (await lista.json()) as Array<{ id: string; nome: string }>;
    expect(medicamentos.filter((m) => m.nome === nome)).toHaveLength(1);
    expect(medicamentos.find((m) => m.nome === nome)!.id).toBe(item.medicamentoCadastroId);

    // A segunda decisão sobre o mesmo pendente é 409.
    const segunda = await page.request.post(`/api/cadastros/pre-medicamentos/${pre.id}/aprovar`, { data: {} });
    expect(segunda.status()).toBe(409);
  });

  test("rejeitar pede confirmação (cancelar não envia), depois marca rejeitado e a compra passa a mostrar o aviso (aviso, não erro) com o texto livre intacto", async ({ page }) => {
    const nome = `TESTE E2E PRE BETA ${unico()}`;
    const { compra, pre, itemId } = await compraComPreCadastro(page.request, nome);
    await abrirCadastros(page);

    await page.locator(`#btn-pendente-rejeitar-${pre.id}`).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator(`#pendente-${pre.id}`)).toBeVisible();
    expect(itemDe(await lerCompra(page.request, compra.id), itemId).preCadastroStatus).toBe("pendente");

    await page.locator(`#btn-pendente-rejeitar-${pre.id}`).click();
    await page.getByRole("button", { name: "Rejeitar", exact: true }).last().click();
    await expect(page.locator(`#pendente-${pre.id}`)).toHaveCount(0);

    const depois = await lerCompra(page.request, compra.id);
    expect(itemDe(depois, itemId)).toMatchObject({ preCadastroStatus: "rejeitado", medicamentoCadastroId: null });
    expect(depois.updatedAt).not.toBe(compra.updatedAt);

    await page.goto(`/compras?mes=${compra.anoMes}&id=${compra.id}`, { waitUntil: "networkidle" });
    await expect(page.locator(`#item-${itemId}-pre-cadastro-rejeitado`)).toHaveText("Pré-cadastro rejeitado: escolha outro medicamento do Cadastro ou mantenha o texto livre");
    await expect(page.locator(`#item-${itemId}-medicamento`)).toHaveValue(nome);
  });

  test("nome que já existe no Cadastro: 'Já existe no Cadastro' e 'Vincular ao cadastro existente' (liga o item sem criar linha nova)", async ({ page }) => {
    const nome = `TESTE E2E PRE GAMA ${unico()}`;
    const { compra, pre, itemId } = await compraComPreCadastro(page.request, nome);
    // Outra pessoa cadastrou o mesmo nome depois do pedido.
    const criado = await page.request.post("/api/cadastros/medicamentos", { data: { nome, temperatura: TEMPERATURA } });
    expect(criado.ok(), await criado.text()).toBe(true);
    const existente = (await criado.json()) as { id: string };

    await abrirCadastros(page);
    await page.locator(`#btn-pendente-aprovar-${pre.id}`).click();
    await expect(page.locator(`#pendente-${pre.id}-conflito-texto`)).toContainText(`Já existe no Cadastro: ${nome}`);
    await expect(page.locator(`#pendente-${pre.id}`)).toBeVisible();

    await page.locator(`#btn-pendente-vincular-${pre.id}`).click();
    await expect(page.locator(`#pendente-${pre.id}`)).toHaveCount(0);

    const item = itemDe(await lerCompra(page.request, compra.id), itemId);
    expect(item.medicamentoCadastroId).toBe(existente.id);
    const lista = (await (await page.request.get("/api/cadastros/medicamentos")).json()) as Array<{ nome: string }>;
    expect(lista.filter((m) => m.nome === nome)).toHaveLength(1); // nenhuma linha nova
  });

  test("duas abas decidindo o mesmo pendente: a segunda recebe o aviso e a lista é atualizada", async ({ page, browser }) => {
    const nome = `TESTE E2E PRE DELTA ${unico()}`;
    const { pre } = await compraComPreCadastro(page.request, nome);
    await abrirCadastros(page);

    const outraAba = await (await browser.newContext()).newPage();
    await login(outraAba, admin.email, admin.password);
    const r = await outraAba.request.post(`/api/cadastros/pre-medicamentos/${pre.id}/rejeitar`);
    expect(r.ok()).toBe(true);
    await outraAba.context().close();

    await page.locator(`#btn-pendente-aprovar-${pre.id}`).click();
    await expect(page.locator(`#pendente-${pre.id}`)).toHaveCount(0);
  });
});

test.describe("Pendentes de aprovação — quem não escreve nos Cadastros", () => {
  test.skip(!tem(operacional), "defina E2E_OPERACIONAL_EMAIL / _PASSWORD");

  test("operacional: a lista e as decisões respondem 403 e a aba Cadastros não existe", async ({ page }) => {
    await login(page, operacional.email, operacional.password);
    expect((await page.request.get("/api/cadastros/pre-medicamentos")).status()).toBe(403);
    expect((await page.request.post("/api/cadastros/pre-medicamentos/pre_qualquer/aprovar", { data: {} })).status()).toBe(403);
    expect((await page.request.post("/api/cadastros/pre-medicamentos/pre_qualquer/rejeitar")).status()).toBe(403);

    await page.goto("/configuracoes?aba=cadastros", { waitUntil: "networkidle" });
    await expect(page.locator("#tab-cadastros")).toHaveCount(0);
    await expect(page.locator("#cadastro-pendentes")).toHaveCount(0);
  });
});
