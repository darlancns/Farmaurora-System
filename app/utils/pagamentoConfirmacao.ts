// Textos da janela de confirmação de "Pago" (lote do Banco e grupos de Despachante/Transporte). Só montam o texto
// com valores que a tela já mostra e já calcula — nenhuma conta nova aqui.
export const TITULO_CONFIRMAR_LOTE = "Marcar este lote como pago?";
export const TITULO_CONFIRMAR_GRUPO = "Marcar este grupo como pago?";
export const ROTULO_CONFIRMAR_PAGO = "Marcar como pago";

export function rotuloQuantidadePagamentos(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? "pagamento" : "pagamentos"}`;
}

// totalReaisLabel: o número do "Total R$" do rodapé do lote, já formatado ("659.988,00"), ou "—" quando ainda não há.
export function mensagemConfirmarLote(input: {
  titulo: string; // "Banco XP"
  dataBR: string; // DD/MM/AAAA
  quantidade: number;
  totalReaisLabel: string;
}): string {
  return `${input.titulo} · ${input.dataBR} · ${rotuloQuantidadePagamentos(input.quantidade)} · Total R$ ${input.totalReaisLabel}. O lote vai para Pagamentos realizados.`;
}

// valorTotalLabel: o número do "Valor total: R$ ..." do cabeçalho do grupo, já formatado.
export function mensagemConfirmarGrupo(input: { nome: string; quantidade: number; valorTotalLabel: string }): string {
  return `${input.nome} · ${rotuloQuantidadePagamentos(input.quantidade)} · Valor total R$ ${input.valorTotalLabel}. O grupo vai para Pagamentos realizados.`;
}
