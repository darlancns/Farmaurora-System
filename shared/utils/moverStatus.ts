import { STATUS_PROCESSO_LABELS } from "../constants/processos";
import type { StatusProcesso } from "../types/processo";
import { formatarDiaMes, hojeBrasilia } from "./dataBrasilia";

// Texto e data da atualização gravada quando o processo muda de coluna no Kanban (POST /api/processos/:id/mover).
// Mesmo formato das atualizações automáticas do aviso "Chegou?" (shared/utils/avisoChegada.ts): `data` = DD/MM de
// hoje em Brasília e texto SEM nome de ninguém (a timeline, { data, texto }, nem tem campo de autor).

/**
 * "Status alterado de {rótulo antigo} para {rótulo novo} em DD/MM." — DD/MM de hoje em Brasília; ao ENTREGAR, a Data de entrega
 * confirmada (`dataISO`, "AAAA-MM-DD"), que pode não ser hoje.
 */
export function textoStatusAlterado(
  de: StatusProcesso,
  para: StatusProcesso,
  agora: Date = new Date(),
  dataISO?: string,
): string {
  return `Status alterado de ${STATUS_PROCESSO_LABELS[de]} para ${STATUS_PROCESSO_LABELS[para]} em ${formatarDiaMes(
    dataISO || hojeBrasilia(agora),
  )}.`;
}

/** Campo `data` da atualização: DD/MM de hoje em Brasília (ou da Data de entrega, `dataISO`, ao entregar). */
export function dataDaAtualizacaoStatus(agora: Date = new Date(), dataISO?: string): string {
  return formatarDiaMes(dataISO || hojeBrasilia(agora));
}
