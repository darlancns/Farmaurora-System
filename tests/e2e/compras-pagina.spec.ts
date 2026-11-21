import { test, expect, type Page } from "@playwright/test";

// A página Compras (formulário único): três colunas, lista do mês, salvamento automático, resumo ao vivo, Copiar, Duplicar, Cancelar,
// "Mostrar canceladas", mês, teclado, conflito (409) com duas abas e somente leitura.
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

/** O campo Medicamento do Med. 1 (o id é `compra-item-<id do medicamento>-medicamento`). */
const primeiroMedicamento = (page: Page) => page.locator("[id^='compra-item-'][id$='-medicamento']").first();

/** A ordem das linhas do formulário = a das linhas de montarResumo("modelo") sem o título (shared/utils/compraResumo.ts). */
const ORDEM_DAS_LINHAS = [
  "medicamento",
  "laboratorio",
  "brand",
  "quantidade",
  "ordens",
  "valor_unitario",
  "valor_real",
  "frete",
  "frete_real",
  "temperatura",
  "envio",
  "fornecedor",
  "cnpj",
  "pagamento",
  "termo_posterior",
  "paciente",
  "despachante",
  "observacoes",
  "isencao",
  "documentos",
  "pendencias",
  "recorrente",
  "consultor",
  "responsavel",
  "processo",
  "medico",
  "local_aplicacao",
  "entrega",
  "contatos",
];

