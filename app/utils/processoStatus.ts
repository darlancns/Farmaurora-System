import { normalizarStatusProcesso, STATUS_PROCESSO_LABELS, STATUS_PROCESSO_ORDER } from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";

export interface StatusProcessoMeta {
  label: string;
  badgeClass: string;
}

// Mapeamento de cor por status combinado com os labels de shared/constants/processos.ts.
const STATUS_PROCESSO_BADGE_CLASS: Record<StatusProcesso, string> = {
  elaboracao_fornecedores: "bg-gray-100 text-gray-700",
  em_transito: "bg-blue-100 text-blue-800",
  desembaraco: "bg-purple-100 text-purple-800",
  liberado: "bg-green-100 text-green-800",
  entregue: "bg-green-100 text-green-800",
};

export const STATUS_PROCESSO_META: Record<StatusProcesso, StatusProcessoMeta> = Object.fromEntries(
  STATUS_PROCESSO_ORDER.map((status) => [
    status,
    { label: STATUS_PROCESSO_LABELS[status], badgeClass: STATUS_PROCESSO_BADGE_CLASS[status] },
  ])
) as Record<StatusProcesso, StatusProcessoMeta>;

/**
 * Rótulo e cor do status. O servidor já entrega só os 5 status; a normalização aqui é defesa (um valor legado que
 * escapasse nunca deixa o Record sem chave e a tela quebrada).
 */
export function metaDoStatus(status: unknown): StatusProcessoMeta {
  return STATUS_PROCESSO_META[normalizarStatusProcesso(status)];
}

export function isStatusEntregue(status: StatusProcesso): boolean {
  return status === "entregue";
}

/** Rótulo do badge do processo (o rótulo do status). */
export function rotuloStatusProcesso(processo: Pick<Processo, "status">): string {
  return metaDoStatus(processo.status).label;
}
