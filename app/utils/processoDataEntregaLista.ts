import type { Processo } from "#shared/types/processo";
import { formatarDataBR } from "#shared/utils/dataBrasilia";

// Coluna de data da aba Entregues: a DATA DE ENTREGA quando houver (dd/mm/aaaa, title "Entregue em ..."); sem ela (os
// Entregues antigos) a previsão de entrega, como sempre ("—" se vazia), com o title "Previsão de entrega: ...". A ordem da
// lista continua por previsão (ordenarPorPrevisaoEntrega), não por esta coluna.

export interface DataDaLista {
  tipo: "entrega" | "previsao";
  texto: string;
  titulo: string;
}

export function dataEntregaOuPrevisao(processo: Pick<Processo, "datas">): DataDaLista {
  const entrega = formatarDataBR((processo.datas.dataEntrega ?? "").trim());
  if (entrega) return { tipo: "entrega", texto: entrega, titulo: `Entregue em ${entrega}` };
  const previsao = (processo.datas.previsaoEntrega ?? "").trim();
  return { tipo: "previsao", texto: previsao || "—", titulo: previsao ? `Previsão de entrega: ${previsao}` : "Sem previsão de entrega" };
}
