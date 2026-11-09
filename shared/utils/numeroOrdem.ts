// Nº Ordem (PO) do Follow-Up: "PO-" + 2 dígitos + "-" + 1 a 4 dígitos + opcionalmente "/" + SÓ NÚMEROS.
// Ex.: "PO-25-2652", "PO-25-11", "PO-25-2652/3", "PO-25-11/12". Sempre em MAIÚSCULAS (o prefixo PO).
// Valores incompletos ("PO-2", "PO-25", "PO-25-1") são permitidos: salvar incompleto não é bloqueado.
//
// Funções PURAS, a única fonte da regra: o formulário (cliente) usa a máscara e a normalização; o servidor
// usa a normalização e a validação. Testadas em tests/unit/numeroOrdem.spec.ts.

/** Limite de caracteres do valor inteiro. */
export const NUMERO_ORDEM_LIMITE = 30;

/** Tudo que a máscara pode produzir (inclusive incompleto), já normalizado. */
export const NUMERO_ORDEM_REGEX = /^PO-\d{1,2}(-\d{1,4}(\/\d+)?)?$/;

export const NUMERO_ORDEM_ERRO =
  "PO inválido. Use o formato PO-00-0000 (opcionalmente seguido de / e números).";

const PREFIXO = "PO-";
const DIGITOS_ANO = 2; // "25" de PO-25-...
const DIGITOS_SEQUENCIA = 4; // até "2652" de PO-25-2652

// ── Normalização e validação (cliente e servidor) ──────────────────────────────────────────────

/**
 * Valor para gravar: sem espaços nas pontas, em maiúsculas, sem "/" final sem dígitos depois. Se sobrar só
 * "PO" ou "PO-" (ou nada), vira null. Idempotente: normalizar o já normalizado devolve o mesmo valor.
 */
export function normalizarNumeroOrdem(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  let texto = valor.trim().toUpperCase();
  let anterior: string;
  do {
    anterior = texto;
    texto = texto.replace(/\/+$/, "").trimEnd();
  } while (texto !== anterior);
  if (texto === "" || texto === "PO" || texto === PREFIXO) return null;
  return texto;
}

/** Vazio é válido (campo opcional); senão precisa casar com NUMERO_ORDEM_REGEX (até 30 caracteres). */
export function numeroOrdemValido(valor: string | null | undefined): boolean {
  const normalizado = normalizarNumeroOrdem(valor);
  if (normalizado === null) return true;
  return normalizado.length <= NUMERO_ORDEM_LIMITE && NUMERO_ORDEM_REGEX.test(normalizado);
}

// ── Máscara de digitação ────────────────────────────────────────────────────────────────────────

export interface OpcoesMascaraNumeroOrdem {
  /** Valor do campo ANTES desta edição. Permite saber se a pessoa está apagando. */
  anterior?: string;
  /** Posição do cursor no texto digitado. Sem ela, o cursor vai para o fim. */
  cursor?: number | null;
}

export interface NumeroOrdemMascarado {
  valor: string;
  /** Onde o cursor deve ficar no valor mascarado (logo depois do último caractere aproveitado). */
  cursor: number;
}

interface Marca {
  bruto: number; // índice do caractere no texto digitado
  formatado: number; // índice no valor mascarado
}

const ehDigito = (ch: string): boolean => ch >= "0" && ch <= "9";

/**
 * Máscara PO-00-0000[/números] aplicada ao que a pessoa digitou ou colou (o campo inteiro).
 * - "PO-" entra sozinho; só dígitos são aproveitados (letras, espaços e símbolos somem): 2 do ano, até 4 da
 *   sequência e, depois da barra, quantos vierem.
 * - A "/" é automática: o 5º dígito da sequência passa para depois dela ("2652" + "3" → "2652/3"). Manual: com
 *   ao menos 1 dígito da sequência, a "/" digitada é aceita ("PO-25-11/") para continuar; antes disso é ignorada.
 * - Nunca sobra "-" no fim ("po-25-" → "PO-25"): ele aparece quando o 3º dígito é digitado. Assim o backspace passa
 *   por todos os estados ("PO-25-11/3" → "PO-25-11/" → "PO-25-11").
 * - Colar: um hífen ou espaço entre blocos de dígitos é descartado ("po-25-2652-3" → "PO-25-2652/3"); texto sem
 *   dígitos vira vazio (digitar só "p"/"po" dá "PO-"). Apagar o "-" de "PO-" limpa o campo. Limite de 30 caracteres.
 */
