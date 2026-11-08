// Nº Ordem (PO) do Follow-Up: "PO-00-0000", opcionalmente seguido de "/" e de um texto livre.
// Ex.: "PO-25-0123" e "PO-25-0123/ALGUMA COISA". Sempre em MAIÚSCULAS (inclusive o texto livre).
//
// Funções PURAS, a única fonte da regra: o formulário (cliente) usa a máscara e a validação; o servidor
// usa a normalização e a validação. Testadas em tests/unit/numeroOrdem.spec.ts.

/** Limite de caracteres do valor inteiro (prefixo + números + barra + texto livre). */
export const NUMERO_ORDEM_LIMITE = 60;

/** Formato aceito, já normalizado (maiúsculas, sem espaços nas pontas, sem "/" final vazio). */
export const NUMERO_ORDEM_REGEX = /^PO-\d{2}-\d{4}(\/.+)?$/;

export const NUMERO_ORDEM_ERRO = "Nº Ordem inválido. Use o formato PO-00-0000 (opcionalmente seguido de /texto).";

const PREFIXO = "PO-";
const DIGITOS_MAXIMOS = 6; // 2 + 4

// ── Normalização e validação (cliente e servidor) ──────────────────────────────────────────────

/**
 * Valor para gravar: sem espaços nas pontas, em maiúsculas, sem "/" final sem texto depois; vazio → null.
 * Idempotente: normalizar o já normalizado devolve o mesmo valor.
 */
export function normalizarNumeroOrdem(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  let texto = valor.trim().toUpperCase();
  let anterior: string;
  do {
    anterior = texto;
    texto = texto.replace(/\/+$/, "").trimEnd();
  } while (texto !== anterior);
  return texto === "" ? null : texto;
}

/** Vazio é válido (campo opcional); senão exige PO-00-0000 (+ "/texto" opcional), até 60 caracteres. */
export function numeroOrdemValido(valor: string | null | undefined): boolean {
  const normalizado = normalizarNumeroOrdem(valor);
  if (normalizado === null) return true;
  return normalizado.length <= NUMERO_ORDEM_LIMITE && NUMERO_ORDEM_REGEX.test(normalizado);
}

// ── Máscara de digitação ────────────────────────────────────────────────────────────────────────

export interface OpcoesMascaraNumeroOrdem {
  /** Valor do campo ANTES desta edição. Permite saber se a pessoa está apagando e se já havia texto livre. */
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
  tamanho: number; // quantos caracteres ele ocupa no valor mascarado
}

/**
 * Máscara PO-00-0000[/texto] aplicada ao que a pessoa digitou ou colou (o campo inteiro).
 * - "PO-" entra sozinho; só dígitos nas duas partes numéricas (2, "-", 4). Letras/símbolos antes da barra são
 *   descartados, então "po", "PO-25" e "po 25 0123" funcionam. Nunca sobra "-" no fim ("PO-25", não "PO-25-"),
 *   por isso o backspace nunca trava num separador.
 * - Com os 4 dígitos completos, a "/" libera o texto livre (qualquer caractere, em maiúsculas). Se já havia texto
 *   livre (`anterior` com "/"), ele é mantido mesmo enquanto se apaga um dígito antes da barra.
 * - Apagar o "-" de "PO-" limpa o campo; limite de 60 caracteres no total.
 */
export function mascararNumeroOrdem(texto: string, opcoes: OpcoesMascaraNumeroOrdem = {}): NumeroOrdemMascarado {
  const anterior = opcoes.anterior ?? "";
  const idxBarra = texto.indexOf("/");
  const fimCabeca = idxBarra >= 0 ? idxBarra : texto.length;

  const marcas: Marca[] = [];
  let valor = PREFIXO;

  // Dígitos, antes da barra (o resto do "cabeçalho" — "PO", espaços, hífens, letras — é ignorado).
  let digitos = 0;
  for (let i = 0; i < fimCabeca && digitos < DIGITOS_MAXIMOS; i++) {
    const ch = texto.charAt(i);
    if (ch < "0" || ch > "9") continue;
    const separador = digitos >= 2 ? 1 : 0; // o "-" entre as duas partes
    const formatado = PREFIXO.length + digitos + separador;
    if (separador === 1 && digitos === 2) valor += "-";
    valor += ch;
    marcas.push({ bruto: i, formatado, tamanho: 1 });
    digitos++;
  }

  if (digitos === 0) {
    // Sem nenhum número: ou o campo está vazio/apagado, ou só há o prefixo.
    const apagando = anterior !== "" && texto.length < anterior.length;
    if (texto.trim() === "") return { valor: "", cursor: 0 };
    if (apagando) {
      const ficouSoPrefixo = texto.toUpperCase() === PREFIXO;
      return ficouSoPrefixo ? { valor: PREFIXO, cursor: PREFIXO.length } : { valor: "", cursor: 0 };
    }
    return { valor: PREFIXO, cursor: PREFIXO.length };
  }

  // Texto livre: a "/" só é nova com os 4 dígitos completos; com texto livre já existente, a barra se mantém.
  const temBarra = idxBarra >= 0 && (digitos === DIGITOS_MAXIMOS || anterior.includes("/"));
  if (temBarra) {
    const posBarra = valor.length; // sempre logo após o último dígito
    valor += "/";
    marcas.push({ bruto: idxBarra, formatado: posBarra, tamanho: 1 });
    for (let i = idxBarra + 1; i < texto.length; i++) {
      const ch = texto.charAt(i).toUpperCase();
      marcas.push({ bruto: i, formatado: valor.length, tamanho: ch.length });
      valor += ch;
    }
  }

  if (valor.length > NUMERO_ORDEM_LIMITE) valor = valor.slice(0, NUMERO_ORDEM_LIMITE);

  const cursorBruto = opcoes.cursor ?? texto.length;
  let cursor = PREFIXO.length;
  for (const marca of marcas) {
    if (marca.bruto >= cursorBruto) break;
    cursor = marca.formatado + marca.tamanho;
  }
  return { valor, cursor: Math.min(cursor, valor.length) };
}

/** Só o valor mascarado (ver `mascararNumeroOrdem`). */
export function formatarNumeroOrdem(textoDigitado: string, anterior = ""): string {
  return mascararNumeroOrdem(textoDigitado, { anterior }).valor;
}
