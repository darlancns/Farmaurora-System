import { TAXA_MAX, TAXA_MIN } from "#shared/constants/pagamentos";

/**
 * Converte o texto de uma taxa de câmbio em número.
 *
 * Diferente de `parseBrCurrency` (valores em R$/US$, onde "." é milhar), taxa de
 * câmbio nunca tem separador de milhar: "5.4231" e "5,4231" valem 5.4231.
 * Não trunca casas decimais (as taxas gravadas chegam a 8 casas).
 *
 * Retorna `null` para: vazio, texto não numérico, mais de um separador decimal,
 * zero e negativos. O intervalo permitido é checado à parte (`taxaNoIntervalo`).
 */
export function parseTaxa(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.trim();
  if (!limpo) return null;
  // Só dígitos e, no máximo, UM separador decimal (vírgula ou ponto).
  if (!/^\d+(?:[.,]\d+)?$|^[.,]\d+$/.test(limpo)) return null;
  const valor = Number(limpo.replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

export function taxaNoIntervalo(taxa: number): boolean {
  return Number.isFinite(taxa) && taxa >= TAXA_MIN && taxa <= TAXA_MAX;
}

// parseTaxa + trava de sanidade: o que os campos de taxa da tela usam. Texto
// preenchido mas fora de [TAXA_MIN, TAXA_MAX] também é inválido (null).
export function parseTaxaValida(texto: string | null | undefined): number | null {
  const taxa = parseTaxa(texto);
  return taxa !== null && taxaNoIntervalo(taxa) ? taxa : null;
}

// Mensagem para o campo quando há texto mas a taxa não é utilizável; null se o
// campo está vazio (ainda não preenchido) ou válido.
export function mensagemTaxaInvalida(texto: string | null | undefined): string | null {
  if (!texto || !texto.trim()) return null;
  if (parseTaxaValida(texto) !== null) return null;
  const taxa = parseTaxa(texto);
  if (taxa === null) return "Taxa inválida. Use apenas números, ex: 5,4231.";
  return `Taxa deve estar entre ${TAXA_MIN} e ${TAXA_MAX}.`;
}
