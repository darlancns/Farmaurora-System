import { test, expect, type Page } from "@playwright/test";

// A página Compras no CELULAR (375x667) e em tela larga (1280x800 e 2130x1200): abas, barra fixa do Resumo, cabeçalho com menu "…", formulário
// único (rótulo acima do controle, Med. 1/Med. 2 empilhados), lista de sugestões sem corte e o parâmetro ?aba= (que o desktop ignora).
//
// ESCRITO, NÃO EXECUTADO. A e2e só roda no Supabase LOCAL (a guarda em tests/e2e/_guards aborta fora de loopback): estes testes CRIAM
// compras de verdade (paciente "TESTE E2E ...") e cada "+ Nova compra" usa o número sugerido na caixinha (o maior do mês + 1). Nunca rode contra produção.
// Credenciais por env (os mesmos nomes de rbac.spec.ts); sem elas o grupo é pulado. Ver tests/e2e/README.md.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
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

const unico = (): string => `TESTE E2E ${Date.now()}`;
const CELULAR = { width: 375, height: 667 };
const primeiroMedicamento = (page: Page) => page.locator("[id^='compra-item-'][id$='-medicamento']").first();

async function abrir(page: Page, viewport: { width: number; height: number }, query = ""): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`/compras${query}`, { waitUntil: "networkidle" });
  await expect(page.locator("h1")).toHaveText("Compras");
}

/** Cria uma compra pelo botão (qualquer largura) e digita o paciente. No celular a criação já leva ao Formulário. */
async function criarCompra(page: Page, paciente: string): Promise<void> {
  await page.locator("#btn-nova-compra").click();
  await expect(page.locator("#compra-dialogo-numero")).not.toHaveValue(""); // a sugestão (o maior do mês + 1) chega
  await page.locator("#btn-compra-dialogo-criar").click();
  await expect(primeiroMedicamento(page)).toBeFocused();
  await page.locator("#compra-paciente").fill(paciente);
  await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
}

