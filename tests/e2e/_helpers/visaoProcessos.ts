import type { Page } from "@playwright/test";

// Visão do Follow-Up para quem pode editar: desde a Etapa F do Kanban o padrão é o Kanban (app/utils/processoVisao.ts,
// DEFAULT_VISAO). Os specs que testam a LISTA (linhas, grupos por consultor, aba Entregues, detalhe em acordeão)
// fixam a visão Lista antes de qualquer página carregar — é a mesma preferência que a pessoa escolhe no botão
// "Kanban | Lista" (localStorage, chave "followup-visao"). Consultor e só-leitura já veem só a Lista.
export const CHAVE_VISAO_PROCESSOS = "followup-visao";

export async function fixarVisao(page: Page, visao: "lista" | "kanban"): Promise<void> {
  await page.addInitScript(
    ([chave, valor]) => {
      try {
        window.localStorage.setItem(chave, valor);
      } catch {
        // sem localStorage: o teste segue com o padrão
      }
    },
    [CHAVE_VISAO_PROCESSOS, visao] as const,
  );
}

export function fixarVisaoLista(page: Page): Promise<void> {
  return fixarVisao(page, "lista");
}
