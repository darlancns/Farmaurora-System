import { STATUS_PROCESSO_LABELS, STATUS_PROCESSO_ORDER } from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";

export interface StatusProcessoMeta {
  label: string;
  badgeClass: string;
}

// Mapeamento de cor por status combinado com os labels de shared/constants/processos.ts.
const STATUS_PROCESSO_BADGE_CLASS: Record<StatusProcesso, string> = {
  elaboracao_fornecedores: "bg-gray-100 text-gray-700",
  aguardando_inicio: "bg-amber-100 text-amber-800",
  em_transito: "bg-blue-100 text-blue-800",
  desembaraco: "bg-purple-100 text-purple-800",
  liberado: "bg-green-100 text-green-800",
  liberado_parcial: "bg-amber-100 text-amber-800",
  entregue: "bg-green-100 text-green-800",
  outro: "bg-slate-100 text-slate-700", // cor neutra: não é uma etapa do pipeline
};

export const STATUS_PROCESSO_META: Record<StatusProcesso, StatusProcessoMeta> = Object.fromEntries(
  STATUS_PROCESSO_ORDER.map((status) => [
    status,
    { label: STATUS_PROCESSO_LABELS[status], badgeClass: STATUS_PROCESSO_BADGE_CLASS[status] },
  ])
) as Record<StatusProcesso, StatusProcessoMeta>;

export function isStatusEntregue(status: StatusProcesso): boolean {
  return status === "entregue";
}

/**
 * Rótulo do badge do processo: pro status "outro" é o TEXTO digitado (cai em
 * "Outro" se, por dado legado/inconsistente, vier vazio); nos demais, o rótulo
 * do status. A UI trunca o texto longo e mostra o completo no tooltip.
 */
export function rotuloStatusProcesso(processo: Pick<Processo, "status" | "statusOutro">): string {
  if (processo.status === "outro") {
    return processo.statusOutro?.trim() || STATUS_PROCESSO_LABELS.outro;
  }
  return STATUS_PROCESSO_META[processo.status].label;
}
