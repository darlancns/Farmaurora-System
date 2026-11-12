import { STATUS_PROCESSO_LABELS } from "../constants/processos";
import type { StatusProcesso } from "../types/processo";
import { formatarDiaMes, hojeBrasilia } from "./dataBrasilia";

// Texto e data da atualização gravada quando o processo muda de coluna no Kanban (POST /api/processos/:id/mover).
// Mesmo formato das atualizações automáticas do aviso "Chegou?" (shared/utils/avisoChegada.ts): `data` = DD/MM de
// hoje em Brasília e texto SEM nome de ninguém (a timeline, { data, texto }, nem tem campo de autor).

/** "Status alterado de {rótulo antigo} para {rótulo novo} em DD/MM." — DD/MM de hoje em Brasília. */
export function textoStatusAlterado(de: StatusProcesso, para: StatusProcesso, agora: Date = new Date()): string {
  return `Status alterado de ${STATUS_PROCESSO_LABELS[de]} para ${STATUS_PROCESSO_LABELS[para]} em ${formatarDiaMes(
    hojeBrasilia(agora),
  )}.`;
}

/** Campo `data` da atualização: DD/MM de hoje em Brasília. */
export function dataDaAtualizacaoStatus(agora: Date = new Date()): string {
  return formatarDiaMes(hojeBrasilia(agora));
}
