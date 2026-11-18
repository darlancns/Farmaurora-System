import type { Processo } from "#shared/types/processo";

// Etiqueta do pagamento ao FORNECEDOR (Pago / Pendente), compartilhada pelo card do Kanban e pela barra lateral do
// processo. Só existe quando há valor: vazio (ou qualquer outra coisa) = nenhuma etiqueta. Classes: as de sempre do card.
export interface EtiquetaPagamento {
  texto: string;
  classe: string;
}

export function etiquetaPagamentoDe(statusPagamento: Processo["statusPagamento"] | null | undefined): EtiquetaPagamento | null {
  if (statusPagamento === "pago") return { texto: "Pago", classe: "bg-green-100 text-green-800" };
  if (statusPagamento === "pendente") return { texto: "Pendente", classe: "bg-amber-100 text-amber-800" };
  return null;
}