/** Cria uma compra pela tela e digita o paciente; espera o salvamento (data-salvamento="salvo"; a tela não mostra texto de salvamento). */
async function criarCompraComPaciente(page: Page, paciente: string): Promise<void> {
  await page.locator("#btn-nova-compra").click();
  await expect(primeiroMedicamento(page)).toBeFocused(); // a compra nasce com o 1º medicamento vazio e o foco vai ao Med. 1
  await page.locator("#compra-paciente").fill(paciente);
  await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
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
      const larguras = await page.evaluate(() => ["compras-coluna-esquerda", "compras-coluna-central", "compras-coluna-direita"].map((id) => document.getElementById(id)!.getBoundingClientRect().width));
      expect(larguras[0]).toBeGreaterThan(300);
      expect(larguras[0]).toBeLessThan(340);
      expect(larguras[2]).toBeGreaterThan(440);
      expect(larguras[2]).toBeLessThan(480);
      expect(larguras[1]).toBeGreaterThan(larguras[0]!);
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

    test("+ Nova compra: cria, seleciona, leva o foco ao Medicamento do Med. 1; digitar salva sozinho e o resumo ao vivo preenche o vazio", async ({ page }) => {
      await abrirCompras(page);
      await page.locator("#btn-nova-compra").click();
      await expect(primeiroMedicamento(page)).toBeFocused();
      await expect(page.locator("#compra-titulo")).toHaveText(/^Compra \d{2,} - /);
      await expect(page.locator("[data-resumo-linha='paciente']")).toHaveAttribute("data-vazio", "true");

      const paciente = unico();
      await page.locator("#compra-paciente").fill(paciente);
      await expect(page.locator("[data-resumo-linha='paciente']")).not.toHaveAttribute("data-vazio", "true"); // ao vivo, sem esperar o salvamento
      await expect(page.locator("[data-resumo-linha='paciente']")).toContainText("Paciente:");
      await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
      // O cartão da lista acompanha (sem recarregar a página), com "N ordens" e sem chips de status.
      await expect(page.locator("[data-compra-cartao][aria-current='true']")).toContainText(paciente);
      await expect(page.locator("[data-compra-cartao][aria-current='true']")).toContainText("1 ordem");
    });

    test("sem chips Rascunho/Pronta/Encaminhada, sem contador de pendências, sem checklist, sem 'Dicas' e sem a palavra 'vendedor'", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      const tela = await page.locator("#compras-page").innerText();
      for (const proibido of ["Rascunho", "Pronta", "Encaminhada", "pendência", "antes de encaminhar", "Dicas"]) expect(tela).not.toContain(proibido);
      expect(tela.toLowerCase()).not.toContain("vendedor");
      await expect(page.locator("#compras-filtros")).toHaveCount(0);
      await expect(page.locator("#compra-formulario fieldset")).toHaveCount(0);
    });

    test("recarregar a página volta ao mesmo lugar (?mes e ?id) com o que ficou salvo", async ({ page }) => {
      await abrirCompras(page);
      const paciente = unico();
      await criarCompraComPaciente(page, paciente);
      await page.locator("#compra-medico").fill("Dr. Teste E2E");
      await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
      await expect(page).toHaveURL(/id=cmp_/);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("#compra-paciente")).toHaveValue(paciente);
      await expect(page.locator("#compra-medico")).toHaveValue("Dr. Teste E2E");
      await expect(page.locator("[data-compra-cartao][aria-current='true']")).toContainText(paciente);
    });

    test("um link antigo com ?status= é ignorado e a URL é regravada sem ele", async ({ page }) => {
      await abrirCompras(page, "?status=pronta");
      await expect(page.locator("#compras-lista")).toBeVisible();
      await expect(page).not.toHaveURL(/status=/);
    });

    test("Compra particular desabilita e limpa o Nº do processo; o resumo diz 'Compra particular'; Recorrente entra no resumo", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#compra-processo").fill("0000000-00.0000.0.00.0000/SP");
      await page.locator("#compra-particular").check();
      await expect(page.locator("#compra-processo")).toBeDisabled();
      await expect(page.locator("#compra-processo")).toHaveValue("");
      await expect(page.locator("[data-resumo-linha='processo']")).toContainText("Compra particular");
      await page.locator("#compra-recorrente").check();
      await expect(page.locator("[data-resumo-linha='recorrente']")).toContainText("Recorrente");
    });

    test("Copiar resumo copia o texto da CÓPIA (com 'pendente ⏳' no local e na entrega) e avisa", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#btn-copiar-resumo").click();
      await expect(page.getByText("Resumo copiado")).toBeVisible();
      const copiado = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiado).toMatch(/^\*Compra \d{2,} - /);
      expect(copiado).toContain("Local de aplicação: pendente ⏳");
      expect(copiado).toContain("Entrega (Doctor/AJC): pendente ⏳");
      expect(copiado).toContain("Termo de pagamento posterior: n/a");
    });

    test("Encaminhar para a DIR fica ao lado de Copiar resumo, visível e DESABILITADO, com a dica \"Em breve: depende da migração da DIR\"", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      const botao = page.locator("#btn-encaminhar-dir");
      await expect(botao).toBeVisible();
      await expect(botao).toBeDisabled();
      await expect(botao).toHaveAttribute("title", "Em breve: depende da migração da DIR");
      const copiar = (await page.locator("#btn-copiar-resumo").boundingBox())!;
      const encaminhar = (await botao.boundingBox())!;
      expect(Math.abs(copiar.y - encaminhar.y)).toBeLessThan(4);
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

    test("Cancelar pede confirmação; confirmada, o selo 'Cancelada' aparece, os campos ficam desabilitados e não há Duplicar", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await page.locator("#btn-cancelar-compra").click();
      const dialogo = page.getByRole("alertdialog");
      await expect(dialogo).toBeVisible();
      await dialogo.getByRole("button", { name: "Voltar" }).click();
      await expect(page.locator("#compra-cabecalho [data-selo-cancelada]")).toHaveCount(0); // desistir não cancela
      await page.locator("#btn-cancelar-compra").click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar compra" }).click();
      await expect(page.locator("#compra-cabecalho [data-selo-cancelada]")).toHaveText("Cancelada");
      await expect(page.locator("#compra-paciente")).toBeDisabled();
      await expect(page.locator("#btn-duplicar-compra")).toHaveCount(0);
      await expect(page.locator("#btn-cancelar-compra")).toHaveCount(0);
    });

    test("'Mostrar canceladas' vai para a URL (?canceladas=1), mostra a contagem e traz as canceladas (com o selo); sem ?status", async ({ page }) => {
      await abrirCompras(page);
      await criarCompraComPaciente(page, unico());
      await expect(page).not.toHaveURL(/status=/);
      await page.locator("#compras-mostrar-canceladas").click();
      await expect(page).toHaveURL(/canceladas=1/);
      await expect(page.locator("#compras-lista label")).toContainText(/Mostrar canceladas \(\d+\)/);
      await page.locator("#compras-mostrar-canceladas").click();
      await expect(page).not.toHaveURL(/canceladas=1/);
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

      await page.locator("#compra-medico").fill("Medico da aba 1");
      await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
      await outra.locator("#compra-medico").fill("Medico da aba 2");
      await expect(outra.locator("#compra-faixa-conflito")).toContainText("Esta compra foi alterada por outra pessoa.");
      await expect(outra.locator("#btn-conflito-carregar")).toHaveText("Carregar a versão salva");
      await expect(outra.locator("#btn-conflito-manter")).toHaveText("Manter as minhas e salvar por cima");

      await outra.locator("#btn-conflito-carregar").click();
      await expect(outra.locator("#compra-medico")).toHaveValue("Medico da aba 1");
      await expect(outra.locator("#compra-faixa-conflito")).toHaveCount(0);

      await page.locator("#compra-medico").fill("Medico da aba 1 de novo");
      await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
      await outra.locator("#compra-medico").fill("Medico da aba 2 vence");
      await expect(outra.locator("#compra-faixa-conflito")).toBeVisible();
      await outra.locator("#btn-conflito-manter").click();
      await expect(outra.locator("#compra-faixa-conflito")).toHaveCount(0);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("#compra-medico")).toHaveValue("Medico da aba 2 vence");
      await outra.close();
    });

    test("abaixo de lg é UM painel por vez (abas); o detalhe do celular está em compras-celular.spec.ts", async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 900 });
      await page.goto("/compras", { waitUntil: "networkidle" });
      await expect(page.locator("#compras-abas")).toBeVisible();
      await expect(page.locator("#compras-coluna-esquerda")).toBeVisible();
      await expect(page.locator("#compras-coluna-central")).toBeHidden();
      await expect(page.locator("#compras-coluna-direita")).toBeHidden();
    });
  });
}