test.describe("Compras (celular, 375x667) — um painel por vez", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / _PASSWORD");

  test.beforeEach(async ({ page }) => {
    await login(page, admin.email, admin.password);
  });

  test("as 3 abas aparecem (Compras, Formulário, Resumo) e só a lista está à vista no começo; as abas ficam coladas no topo ao rolar", async ({ page }) => {
    await abrir(page, CELULAR);
    await expect(page.getByRole("radio", { name: "Compras" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Formulário" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Resumo" })).toBeVisible();
    await expect(page.locator("#compras-coluna-esquerda")).toBeVisible();
    await expect(page.locator("#compras-coluna-central")).toBeHidden();
    await expect(page.locator("#compras-coluna-direita")).toBeHidden();
    const posicao = await page.locator("#compras-abas").evaluate((el) => getComputedStyle(el).position);
    expect(posicao).toBe("sticky");
  });

  test("criar uma compra leva ao Formulário (a URL ganha ?aba=formulario) e '‹ Compras' volta à lista", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    await expect(page).toHaveURL(/aba=formulario/);
    await expect(page.locator("#compras-coluna-central")).toBeVisible();
    await expect(page.locator("#compras-coluna-esquerda")).toBeHidden();
    await page.getByRole("button", { name: "Voltar para a lista de compras" }).click();
    await expect(page.locator("#compras-coluna-esquerda")).toBeVisible();
    await expect(page).toHaveURL(/aba=lista/);
  });

  test("escolher uma compra na lista leva ao Formulário", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    await page.getByRole("button", { name: "Voltar para a lista de compras" }).click();
    await page.locator("[data-compra-cartao]").first().click();
    await expect(page.locator("#compras-coluna-central")).toBeVisible();
    await expect(page).toHaveURL(/aba=formulario/);
  });

  test("recarregar com ?aba=resumo&id=... volta à aba Resumo, com a barra fixa de 'Copiar resumo' ACIMA da barra de navegação do app", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    await page.getByRole("radio", { name: "Resumo" }).click();
    await expect(page).toHaveURL(/aba=resumo/);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#compras-coluna-direita")).toBeVisible();
    await expect(page.locator("#compras-coluna-central")).toBeHidden();
    const barra = page.locator("#compra-barra-acoes");
    await expect(barra).toBeVisible();
    expect(await barra.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    await expect(page.getByRole("button", { name: "Copiar resumo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Encaminhar para a DIR" })).toBeDisabled();
    // A barra termina onde a navegação do app começa (não a cobre nem é coberta).
    const caixaBarra = (await barra.boundingBox())!;
    const caixaNav = (await page.locator("#bottom-nav").boundingBox())!;
    expect(caixaBarra.y + caixaBarra.height).toBeLessThanOrEqual(caixaNav.y + 1);
    expect(caixaBarra.y + caixaBarra.height).toBeGreaterThan(caixaNav.y - 24);
    // Os dois botões lado a lado.
    const copiar = (await page.getByRole("button", { name: "Copiar resumo" }).boundingBox())!;
    const encaminhar = (await page.getByRole("button", { name: "Encaminhar para a DIR" }).boundingBox())!;
    expect(Math.abs(copiar.y - encaminhar.y)).toBeLessThan(4);
  });

  test("o cabeçalho do formulário tem duas linhas e Duplicar/Cancelar ficam no menu '…'", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    await expect(page.locator("#btn-duplicar-compra")).toBeHidden();
    await expect(page.locator("#btn-cancelar-compra")).toBeHidden();
    await page.getByRole("button", { name: "Mais ações da compra" }).click();
    await expect(page.getByRole("menuitem", { name: "Duplicar compra" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Cancelar compra" })).toBeVisible();
    const tituloTopo = (await page.locator("#compra-titulo").boundingBox())!.y;
    const menuTopo = (await page.getByRole("button", { name: "Mais ações da compra" }).boundingBox())!.y;
    expect(menuTopo).toBeGreaterThan(tituloTopo + 10); // o menu está na 2ª linha
    await page.getByRole("menuitem", { name: "Duplicar compra" }).click();
    await expect(page.locator("#compra-titulo")).toBeVisible();
  });

  test("campos de 16px e 44px; o rótulo fica ACIMA do controle; com 2 medicamentos os controles ficam empilhados (Med. 1 acima do Med. 2) com ✕ de 44px", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    const medida = async (sel: string) => page.locator(sel).first().evaluate((el) => ({ fonte: getComputedStyle(el).fontSize, altura: el.getBoundingClientRect().height }));
    const paciente = await medida("#compra-paciente");
    expect(paciente.fonte).toBe("16px");
    expect(paciente.altura).toBeGreaterThanOrEqual(44);
    const frete = await medida("#compra-frete");
    expect(frete.fonte).toBe("16px");
    // O rótulo da linha está acima do controle (não à esquerda).
    const rotulo = (await page.locator("#compra-linha-paciente-rotulo").boundingBox())!;
    const controle = (await page.locator("#compra-paciente").boundingBox())!;
    expect(rotulo.y + rotulo.height).toBeLessThanOrEqual(controle.y + 1);
    // Um 2º medicamento (com ✕) empilha os controles por medicamento.
    await page.getByRole("button", { name: "Adicionar medicamento" }).click();
    const labs = page.locator("[id^='compra-item-'][id$='-laboratorio']");
    await expect(labs).toHaveCount(2);
    const lab1 = (await labs.nth(0).boundingBox())!;
    const lab2 = (await labs.nth(1).boundingBox())!;
    expect(lab1.y).toBeLessThan(lab2.y);
    const x = (await page.getByRole("button", { name: "Remover Med. 2" }).boundingBox())!;
    expect(x.width).toBeGreaterThanOrEqual(44);
    expect(x.height).toBeGreaterThanOrEqual(44);
  });

  test("a lista de sugestões do medicamento abre sem ser cortada pelo teclado nem pela barra de baixo", async ({ page }) => {
    await abrir(page, CELULAR);
    await criarCompra(page, unico());
    const campo = primeiroMedicamento(page);
    await campo.fill("a");
    const lista = page.locator("[role=listbox]").first();
    await expect(lista).toBeVisible();
    const caixa = (await lista.boundingBox())!;
    const nav = (await page.locator("#bottom-nav").boundingBox())!;
    expect(caixa.y).toBeGreaterThanOrEqual(0);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(nav.y + 1); // não passa por baixo da barra de navegação
    expect(caixa.height).toBeLessThanOrEqual(224);
  });

  test("a aba Resumo mostra o resumo ao vivo (modelo) com os vazios tracejados; digitar no Formulário e voltar mostra o que foi digitado", async ({ page }) => {
    await abrir(page, CELULAR);
    await page.locator("#btn-nova-compra").click();
    await expect(page.locator("#compra-dialogo-numero")).not.toHaveValue(""); // a sugestão (o maior do mês + 1) chega
    await page.locator("#btn-compra-dialogo-criar").click();
    await expect(primeiroMedicamento(page)).toBeFocused();
    await page.locator("#compra-paciente").fill("TESTE E2E celular resumo");
    await page.getByRole("radio", { name: "Resumo" }).click();
    await expect(page.locator("#compras-coluna-central")).toBeHidden();
    await expect(page.locator("[data-resumo-linha='paciente']")).toContainText("Paciente: Teste E2e Celular Resumo");
    await expect(page.locator("[data-resumo-linha='laboratorio']")).toHaveAttribute("data-vazio", "true");
  });
});

