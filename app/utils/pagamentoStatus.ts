import {
  STATUS_ITEM_GRUPO_CICLO,
  STATUS_ITEM_GRUPO_LABEL,
  STATUS_ITEM_GRUPO_ORDER,
} from "#shared/constants/pagamentos";
import type { StatusItemGrupo } from "#shared/types/Pagamento";

export interface StatusItemGrupoMeta {
  label: string;
  badgeClass: string;
}

// Cor por status do item (Despachante/Transportadora), combinada com os labels
// de shared/constants/pagamentos.ts. Espelha o padrão de app/utils/processoStatus.ts.
const STATUS_ITEM_GRUPO_BADGE_CLASS: Record<StatusItemGrupo, string> = {
  NAO_PAGO: "bg-gray-100 text-gray-700",
  PAGO: "bg-green-100 text-green-800",
  COMPLEMENTO: "bg-amber-100 text-amber-800",
};

export const STATUS_ITEM_GRUPO_META: Record<StatusItemGrupo, StatusItemGrupoMeta> = Object.fromEntries(
  STATUS_ITEM_GRUPO_ORDER.map((status) => [
    status,
    { label: STATUS_ITEM_GRUPO_LABEL[status], badgeClass: STATUS_ITEM_GRUPO_BADGE_CLASS[status] },
  ])
) as Record<StatusItemGrupo, StatusItemGrupoMeta>;

// Próximo estado no ciclo: só "Não pago" ↔ "Complemento". Um item em "Pago"
// (dado antigo) cai em "Não pago" no primeiro clique.
export function proximoStatusItemGrupo(atual: StatusItemGrupo): StatusItemGrupo {
  const i = STATUS_ITEM_GRUPO_CICLO.indexOf(atual);
  const proximo = STATUS_ITEM_GRUPO_CICLO[(i + 1) % STATUS_ITEM_GRUPO_CICLO.length];
  return proximo ?? "NAO_PAGO";
}
