// Nº Remessa do Follow-Up: inteiro positivo livre (1, 2, 3 … até o limite do integer do Postgres). Sempre tem
// valor: processo novo começa em 1 e, se o campo for esvaziado e salvo, volta a 1.
//
// Funções PURAS, a única fonte da regra: o formulário (cliente) usa a máscara e a normalização; o servidor usa a
// normalização e a validação. Testadas em tests/unit/numeroRemessa.spec.ts.

/** Maior valor do `integer` do Postgres (coluna follow_up.numero_remessa). */
export const NUMERO_REMESSA_MAXIMO = 2147483647;

/** Valor de um processo novo e de um campo esvaziado. */
export const NUMERO_REMESSA_PADRAO = 1;

export const NUMERO_REMESSA_ERRO = "Nº Remessa inválido. Use um número inteiro maior ou igual a 1.";

/**
 * Valor para gravar, ou `undefined` se for inválido.
 * - number: precisa ser inteiro, de 0 a 2147483647 (0 vira 1);
 * - string: sem espaços nas pontas, SÓ dígitos, sem zeros à esquerda ("007" → 7), até 2147483647;
 * - vazio, null, undefined e 0 viram 1 (o Nº Remessa sempre tem valor);
 * - qualquer outra coisa ("abc", "1.5", "-3", "1e3", 2147483648, NaN, boolean, objeto) → undefined.
 */
export function normalizarNumeroRemessa(valor: unknown): number | undefined {
  if (valor === undefined || valor === null) return NUMERO_REMESSA_PADRAO;

  let numero: number;
  if (typeof valor === "number") {
    numero = valor;
  } else if (typeof valor === "string") {
    const texto = valor.trim();
    if (texto === "") return NUMERO_REMESSA_PADRAO;
    if (!/^\d+$/.test(texto)) return undefined;
    numero = Number(texto);
  } else {
    return undefined;
  }

  if (!Number.isInteger(numero) || numero < 0 || numero > NUMERO_REMESSA_MAXIMO) return undefined;
  return numero === 0 ? NUMERO_REMESSA_PADRAO : numero;
}

/** Vazio é válido (vira 1); senão precisa ser um inteiro de 1 a 2147483647. */
export function numeroRemessaValido(valor: unknown): boolean {
  return normalizarNumeroRemessa(valor) !== undefined;
}

export interface NumeroRemessaMascarado {
  valor: string;
  cursor: number;
}

// Cabe no maior valor (10 dígitos); o que passar disso a validação recusa com a mensagem de sempre.
const MAXIMO_DE_DIGITOS = String(NUMERO_REMESSA_MAXIMO).length;

/**
 * Máscara do campo: só dígitos (nada de "e", "+", "-", "." ou letras), sem zeros à esquerda e no máximo 10
 * dígitos. Devolve também onde o cursor deve ficar (a posição no texto digitado, descontando o que saiu antes dele).
 */
export function mascararNumeroRemessa(texto: string, cursor: number | null = null): NumeroRemessaMascarado {
  const posicao = cursor ?? texto.length;
  const digitosAntes = texto.slice(0, posicao).replace(/\D/g, "").length;
  const todos = texto.replace(/\D/g, "");
  const zeros = todos.length - todos.replace(/^0+/, "").length;
  const valor = todos.replace(/^0+/, "").slice(0, MAXIMO_DE_DIGITOS);
  return { valor, cursor: Math.min(valor.length, Math.max(0, digitosAntes - zeros)) };
}