// O formulário único. Só usa o que existe em qualquer banco local: os envios são constantes; a temperatura é criada na hora ("TESTE TEMP") e
// o medicamento é o "TESTE MED PRE-CADASTRO" (fora do Cadastro). Fornecedor, cia (opcional) e despachante dependem dos Cadastros do banco
// local e por isso não são escolhidos aqui.
test.describe("Compras (tela) — formulário único", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!tem(admin), "defina E2E_ADMIN_EMAIL / _PASSWORD");

  test.beforeEach(async ({ page }) => {
    await login(page, admin.email, admin.password);
    await abrirCompras(page);
  });

  test("as 29 linhas aparecem na ordem do resumo (modelo) e o Tab percorre os campos nessa ordem; sem fieldsets nem títulos de seção", async ({ page }) => {
    await criarCompraComPaciente(page, unico());
    const ids = await page.locator("#compra-campos [data-linha]").evaluateAll((els) => els.map((el) => el.getAttribute("data-linha")));
    expect(ids).toEqual(ORDEM_DAS_LINHAS);
    const idsDoResumo = await page.locator("[data-resumo-linha]").evaluateAll((els) => els.map((el) => el.getAttribute("data-resumo-linha")));
    expect(idsDoResumo.filter((id) => id !== "titulo" && !id!.startsWith("broker"))).toEqual(ORDEM_DAS_LINHAS);
    const positivos = await page.locator("#compra-formulario [tabindex]").evaluateAll((els) => els.filter((el) => Number(el.getAttribute("tabindex")) > 0).length);
    expect(positivos).toBe(0);
    await page.locator("#compra-paciente").focus();
    const visitadas: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      visitadas.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("[data-linha]")?.getAttribute("data-linha") ?? ""));
    }
    const posicoes = visitadas.filter((l) => l !== "").map((l) => ORDEM_DAS_LINHAS.indexOf(l));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  test("a compra nasce com UM medicamento; o '+' ao lado do input (aria-label 'Adicionar medicamento') cria o Med. 2 e as linhas por medicamento ganham 'Med. 1' e 'Med. 2'; remover mantém o que foi digitado", async ({ page }) => {
    await criarCompraComPaciente(page, unico());
    await expect(page.locator("[data-linha='laboratorio'] [role='group'][aria-label^='Med.']")).toHaveCount(0);
    await page.getByRole("button", { name: "Adicionar medicamento" }).click();
    await page.getByRole("button", { name: "Adicionar medicamento" }).click();
    const labs = page.locator("[id^='compra-item-'][id$='-laboratorio']");
    await expect(labs).toHaveCount(3);
    await expect(page.locator("[data-linha='laboratorio'] [role='group'][aria-label^='Med.']")).toHaveCount(3);
    await labs.nth(0).fill("Lab 1");
    await labs.nth(1).fill("Lab 2");
    await labs.nth(2).fill("Lab 3");
    await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
    // Remove o do MEIO: os outros dois ficam com os seus valores e o foco vai ao Medicamento do de antes.
    await page.getByRole("button", { name: "Remover Med. 2" }).click();
    await expect(labs).toHaveCount(2);
    await expect(labs.nth(0)).toHaveValue("Lab 1");
    await expect(labs.nth(1)).toHaveValue("Lab 3");
    await expect(primeiroMedicamento(page)).toBeFocused();
    await expect(page.locator("[data-linha='laboratorio']")).toContainText("Med. 2");
    await page.getByRole("button", { name: "Remover Med. 2" }).click();
    // Sobrou um: sem ✕.
    await expect(page.getByRole("button", { name: /^Remover Med\./ })).toHaveCount(0);
    await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
    await page.reload({ waitUntil: "networkidle" });
    await expect(labs).toHaveCount(1);
    await expect(labs.nth(0)).toHaveValue("Lab 1");
  });

  test("Ordens: o stepper de 1 a 10 (11 não é aceito e mostra o erro); Brand é um select; dinheiro em US$ (vazio é vazio, 0 é 0,00)", async ({ page }) => {
    await criarCompraComPaciente(page, unico());
    await expect(page.locator("#compra-ordens")).toHaveValue("1");
    await page.locator("#compra-ordens-mais").click();
    await expect(page.locator("#compra-ordens")).toHaveValue("2");
    await page.locator("#compra-ordens").fill("10");
    await expect(page.locator("[data-resumo-linha='ordens']")).toContainText("10");
    await page.locator("#compra-ordens").fill("11");
    await expect(page.locator("#compra-linha-ordens-erro")).toHaveText("Nº Ordem inválido. Use um número inteiro maior ou igual a 1.");
    await page.locator("#compra-ordens").blur();
    await expect(page.locator("#compra-ordens")).toHaveValue("10");
    await expect(page.locator("#compra-linha-ordens-erro")).toHaveCount(0);

    const brand = page.locator("[id^='compra-item-'][id$='-brand']").first();
    await brand.click();
    await expect(page.getByRole("option")).toHaveText(["Selecione", "Bioequivalente", "Referência"]);
    await page.getByRole("option", { name: "Referência" }).click();
    await expect(page.locator("[data-resumo-linha='brand']")).toContainText("Referência");

    const frete = page.locator("#compra-frete");
    await frete.fill("1234,5");
    await frete.blur();
    await expect(frete).toHaveValue("1.234,50");
    const freteReal = page.locator("#compra-frete-real");
    await freteReal.fill("0");
    await freteReal.blur();
    await expect(freteReal).toHaveValue("0,00");
    await expect(page.locator("[data-resumo-linha='frete']")).toContainText("US$ 1.234,50");
  });

  test("Envio + Cia: trocar o modal limpa a cia que não vale; Courier Simples dispensa o despachante e o resumo (cópia) diz 'Despachante: N/A'", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await criarCompraComPaciente(page, unico());
    await expect(page.locator("#compra-cia")).toBeDisabled(); // sem envio, sem cia
    await page.locator("#compra-envio").click();
    await page.getByRole("option", { name: "Air Cargo" }).click();
    await page.locator("#compra-cia").click();
    await page.getByRole("option", { name: "Emirates" }).click();
    await expect(page.locator("[data-resumo-linha='envio']")).toContainText("Air Cargo (Emirates)");
    await page.locator("#compra-envio").click();
    await page.getByRole("option", { name: "Courier Formal" }).click();
    await expect(page.locator("[data-resumo-linha='envio']")).toContainText("Courier Formal");
    await expect(page.locator("[data-resumo-linha='envio']")).not.toContainText("Emirates"); // a cia saiu
    await expect(page.locator("#compra-despachante")).toBeVisible();
    await page.locator("#compra-envio").click();
    await page.getByRole("option", { name: "Courier Simples" }).click();
    await expect(page.locator("#compra-despachante-dispensado")).toContainText("Dispensado");
    await expect(page.locator("#compra-despachante")).toHaveCount(0);
    await page.locator("#btn-copiar-resumo").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Despachante: N/A");
  });

  test("temperatura nova ('TESTE TEMP') e medicamento fora do Cadastro ('TESTE MED PRE-CADASTRO'): o pedido de cadastro é um botão e só sai com temperatura", async ({ page }) => {
    await criarCompraComPaciente(page, unico());
    const medicamento = primeiroMedicamento(page);
    await medicamento.fill("teste med pre-cadastro");
    const bloco = page.locator("[id$='-fora-do-cadastro']").first();
    await expect(bloco).toContainText("Fora do Cadastro.");
    await expect(bloco).toContainText("Nome para o cadastro:");
    const pedir = bloco.getByRole("button", { name: "Pedir cadastro" });
    await expect(pedir).toBeDisabled(); // sem temperatura
    await expect(pedir).toHaveAttribute("title", "Escolha a temperatura antes de pedir o cadastro.");
    const temperatura = page.locator("[id^='compra-item-'][id$='-temperatura']").first();
    await temperatura.click();
    await page.getByRole("option", { name: "Outro…" }).click();
    await page.locator("[id$='-temperatura-nova']").fill("TESTE TEMP");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(temperatura).toContainText("TESTE TEMP");
    // Escolher a temperatura NÃO pediu nada sozinho: o bloco continua oferecendo o pedido.
    await expect(pedir).toBeEnabled();
    await pedir.click();
    await expect(page.locator("[id$='-pre-cadastro-pendente']").first()).toContainText("aguardando aprovação");
    await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
    await page.reload({ waitUntil: "networkidle" });
    await expect(primeiroMedicamento(page)).toHaveValue("teste med pre-cadastro");
    await expect(page.locator("[id$='-pre-cadastro-pendente']").first()).toBeVisible();
  });

  test("pendências em chips, texto livre, isenção (sem 'para quem'), verificação, pagamento, termo e 'Mesmo local' persistem ao recarregar", async ({ page }) => {
    await criarCompraComPaciente(page, unico());
    await page.getByRole("button", { name: "Receita médica" }).click();
    await page.getByRole("button", { name: "Documentos assinados" }).click();
    await page.locator("#compra-pendencias-livre").fill("Falta o laudo");
    await page.locator("#compra-isencao").check();
    await expect(page.locator("#compra-isencao-para")).toHaveCount(0);
    await page.locator("#compra-documentos-verificado").click();
    await page.locator("#compra-pagamento-momento-apos_awb").click();
    await page.locator("#compra-termo-posterior-sim").click();
    await page.locator("#compra-termo-observacao").fill("Paga em 30 dias");
    await page.locator("#compra-local").fill("Clínica Teste");
    await page.locator("#compra-entrega-mesmo-local").check();
    await expect(page.locator("#compra-entrega")).toHaveValue("Clínica Teste");
    await expect(page.locator("#compra-entrega")).toBeDisabled();
    await expect(page.locator("[data-resumo-linha='pendencias']")).toContainText("Documentos assinados, Receita médica, Falta o laudo");
    await expect(page.locator("#compra-formulario")).toHaveAttribute("data-salvamento", "salvo");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Receita médica" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#compra-pendencias-livre")).toHaveValue("Falta o laudo");
    await expect(page.locator("#compra-isencao")).toBeChecked();
    await expect(page.locator("#compra-documentos-verificado")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#compra-pagamento-momento-apos_awb")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#compra-termo-observacao")).toHaveValue("Paga em 30 dias");
    await expect(page.locator("#compra-entrega-mesmo-local")).toBeChecked();
  });
});

test.describe("Compras (tela) — sócio: só lê", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!tem(socio) || !tem(admin), "defina E2E_SOCIO_* e E2E_ADMIN_* (o administrador cria a compra que o sócio abre)");

  test("vê a lista e o resumo; sem '+ Nova compra', Duplicar nem Cancelar; campos desabilitados; Copiar resumo habilitado", async ({ browser }) => {
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
    for (const id of ["#compra-paciente", "#compra-processo", "#compra-medico", "#compra-responsavel", "#compra-particular", "#compra-recorrente", "#compra-isencao", "#compra-ordens"]) {
      await expect(page.locator(id)).toBeDisabled();
    }
    await expect(page.locator("#compra-campos")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: "Adicionar medicamento" })).toHaveCount(0);
    await expect(page.locator("[id^='compra-item-'][id$='-quantidade']").first()).toBeDisabled();
    await expect(page.locator("[data-resumo-linha='paciente']")).toContainText("Paciente:");
    await expect(page.locator("#btn-copiar-resumo")).toBeEnabled();
    await expect(page.locator("#btn-encaminhar-dir")).toBeDisabled();
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
