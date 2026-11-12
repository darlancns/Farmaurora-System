// PO — UMA fonte do formato do PO do Follow-Up: "PO" + ano (2 dígitos) + "-" + mês (2) + "-" + sequência (4).
// Ex.: "PO26-10-0471" (o formato da DIR). Validado no servidor e no formulário, não no banco (numero_po não tem CHECK).
//
// Funções PURAS e sem imports: a regex, a normalização e a máscara de digitação. Testadas em tests/unit/numeroPo.spec.ts.

/** Exemplo do formato (placeholder do campo e texto das mensagens). */
export const NUMERO_PO_EXEMPLO = "PO26-10-0471";

/** Tamanho do PO completo. */
export const NUMERO_PO_LIMITE = 12;

/** O PO completo e válido. */
export const NUMERO_PO_REGEX = /^PO[0-9]{2}-[0-9]{2}-[0-9]{4}$/;

/**
 * O MESMO formato, com um grupo por parte (1 = ano, 2 = mês, 3 = sequência), para quem precisa ler o mês/ano
 * (ano/mês do PO). Tem de casar exatamente com NUMERO_PO_REGEX (travado em numeroPo.spec.ts).
 */
export const NUMERO_PO_REGEX_PARTES = /^PO([0-9]{2})-([0-9]{2})-([0-9]{4})$/;

export const NUMERO_PO_ERRO = `PO inválido. Use o formato ${NUMERO_PO_EXEMPLO} (PO, ano, mês e sequência de 4 números).`;

// ── Normalização e validação ─────────────────────────────────────────────────────────────────────────

/**
 * Valor para gravar: sem espaços (nas pontas e no meio) e em maiúsculas. Vazio, ou só o prefixo "PO" (o que
 * sobra na máscara antes do 1º dígito), vira null. Idempotente: normalizar o já normalizado devolve o mesmo valor.
 */
export function normalizarNumeroPo(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.replace(/\s+/g, "").toUpperCase();
  if (texto === "" || texto === "PO") return null;
  return texto;
}

/** Vazio é válido (campo opcional); preenchido, só o PO COMPLETO (NUMERO_PO_REGEX) vale — incompleto não. */
export function numeroPoValido(valor: string | null | undefined): boolean {
  const normalizado = normalizarNumeroPo(valor);
  if (normalizado === null) return true;
  return NUMERO_PO_REGEX.test(normalizado);
}

// ── Máscara de digitação ─────────────────────────────────────────────────────────────────────────────

export interface OpcoesMascaraNumeroPo {
  /** Valor do campo ANTES desta edição. Permite saber se a pessoa está apagando. */
  anterior?: string;
  /** Posição do cursor no texto digitado. Sem ela, o cursor vai para o fim. */
  cursor?: number | null;
}

export interface NumeroPoMascarado {
  valor: string;
  /** Onde o cursor deve ficar no valor mascarado (logo depois do último dígito aproveitado). */
  cursor: number;
}

const PREFIXO = "PO";
const MAX_DIGITOS = 8; // 2 do ano + 2 do mês + 4 da sequência

const ehDigito = (ch: string): boolean => ch >= "0" && ch <= "9";

// Posição, no valor mascarado, do dígito de índice `i` (0-based): depois do prefixo, com os hífens que vêm antes dele.
const posicaoDoDigito = (i: number): number => PREFIXO.length + i + (i >= 2 ? 1 : 0) + (i >= 4 ? 1 : 0);

/**
 * Máscara PO00-00-0000 aplicada ao que a pessoa digitou ou colou (o campo inteiro).
 * - Só dígitos são aproveitados (letras, espaços e símbolos somem), no máximo 8: ano (2), mês (2) e sequência (4).
 *   Colar "po26100471", "PO26-10-0471", "26-10-0471" ou "po 26 10 0471" dá sempre "PO26-10-0471".
 * - O prefixo "PO" entra sozinho, e os hífens são automáticos: o "-" aparece quando o dígito seguinte é digitado e
 *   nunca sobra pendurado no fim ("PO26-" vira "PO26"), então o backspace passa por todos os estados.
 * - Sem nenhum dígito: digitar "p"/"po" dá "PO"; apagar volta a "PO" e depois a vazio; o resto vira vazio.
 */
export function mascararNumeroPo(texto: string, opcoes: OpcoesMascaraNumeroPo = {}): NumeroPoMascarado {
  const anterior = opcoes.anterior ?? "";

  const digitos: Array<{ bruto: number; ch: string }> = [];
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charAt(i);
    if (ehDigito(ch)) digitos.push({ bruto: i, ch });
  }
  if (digitos.length === 0) return semDigitos(texto, anterior);

  const usados = digitos.slice(0, MAX_DIGITOS);
  let valor = PREFIXO;
  usados.forEach((d, i) => {
    if (i === 2 || i === 4) valor += "-";
    valor += d.ch;
  });

  const cursorBruto = opcoes.cursor ?? texto.length;
  let cursor = PREFIXO.length;
  usados.forEach((d, i) => {
    if (d.bruto < cursorBruto) cursor = posicaoDoDigito(i) + 1;
  });
  return { valor, cursor: Math.min(cursor, valor.length) };
}

// Sem nenhum dígito no campo: vazio, só o prefixo ("PO") ou lixo (letras/símbolos) que é descartado.
function semDigitos(texto: string, anterior: string): NumeroPoMascarado {
  const vazio: NumeroPoMascarado = { valor: "", cursor: 0 };
  const soPrefixo: NumeroPoMascarado = { valor: PREFIXO, cursor: PREFIXO.length };
  const maiusculo = texto.trim().toUpperCase();
  if (maiusculo === "") return vazio;

  // Apagando: "PO2" → "PO" fica; "PO" → "P" (apagou o "O") limpa o campo.
  if (anterior !== "" && texto.length < anterior.length) return maiusculo === PREFIXO ? soPrefixo : vazio;

  // Já só havia o prefixo: letras e símbolos digitados são ignorados.
  if (anterior.trim().toUpperCase() === PREFIXO) return soPrefixo;
  // Começando a digitar o prefixo ("p", "po"); qualquer outro texto sem dígitos (colar) vira vazio.
  return maiusculo === "P" || maiusculo === PREFIXO ? soPrefixo : vazio;
}

/** Só o valor mascarado (ver `mascararNumeroPo`). */
export function formatarNumeroPo(textoDigitado: string, anterior = ""): string {
  return mascararNumeroPo(textoDigitado, { anterior }).valor;
}
