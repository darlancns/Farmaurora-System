import { STATUS_PROCESSO_LABELS, STATUS_PROCESSO_ORDER } from "#shared/constants/processos";
import type { StatusProcesso } from "#shared/types/processo";

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
