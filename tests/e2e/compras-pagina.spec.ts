import { test, expect, type Page } from "@playwright/test";

// A página Compras (6a): três colunas, lista do mês, salvamento automático, checklist e resumo ao vivo, Copiar, Duplicar, Cancelar,
// filtros, mês, teclado, conflito (409) com duas abas e somente leitura.
//
// ESCRITO, NÃO EXECUTADO. A e2e só roda no Supabase LOCAL (a guarda em tests/e2e/_guards aborta fora de loopback): estes testes CRIAM
// compras de verdade (paciente "TESTE E2E ...") e o contador do mês avança a cada "+ Nova compra". Nunca rode contra produção.
// Credenciais por env (os mesmos nomes de rbac.spec.ts); cada grupo é pulado sem elas. Nenhuma conta é criada aqui.
// Ver tests/e2e/README.md.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const socio = cred("SOCIO");
const operacional = cred("OPERACIONAL");
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

async function abrirCompras(page: Page, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/compras${query}`, { waitUntil: "networkidle" });
  await expect(page.locator("h1")).toHaveText("Compras");
}

const unico = (): string => `TESTE E2E ${Date.now()}`;

/** Cria uma compra pela tela e digita o paciente; espera o 'Salvo automaticamente'. */
async function criarCompraComPaciente(page: Page, paciente: string): Promise<void> {
  await page.locator("#btn-nova-compra").click();
  await expect(page.locator("#compra-paciente")).toBeFocused();
  await page.locator("#compra-paciente").fill(paciente);
  await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
}

for (const [rotulo, conta] of [
  ["administrador", admin],
  ["operacional", operacional],
] as const) {
  test.describe(`Compras (tela) — ${rotulo}: lê e escreve`, () => {
    test.describe.configure({ retries: 1 });
    test.skip(!tem(conta), `defina E2E_${rotulo.toUpperCase()}_EMAIL / _PASSWORD`);

    test.beforeEach(async ({ page }) => {
      await login(page, conta.email, conta.password);
    });

    test("três colunas no desktop; sem compra escolhida o centro diz 'Escolha uma compra ou crie uma nova.'; a página não rola por inteiro", async ({ page }) => {
      await abrirCompras(page);
      for (const id of ["#compras-coluna-esquerda", "#compras-coluna-central", "#compras-coluna-direita"]) await expect(page.locator(id)).toBeVisible();
      await expect(page.locator("#compras-sem-selecao")).toHaveText("Escolha uma compra ou crie uma nova.");
      // Larguras: ~320 | flexível | ~460.
      const larguras = await page.evaluate(() => ["compras-coluna-esquerda", "compras-coluna-central", "compras-coluna-direita"].map((id) => document.getElementById(id)!.getBoundingClientRect().width));
      expect(larguras[0]).toBeGreaterThan(300);
      expect(larguras[0]).toBeLessThan(340);
      expect(larguras[2]).toBeGreaterThan(440);
      expect(larguras[2]).toBeLessThan(480);
      expect(larguras[1]).toBeGreaterThan(larguras[0]!);
      // O <main> não rola; cada coluna tem rolagem própria.
      const semRolagemGeral = await page.evaluate(() => {
        const main = document.getElementById("app-main-content")!;
        return main.scrollHeight <= main.clientHeight + 1;
      });
      expect(semRolagemGeral).toBe(true);
      for (const id of ["compras-coluna-esquerda", "compras-coluna-central", "compras-coluna-direita"]) {
        expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
      }
    });

    test("o seletor de mês mostra o mês de Brasília por extenso e as setas trocam de mês (e a URL acompanha)", async ({ page }) => {
      await abrirCompras(page);
      await expect(page.locator("#compras-mes-rotulo")).toHaveText(/^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/\d{4}$/);
      await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
      const antes = await page.locator("#compras-mes-rotulo").innerText();
      await page.locator("#compras-mes-anterior").click();
      await expect(page.locator("#compras-mes-rotulo")).not.toHaveText(antes);
      await page.locator("#compras-mes-proximo").click();
      await expect(page.locator("#compras-mes-rotulo")).toHaveText(antes);
    });

    test("+ Nova compra: cria, seleciona, leva o foco ao Paciente; digitar salva sozinho e o resumo e o checklist mudam ao vivo", async ({ page }) => {
      await abrirCompras(page);
      await page.locator("#btn-nova-compra").click();
      await expect(page.locator("#compra-paciente")).toBeFocused();
      await expect(page.locator("#compra-titulo")).toHaveText(/^Compra \d{2,} - /);
      await expect(page.locator("#compra-checklist-erros")).toContainText("Paciente não preenchido");

      const paciente = unico();
      await page.locator("#compra-paciente").fill(paciente);
      await expect(page.locator("#compra-checklist-erros")).not.toContainText("Paciente não preenchido"); // ao vivo, sem esperar o salvamento
      await expect(page.locator("#compra-resumo-texto")).toContainText("Paciente:");
      await expect(page.locator("#compra-salvamento")).toContainText(/Salvando…|Salvo automaticamente às \d{2}:\d{2}/);
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
      // O cartão da lista acompanha (sem recarregar a página).
      await expect(page.locator("[data-compra-cartao][aria-current='true']")).toContainText(paciente);
    });

    test("recarregar a página volta ao mesmo lugar (?mes e ?id) com o que ficou salvo", async ({ page }) => {
      await abrirCompras(page);
      const paciente = unico();
      await criarCompraComPaciente(page, paciente);
      await page.locator("#compra-medico").fill("Dr. Teste E2E");
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
      await expect(page).toHaveURL(/id=cmp_/);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("#compra-paciente")).toHaveValue(paciente);
      await expect(page.locator("#compra-medico")).toHaveValue("Dr. Teste E2E");
      await expect(page.locator("[data-compra-cartao][aria-current='true']")).toContainText(paciente);
    });

    test("Compra particular desabilita e limpa o Nº do processo; Recorrente entra no resumo", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#compra-processo").fill("0000000-00.0000.0.00.0000/SP");
      await page.locator("#compra-particular").check();
      await expect(page.locator("#compra-processo")).toBeDisabled();
      await expect(page.locator("#compra-processo")).toHaveValue("");
      await expect(page.locator("#compra-resumo-texto")).toContainText("Número do processo: Compra particular");
      await page.locator("#compra-recorrente").check();
      await expect(page.locator("#compra-resumo-texto")).toContainText("Recorrente");
    });

    test("Copiar resumo copia exatamente o texto do resumo e avisa", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#btn-copiar-resumo").click();
      await expect(page.getByText("Resumo copiado")).toBeVisible();
      const copiado = await page.evaluate(() => navigator.clipboard.readText());
      const naTela = await page.locator("#compra-resumo-texto").evaluate((el) => el.textContent ?? "");
      expect(copiado).toBe(naTela);
    });

    test("Encaminhar para a DIR aparece desabilitado ('Disponível na próxima etapa')", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await expect(page.locator("#btn-encaminhar-dir")).toBeDisabled();
      await expect(page.locator("#encaminhar-dir-aviso")).toHaveText("Disponível na próxima etapa");
    });

    test("Duplicar cria a próxima compra com os mesmos dados e a abre", async ({ page }) => {
      await abrirCompras(page);
      const paciente = unico();
      await criarCompraComPaciente(page, paciente);
      const tituloAntes = await page.locator("#compra-titulo").innerText();
      await page.locator("#btn-duplicar-compra").click();
      await expect(page.locator("#compra-titulo")).not.toHaveText(tituloAntes);
      await expect(page.locator("#compra-paciente")).toHaveValue(paciente);
      await expect(page.locator("[data-compra-cartao]").filter({ hasText: paciente })).toHaveCount(2);
    });

    test("Cancelar pede confirmação; confirmada, a faixa 'Compra cancelada' aparece, os campos ficam desabilitados e não há Duplicar", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#btn-cancelar-compra").click();
      const dialogo = page.getByRole("alertdialog");
      await expect(dialogo).toBeVisible();
      await dialogo.getByRole("button", { name: "Voltar" }).click();
      await expect(page.locator("#compra-faixa-cancelada")).toHaveCount(0); // desistir não cancela
      await page.locator("#btn-cancelar-compra").click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar compra" }).click();
      await expect(page.locator("#compra-faixa-cancelada")).toHaveText("Compra cancelada");
      await expect(page.locator("#compra-paciente")).toBeDisabled();
      await expect(page.locator("#btn-duplicar-compra")).toHaveCount(0);
      await expect(page.locator("#btn-cancelar-compra")).toHaveCount(0);
    });

    test("filtros: o chip vai para a URL (?status) e 'Mostrar canceladas' traz as canceladas", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#compras-chip-rascunho").click();
      await expect(page).toHaveURL(/status=rascunho/);
      await expect(page.locator("#compras-chip-rascunho")).toHaveAttribute("aria-pressed", "true");
      await page.locator("#compras-chip-todas").click();
      await expect(page).not.toHaveURL(/status=/);
      await page.locator("#compras-mostrar-canceladas").click();
      await expect(page).toHaveURL(/canceladas=1/);
    });

    test("teclado: seta para baixo e para cima movem o foco entre os cartões; Enter abre a compra", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await criarCompraComPaciente(page, unico());
      const cartoes = page.locator("[data-compra-cartao]");
      expect(await cartoes.count()).toBeGreaterThanOrEqual(2);
      await cartoes.first().focus();
      await page.keyboard.press("ArrowDown");
      await expect(cartoes.nth(1)).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(cartoes.first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(cartoes.nth(1)).toHaveAttribute("aria-current", "true");
    });

    test("trocar de compra salva o que foi digitado antes (nada se perde)", async ({ page }) => {
      await abrirCompras(page);
      const a = unico();
      await criarCompraComPaciente(page, a);
      await criarCompraComPaciente(page, `${a} B`);
      await page.locator("#compra-medico").fill("Medico digitado e troquei logo");
      await page.locator("[data-compra-cartao]").filter({ hasText: a }).first().click();
      await page.locator("[data-compra-cartao]").filter({ hasText: `${a} B` }).first().click();
      await expect(page.locator("#compra-medico")).toHaveValue("Medico digitado e troquei logo");
    });

    test("duas abas na mesma compra: a segunda leva 409, vê a faixa e as DUAS saídas funcionam", async ({ page, context }) => {
      await abrirCompras(page);
      const paciente = unico();
      await criarCompraComPaciente(page, paciente);
      const url = page.url();
      const outra = await context.newPage();
      await outra.setViewportSize({ width: 1440, height: 900 });
      await outra.goto(url, { waitUntil: "networkidle" });
      await expect(outra.locator("#compra-paciente")).toHaveValue(paciente);

      // A aba 1 salva primeiro.
      await page.locator("#compra-medico").fill("Medico da aba 1");
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
      // A aba 2 (que ainda tem a versão antiga) tenta salvar: conflito.
      await outra.locator("#compra-medico").fill("Medico da aba 2");
      await expect(outra.locator("#compra-faixa-conflito")).toContainText("Esta compra foi alterada por outra pessoa.");
      await expect(outra.locator("#btn-conflito-carregar")).toHaveText("Carregar a versão salva");
      await expect(outra.locator("#btn-conflito-manter")).toHaveText("Manter as minhas e salvar por cima");

      // Saída 1: carregar a versão salva (descarta o que a aba 2 digitou).
      await outra.locator("#btn-conflito-carregar").click();
      await expect(outra.locator("#compra-medico")).toHaveValue("Medico da aba 1");
      await expect(outra.locator("#compra-faixa-conflito")).toHaveCount(0);

      // De novo o conflito, agora com a saída 2: manter as minhas e salvar por cima.
      await page.locator("#compra-medico").fill("Medico da aba 1 de novo");
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
      await outra.locator("#compra-medico").fill("Medico da aba 2 vence");
      await expect(outra.locator("#compra-faixa-conflito")).toBeVisible();
      await outra.locator("#btn-conflito-manter").click();
      await expect(outra.locator("#compra-faixa-conflito")).toHaveCount(0);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("#compra-medico")).toHaveValue("Medico da aba 2 vence");
      await outra.close();
    });

    test("abaixo de lg as colunas empilham na ordem lista, formulário, resumo e a página rola", async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 900 });
      await page.goto("/compras", { waitUntil: "networkidle" });
      await criarCompraComPaciente(page, unico());
      const topos = await page.evaluate(() => ["compras-coluna-esquerda", "compras-coluna-central", "compras-coluna-direita"].map((id) => document.getElementById(id)!.getBoundingClientRect().top));
      expect(topos[0]).toBeLessThan(topos[1]!);
      expect(topos[1]).toBeLessThan(topos[2]!);
    });
  });
}

test.describe("Compras (tela) — sócio: só lê", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!tem(socio) || !tem(admin), "defina E2E_SOCIO_* e E2E_ADMIN_* (o administrador cria a compra que o sócio abre)");

  test("vê a lista, o checklist e o resumo; sem '+ Nova compra', Duplicar nem Cancelar; campos desabilitados; Copiar resumo habilitado", async ({ browser }) => {
    const ctxAdmin = await browser.newContext();
    const paginaAdmin = await ctxAdmin.newPage();
    await login(paginaAdmin, admin.email, admin.password);
    await abrirCompras(paginaAdmin);
    const paciente = unico();
    await criarCompraComPaciente(paginaAdmin, paciente);
    const url = paginaAdmin.url();
    await ctxAdmin.close();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, socio.email, socio.password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(new URL(url).pathname + new URL(url).search, { waitUntil: "networkidle" });
    await expect(page.locator("#compra-paciente")).toHaveValue(paciente);
    await expect(page.locator("#btn-nova-compra")).toHaveCount(0);
    await expect(page.locator("#btn-duplicar-compra")).toHaveCount(0);
    await expect(page.locator("#btn-cancelar-compra")).toHaveCount(0);
    for (const id of ["#compra-paciente", "#compra-processo", "#compra-medico", "#compra-responsavel", "#compra-particular", "#compra-recorrente"]) {
      await expect(page.locator(id)).toBeDisabled();
    }
    await expect(page.locator("#compra-bloco-paciente")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#compra-checklist")).toBeVisible();
    await expect(page.locator("#compra-resumo-texto")).toContainText("Paciente:");
    await expect(page.locator("#btn-copiar-resumo")).toBeEnabled();
    await ctx.close();
  });

  test("lista vazia para o sócio: só a mensagem, sem botão de criar", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, socio.email, socio.password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compras?mes=2000-01", { waitUntil: "networkidle" });
    await expect(page.locator("#compras-lista-vazia")).toContainText("Nenhuma compra neste mês.");
    await expect(page.locator("#btn-nova-compra-vazio")).toHaveCount(0);
    await ctx.close();
  });
});
