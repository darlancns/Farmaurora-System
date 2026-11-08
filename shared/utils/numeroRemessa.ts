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

// ── Stepper do formulário (botões − e +, setas do teclado, blur) ───────────────────────────────────
// Funções puras sobre o TEXTO do campo (o formulário guarda o Nº Remessa como string). Reaproveitam a normalização
// acima: nenhuma regra repetida. Um texto acima do máximo (a máscara deixa digitar até 10 dígitos) conta como o
// máximo: o "+" fica desabilitado e o "−" desce a partir do máximo.

function valorDoCampo(texto: unknown): number {
  return normalizarNumeroRemessa(texto) ?? NUMERO_REMESSA_MAXIMO;
}

/** Texto do campo após "+" / ArrowUp: valor + 1, parando no máximo. Vazio vale 1 (vira 2). */
export function aumentarNumeroRemessa(texto: unknown): string {
  return String(Math.min(NUMERO_REMESSA_MAXIMO, valorDoCampo(texto) + 1));
}

/** Texto do campo após "−" / ArrowDown: valor − 1, parando em 1. Vazio vale 1 (continua 1). */
export function diminuirNumeroRemessa(texto: unknown): string {
  return String(Math.max(1, valorDoCampo(texto) - 1));
}

/** "−" habilitado? Não em 1 (nem com o campo vazio ou 0, que valem 1). */
export function podeDiminuirNumeroRemessa(texto: unknown): boolean {
  return valorDoCampo(texto) > 1;
}

/** "+" habilitado? Não no máximo (2147483647) nem acima dele. */
export function podeAumentarNumeroRemessa(texto: unknown): boolean {
  const n = normalizarNumeroRemessa(texto);
  return n !== undefined && n < NUMERO_REMESSA_MAXIMO;
}

/**
 * Texto do campo ao SAIR dele (blur): vazio ou 0 viram "1" e zeros à esquerda somem. Um valor acima do máximo fica como está
 * (a validação do formulário o recusa com a mensagem de sempre).
 */
export function finalizarNumeroRemessa(texto: string): string {
  const n = normalizarNumeroRemessa(texto);
  return n === undefined ? texto : String(n);
}
