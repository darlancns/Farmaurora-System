import { expect, type Page } from "@playwright/test";

// Proteção contra envio repetido do formulário de processo (Novo / Editar), compartilhada pelos specs de 1280 (desktop) e de
// celular/tablet. Pré-condição: o modal está aberto e o describe já registrou um page.route em /api/processos que responde
// POST/PATCH sem persistir (não grava nada no banco).

export type ModoFormulario = "novo" | "editar";

const ROTA_PROCESSOS = /\/api\/processos(\/[^/?]+)?(\?.*)?$/;

/** Deixa o formulário aberto pronto para um envio válido (Novo: paciente, pasta e consultor; Editar: troca o Nº AWB). */
async function prepararEnvio(page: Page, modo: ModoFormulario): Promise<void> {
  if (modo === "novo") {
    await page.locator("#pf-paciente").fill("Samuel Correia de Medeiros");
    await page.locator("#pf-pasta").fill("2026234");
    await page.locator("#pf-consultor").click();
    await page.locator("#pf-consultor-listbox li", { hasText: "Alessandra" }).click();
  } else {
    await page.locator("#pf-awb").fill("ZZ999999999BR");
  }
}

/**
 * Resposta ATRASADA (e com erro 500) ao 1º envio:
 *  - duplo clique + Enter durante o envio geram exatamente 1 requisição;
 *  - o botão fica `disabled` com `aria-busy`, a região viva diz "Salvando…" e o botão e o cabeçalho têm EXATAMENTE a mesma
 *    caixa (x, y, largura e altura) antes, durante e depois;
 *  - o erro reabilita o botão, o modal segue aberto e um novo envio passa (2ª requisição).
 */
export async function verificarEnvioRepetido(page: Page, modo: ModoFormulario): Promise<void> {
  await prepararEnvio(page, modo);

  const pedidos: string[] = [];
  let liberar!: () => void;
  const portao = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await page.route(ROTA_PROCESSOS, async (route) => {
    const metodo = route.request().method();
    if (metodo !== "POST" && metodo !== "PATCH") return route.fallback();
    pedidos.push(metodo);
    if (pedidos.length === 1) {
      await portao;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ statusMessage: "Falha simulada." }),
      });
    }
    return route.fallback(); // 2º envio: cai no handler do describe, que responde sem persistir
  });

  const salvar = page.locator("#btn-save-processo");
  const cabecalho = page.locator("#btn-close-processo-form").locator("xpath=..");
  const medir = async () => ({ salvar: await salvar.boundingBox(), cabecalho: await cabecalho.boundingBox() });
  const antes = await medir();

  await salvar.dblclick();
  await expect(salvar).toBeDisabled();
  await expect(salvar).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#processo-salvando-anuncio")).toHaveText("Salvando…");
  await page.locator(modo === "novo" ? "#pf-paciente" : "#pf-awb").press("Enter"); // Enter durante o envio
  await page.waitForTimeout(200);
  expect(pedidos, "duplo clique e Enter geram UMA requisição").toHaveLength(1);
  expect(await medir(), "botão e cabeçalho com a mesma caixa durante o envio").toEqual(antes);

  liberar();
  await expect(salvar).toBeEnabled();
  await expect(salvar).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#processo-salvando-anuncio")).toHaveText("");
  await expect(page.locator("#processo-form"), "erro: o modal continua aberto").toBeVisible();
  expect(await medir(), "botão e cabeçalho com a mesma caixa depois do erro").toEqual(antes);
  expect(pedidos).toHaveLength(1);

  await salvar.click(); // reabilitou: novo envio passa
  await expect(page.locator("#processo-form")).toHaveCount(0);
  expect(pedidos).toHaveLength(2);
}