export function mascararNumeroOrdem(texto: string, opcoes: OpcoesMascaraNumeroOrdem = {}): NumeroOrdemMascarado {
  const anterior = opcoes.anterior ?? "";
  const idxBarra = texto.indexOf("/");

  // Dígitos (índice no texto digitado): os de antes da primeira barra e os de depois dela.
  const cabeca: number[] = [];
  const cauda: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    if (!ehDigito(texto.charAt(i))) continue;
    (idxBarra >= 0 && i > idxBarra ? cauda : cabeca).push(i);
  }

  if (cabeca.length + cauda.length === 0) return semDigitos(texto, anterior);

  let ano: number[];
  let sequencia: number[];
  let resto: number[];
  let barraManual: boolean;
  if (cabeca.length <= DIGITOS_ANO) {
    // Ainda sem dígito da sequência antes da barra: a "/" é ignorada e os dígitos seguem em fila.
    const fila = [...cabeca, ...cauda];
    ano = fila.slice(0, DIGITOS_ANO);
    sequencia = fila.slice(DIGITOS_ANO, DIGITOS_ANO + DIGITOS_SEQUENCIA);
    resto = fila.slice(DIGITOS_ANO + DIGITOS_SEQUENCIA);
    barraManual = false;
  } else {
    ano = cabeca.slice(0, DIGITOS_ANO);
    sequencia = cabeca.slice(DIGITOS_ANO, DIGITOS_ANO + DIGITOS_SEQUENCIA);
    // Dígitos além da sequência, antes da barra, passam para depois dela (a barra automática).
    const excedente = cabeca.slice(DIGITOS_ANO + DIGITOS_SEQUENCIA);
    resto = [...excedente, ...cauda];
    barraManual = idxBarra >= 0;
  }
  const temBarra = resto.length > 0 || barraManual;

  const marcas: Marca[] = [];
  let valor = PREFIXO;
  const acrescentar = (indices: number[]): void => {
    for (const i of indices) {
      marcas.push({ bruto: i, formatado: valor.length });
      valor += texto.charAt(i);
    }
  };

  acrescentar(ano);
  if (sequencia.length) {
    valor += "-";
    acrescentar(sequencia);
  }
  if (temBarra) {
    // A barra digitada só tem lugar próprio no cursor quando nenhum dígito a precede a mais (sem excedente).
    if (barraManual && cabeca.length <= DIGITOS_ANO + DIGITOS_SEQUENCIA) {
      marcas.push({ bruto: idxBarra, formatado: valor.length });
    }
    valor += "/";
    acrescentar(resto);
  }
  marcas.sort((a, b) => a.bruto - b.bruto);

  if (valor.length > NUMERO_ORDEM_LIMITE) valor = valor.slice(0, NUMERO_ORDEM_LIMITE);

  const cursorBruto = opcoes.cursor ?? texto.length;
  let cursor = PREFIXO.length;
  for (const marca of marcas) {
    if (marca.bruto >= cursorBruto) break;
    cursor = marca.formatado + 1;
  }
  return { valor, cursor: Math.min(cursor, valor.length) };
}

// Sem nenhum dígito no campo: vazio, só o prefixo ("PO-") ou lixo (letras/símbolos) que é descartado.
function semDigitos(texto: string, anterior: string): NumeroOrdemMascarado {
  const vazio: NumeroOrdemMascarado = { valor: "", cursor: 0 };
  const soPrefixo: NumeroOrdemMascarado = { valor: PREFIXO, cursor: PREFIXO.length };
  const maiusculo = texto.trim().toUpperCase();
  if (maiusculo === "") return vazio;

  // Apagando: "PO-2" → "PO-" fica; "PO-" → "PO" (apagou o "-") limpa o campo.
  if (anterior !== "" && texto.length < anterior.length) return maiusculo === PREFIXO ? soPrefixo : vazio;

  // Já só havia o prefixo: letras e símbolos digitados são ignorados.
  if (anterior.trim().toUpperCase() === PREFIXO) return soPrefixo;
  // Começando a digitar o prefixo ("p", "po", "po-"); qualquer outro texto sem dígitos (colar) vira vazio.
  return /^(P|PO|PO-)$/.test(maiusculo) ? soPrefixo : vazio;
}

/** Só o valor mascarado (ver `mascararNumeroOrdem`). */
export function formatarNumeroOrdem(textoDigitado: string, anterior = ""): string {
  return mascararNumeroOrdem(textoDigitado, { anterior }).valor;
}
