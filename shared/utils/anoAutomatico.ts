import { diferencaEmDias, parseDataISO } from "./dataBrasilia";

// Ano automático das datas digitadas só com dia e mês (AppDatePicker com `anoAutomatico`). Função pura: "hoje"
// vem de fora (hojeBrasilia, America/Sao_Paulo) — nada aqui usa o fuso da máquina nem `new Date("YYYY-MM-DD")`.
//
// Dois sentidos:
// - "futuro" (prazos, previsões): a PRÓXIMA ocorrência do dia/mês, contando HOJE.
//   Hoje 17/11/2026: 22/10 -> 22/10/2027; 17/11 -> 17/11/2026; 16/11 -> 16/11/2027.
// - "proximo" (fatos que já aconteceram ou estão acontecendo): o ano que deixa a data MAIS PERTO de hoje.
//   Hoje 17/11/2026: 13/10 -> 13/10/2026; 22/01 -> 22/01/2027. Empate de distância fica com a mais antiga.
// 29/02 só existe em ano bissexto: o ano válido mais próximo conforme o sentido. 31/04 e afins: null.

export type SentidoAno = "futuro" | "proximo";

// Até 8 anos à frente/atrás cobre o 29/02 (bissextos de 4 em 4, com o salto secular de 2100 entre eles).
const JANELA_ANOS = 8;

function paraISO(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Data civil "YYYY-MM-DD" válida para o dia/mês no ano dado, ou null (31/04, 29/02 em ano comum...). */
function isoValido(ano: number, mes: number, dia: number): string | null {
  const iso = paraISO(ano, mes, dia);
  return parseDataISO(iso) ? iso : null;
}

/**
 * Completa o ano de `dia`/`mes` a partir de `hojeIso` ("YYYY-MM-DD" de Brasília). Devolve "YYYY-MM-DD" ou null
 * quando o dia/mês não existe em nenhum ano (31/04, 32/01, 00/05, mês 13).
 */
export function completarAno(dia: number, mes: number, hojeIso: string, sentido: SentidoAno): string | null {
  const hoje = parseDataISO(hojeIso);
  if (!hoje || !Number.isInteger(dia) || !Number.isInteger(mes)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  if (sentido === "futuro") {
    for (let ano = hoje.ano; ano <= hoje.ano + JANELA_ANOS; ano++) {
      const iso = isoValido(ano, mes, dia);
      if (iso && iso >= hojeIso) return iso;
    }
    return null;
  }

  let melhor: string | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;
  for (let ano = hoje.ano - JANELA_ANOS; ano <= hoje.ano + JANELA_ANOS; ano++) {
    const iso = isoValido(ano, mes, dia);
    if (!iso) continue;
    const distancia = Math.abs(diferencaEmDias(iso, hojeIso));
    // Percorre do mais antigo para o mais novo: `<` estrito deixa o empate com a data mais antiga.
    if (distancia < menorDistancia) {
      melhor = iso;
      menorDistancia = distancia;
    }
  }
  return melhor;
}

// ── Texto digitado no campo ────────────────────────────────────────────────────────────────────────────

/**
 * Máscara enquanto digita: só dígitos e "/", no formato DD/MM/AAAA (dia e mês com até 2 dígitos, ano com até 4).
 * - "2210" -> "22/10"; "22102027" -> "22/10/2027": a barra entra quando chega o PRÓXIMO dígito (nunca sozinha no
 *   fim), então apagar com Backspace nunca trava;
 * - "2/" -> "02/" (a barra digitada fecha o dia/mês com zero à esquerda);
 * - letras e outros símbolos são ignorados; dígitos além do ano são descartados.
 */
export function mascararDataDigitada(bruto: string): string {
  const partes: string[] = [""];
  for (const ch of bruto) {
    const i = partes.length - 1;
    const atual = partes[i]!;
    if (ch >= "0" && ch <= "9") {
      const limite = i < 2 ? 2 : 4;
      if (atual.length < limite) {
        partes[i] = atual + ch;
      } else if (i < 2) {
        partes.push(ch);
      }
    } else if (ch === "/") {
      if (atual.length === 0 || i >= 2) continue;
      if (atual.length === 1) partes[i] = `0${atual}`;
      partes.push("");
    }
  }
  return partes.join("/");
}

export type DataDigitada =
  | { tipo: "vazio" }
  | { tipo: "data"; iso: string }
  // Texto que ainda não forma uma data ("22", "22/10/20") ou data que não existe ("31/04", "29/02/2027").
  | { tipo: "invalido"; motivo: "incompleta" | "inexistente" };

const DIA_MES_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const SO_DIGITOS_RE = /^(\d{2})(\d{2})(\d{4})?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Interpreta o texto do campo. Com ano (DD/MM/AAAA) vale o ano digitado; só dia e mês ("22/10" ou "2210"),
 * completa com `completarAno`. Aceita também "AAAA-MM-DD" (colado de outro lugar).
 */
export function interpretarDataDigitada(texto: string, hojeIso: string, sentido: SentidoAno): DataDigitada {
  const limpo = texto.trim().replace(/\/$/, "");
  if (!limpo) return { tipo: "vazio" };

  const iso = ISO_RE.exec(limpo);
  if (iso) {
    const valido = isoValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return valido ? { tipo: "data", iso: valido } : { tipo: "invalido", motivo: "inexistente" };
  }

  const m = DIA_MES_RE.exec(limpo) ?? SO_DIGITOS_RE.exec(limpo);
  if (!m) return { tipo: "invalido", motivo: "incompleta" };

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (m[3]) {
    const valido = isoValido(Number(m[3]), mes, dia);
    return valido ? { tipo: "data", iso: valido } : { tipo: "invalido", motivo: "inexistente" };
  }
  const completo = completarAno(dia, mes, hojeIso, sentido);
  return completo ? { tipo: "data", iso: completo } : { tipo: "invalido", motivo: "inexistente" };
}
