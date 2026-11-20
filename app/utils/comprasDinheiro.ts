import { formatInvoiceAmountBR, parseBrCurrency } from "./formatters";

// Dinheiro da Compra: o campo é texto na tela e `number | null` no dado. Tudo em US$ (a Compra não tem outra moeda).
// Reaproveita as funções que o app já usa nos valores de invoice (formatInvoiceAmountBR, parseBrCurrency): "$8,550.00",
// "8.550,00" e "8550.5" viram o mesmo valor.

/** O que foi digitado → o valor: vazio (ou sem nenhum dígito) é null (NÃO é zero); "0" é 0. Duas casas, nunca negativo. */
export function dinheiroDoTexto(texto: string): number | null {
  const normalizado = formatInvoiceAmountBR(texto);
  if (normalizado === "") return null;
  return Math.round(parseBrCurrency(normalizado) * 100) / 100;
}

/** O valor → o texto do campo ("1.234,50"); null vira vazio, e zero vira "0,00". */
export function dinheiroParaTexto(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "";
  return formatInvoiceAmountBR(valor.toFixed(2));
}