for (const [nome, viewport] of [
  ["1280x800", { width: 1280, height: 800 }],
  ["2130x1200", { width: 2130, height: 1200 }],
] as const) {
  test.describe(`Compras (tela larga, ${nome}) — as três colunas juntas e o ?aba= ignorado`, () => {
    test.describe.configure({ retries: 1 });
    test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / _PASSWORD");

    test.beforeEach(async ({ page }) => {
      await login(page, admin.email, admin.password);
    });

    test("sem as abas e com as três colunas visíveis, mesmo com ?aba=resumo na URL", async ({ page }) => {
      await abrir(page, viewport, "?aba=resumo");
      await expect(page.locator("#compras-abas")).toBeHidden();
      for (const id of ["#compras-coluna-esquerda", "#compras-coluna-central", "#compras-coluna-direita"]) await expect(page.locator(id)).toBeVisible();
      await expect(page.locator("#compras-direita-vazia")).toHaveText("O resumo aparece aqui quando você abrir uma compra.");
    });

    test("a lista não tem chips de status: só 'Mostrar canceladas (N)'", async ({ page }) => {
      await abrir(page, viewport);
      await expect(page.locator("#compras-filtros")).toHaveCount(0);
      await expect(page.locator("#compras-lista label")).toContainText(/Mostrar canceladas \(\d+\)/);
    });

    test("estado vazio: só o texto, sem botão dentro do aviso", async ({ page }) => {
      await abrir(page, viewport, "?mes=2000-01");
      await expect(page.locator("#compras-lista-vazia")).toHaveText("Nenhuma compra neste mês.");
      await expect(page.locator("#compras-lista-vazia button")).toHaveCount(0);
      await expect(page.locator("#btn-nova-compra")).toBeVisible(); // o do topo da coluna
    });

    test("as três colunas juntas: o resumo da direita acompanha o formulário do meio sem trocar de aba", async ({ page }) => {
      await abrir(page, viewport);
      await criarCompra(page, "TESTE E2E larga");
      await page.locator("#compra-medico").fill("Dra. Teste");
      await expect(page.locator("[data-resumo-linha='medico']")).toContainText("Dra. Teste");
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page).not.toHaveURL(/aba=/); // em tela larga nunca há aba
    });

    test("depois de remover um medicamento o foco vai para o campo Medicamento da linha de antes", async ({ page }) => {
      await abrir(page, viewport);
      await criarCompra(page, unico());
      await page.getByRole("button", { name: "Adicionar medicamento" }).click();
      await expect(page.locator("[id^='compra-item-'][id$='-medicamento']")).toHaveCount(2);
      await page.getByRole("button", { name: "Remover Med. 2" }).click();
      await expect(page.locator("[id^='compra-item-'][id$='-medicamento']")).toHaveCount(1);
      await expect(primeiroMedicamento(page)).toBeFocused();
    });
  });
}
