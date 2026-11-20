import { STATUS_DA_COMPRA, type StatusDaCompra } from "#shared/constants/compra";
import { anoMesValido } from "#shared/utils/compraMes";
import { idDaCompraValido } from "#shared/utils/compraValidacao";
import { abaValida, type AbaCompras } from "./comprasAbas";

// A URL da página Compras: ?mes=AAAA-MM&id=...&status=...&canceladas=1&aba=lista|formulario|resumo (a aba só vale abaixo de lg). Recarregar a página (ou colar o link) volta ao mesmo lugar.
// Tudo o que vem da URL é conferido (formato do mês, do id e do estado): lixo é ignorado, nunca vira pedido ao servidor.

export interface EstadoUrlCompras {
  /** O mês ("AAAA-MM"); null = o corrente de Brasília. */
  mes: string | null;
  /** A compra aberta; null = nenhuma. */
  id: string | null;
  status: StatusDaCompra | null;
  canceladas: boolean;
  /** A aba do celular; null = não veio (ou veio lixo). No desktop é ignorada. */
  aba: AbaCompras | null;
}

const primeiro = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

export function lerQueryCompras(query: Record<string, unknown>): EstadoUrlCompras {
  const mes = primeiro(query.mes);
  const id = primeiro(query.id);
  const status = primeiro(query.status);
  const aba = primeiro(query.aba);
  return {
    mes: anoMesValido(mes) ? mes : null,
    id: idDaCompraValido(id) ? id : null,
    status: typeof status === "string" && (STATUS_DA_COMPRA as readonly string[]).includes(status) ? (status as StatusDaCompra) : null,
    canceladas: primeiro(query.canceladas) === "1",
    aba: abaValida(aba) ? aba : null,
  };
}

/** A query a gravar na URL: o mês sempre; o resto só quando está em uso. */
export function montarQueryCompras(estado: { mes: string; id: string | null; status: StatusDaCompra | null; canceladas: boolean; aba?: AbaCompras | null }): Record<string, string> {
  const query: Record<string, string> = { mes: estado.mes };
  if (estado.id) query.id = estado.id;
  if (estado.status) query.status = estado.status;
  if (estado.canceladas) query.canceladas = "1";
  if (estado.aba) query.aba = estado.aba;
  return query;
}

/** Duas queries iguais? (evita regravar a URL à toa.) */
export function mesmaQuery(a: Record<string, unknown>, b: Record<string, string>): boolean {
  const chavesA = Object.keys(a).filter((k) => a[k] !== undefined);
  const chavesB = Object.keys(b);
  return chavesA.length === chavesB.length && chavesB.every((k) => primeiro(a[k]) === b[k]);
}
