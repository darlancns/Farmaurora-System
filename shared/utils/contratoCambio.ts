// Contrato de câmbio da DIR (campo contratoCambio / coluna contrato_cambio): UMA definição da regra, usada pelo
// formulário (digitação, colagem e validação) e pelo servidor (POST e PATCH). Sem imports: o servidor e o
// navegador carregam este arquivo direto.
//
// Regra: só números, separados por espaço, vírgula ou barra (um ou mais separadores seguidos), ou vazio.
//   ok:     "123456"   "123456 789012"   "123456, 789012"   "123456/789012"   ""
//   recusa: "ABC123"   "123-456"   "Venda a prazo"   "123,"   ",123"

/** O contrato preenchido: dígitos separados por espaço, vírgula ou barra. (Vazio é permitido à parte.) */
export const CONTRATO_CAMBIO_REGEX = /^[0-9]+([ ,/]+[0-9]+)*$/;

export const CONTRATO_CAMBIO_ERRO =
  "Contrato de câmbio inválido. Use só números, separados por espaço, vírgula ou barra (ex.: 123456 789012).";

/** Texto como será gravado: sem espaços nas pontas. */
export function normalizarContratoCambio(valor: string): string {
  return valor.trim();
}

/** Vazio ou no formato (a regra de quem grava). Não-texto nunca é válido. */
export function contratoCambioValido(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  const texto = normalizarContratoCambio(valor);
  return texto === "" || CONTRATO_CAMBIO_REGEX.test(texto);
}

/**
 * Filtro da digitação e da colagem: fica só o que a regra aceita (dígitos, espaço, vírgula e barra). Letras e outros
 * símbolos somem; qualquer espaço (inclusive o inseparável que vem de documentos) vira espaço comum; o campo nunca
 * começa por separador. Separador no fim é permitido enquanto se digita (a validação, ao salvar, recusa se sobrar).
 */
export function filtrarContratoCambio(texto: string): string {
  return texto
    .replace(/\s/g, " ")
    .replace(/[^0-9 ,/]/g, "")
    .replace(/^[ ,/]+/, "");
}
