import type { Processo } from "#shared/types/processo";

// "Ir até um processo" em /processos: a rota recebe ?processo=<id>; a página expande o grupo do
// consultor, troca a aba se preciso, limpa filtros que escondem o processo, rola até a linha
// (id "processo-row-<id>") e a destaca por alguns segundos.
export const QUERY_PROCESSO = "processo";
export const DESTAQUE_PROCESSO_MS = 4000;

export type AbaProcessos = "andamento" | "entregues";

export interface RotaProcesso {
  path: string;
  query: Record<string, string>;
}

export function rotaParaProcesso(processoId: string): RotaProcesso {
  return { path: "/processos", query: { [QUERY_PROCESSO]: processoId } };
}

export interface PlanoFocoProcesso {
  aba: AbaProcessos;
  // true quando busca/status/empresa/responsável deixam o processo fora da lista mostrada.
  limparFiltros: boolean;
}

// `todos`: tudo o que a página carregou. `visiveis`: o que sobra depois dos filtros ativos.
// null = o processo não existe na lista (apagado, ou fora do escopo do usuário).
export function planejarFocoProcesso(
  todos: Processo[],
  visiveis: Processo[],
  processoId: string,
): PlanoFocoProcesso | null {
  const processo = todos.find((p) => p.id === processoId);
  if (!processo) return null;
  return {
    aba: processo.status === "entregue" ? "entregues" : "andamento",
    limparFiltros: !visiveis.some((p) => p.id === processoId),
  };
}

// Valor do ?processo= como texto (vue-router pode entregar string | string[] | null).
export function processoIdDaQuery(valor: unknown): string {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return typeof v === "string" ? v.trim() : "";
}
