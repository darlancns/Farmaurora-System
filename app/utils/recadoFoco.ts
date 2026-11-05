import type { Recado } from "#shared/types/recado";
import { DESTAQUE_PROCESSO_MS } from "./processoFoco";

// "Ir até um recado" em /recados: a rota recebe ?recado=<id> (vindo da notificação do sino, via
// notificacao.recadoId). A página escolhe a aba onde o recado está (Recebidos/Enviados), rola até o
// card (id "recado-card-<id>") e o destaca por alguns segundos. Mesmo mecanismo do ?processo=.
export const QUERY_RECADO = "recado";
export const DESTAQUE_RECADO_MS = DESTAQUE_PROCESSO_MS;

export type AbaRecadosComFoco = "recebidos" | "enviados";

export interface RotaRecados {
  path: string;
  query: Record<string, string>;
}

// Sem id (notificação cujo recado já foi apagado: recado_id fica nulo) leva só à lista, sem query.
export function rotaParaRecado(recadoId?: string | null): RotaRecados {
  return { path: "/recados", query: recadoId ? { [QUERY_RECADO]: recadoId } : {} };
}

// `recebidos`/`enviados`: as listas JÁ filtradas da página (sem os que o usuário concluiu).
// null = recado não está em nenhuma delas (apagado, concluído por mim ou sem acesso) — a página
// segue normalmente, sem erro.
export function planejarFocoRecado(
  recebidos: Recado[],
  enviados: Recado[],
  recadoId: string,
): { aba: AbaRecadosComFoco } | null {
  if (recebidos.some((r) => r.id === recadoId)) return { aba: "recebidos" };
  if (enviados.some((r) => r.id === recadoId)) return { aba: "enviados" };
  return null;
}
