import { formatarDataBR, formatarDataCurta, parseDataISO, somarDiasISO } from "#shared/utils/dataBrasilia";

// Lógica pura do calendário próprio (app/components/AppDatePicker.vue): grade do mês, navegação, limites,
// formatos de gravação e a leitura do valor que já existe no campo. Datas civis circulam como "YYYY-MM-DD"
// e a aritmética é de calendário (UTC), nunca com `new Date("YYYY-MM-DD")` local — o resultado não muda com
// o fuso de quem roda. "Hoje" vem sempre de fora (hojeBrasilia), para testar com datas fixas.

export type FormatoData = "dd/mm" | "iso";

export const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

// Semana começando no domingo.
export const DIAS_DA_SEMANA = [
  { curto: "dom", completo: "domingo" },
  { curto: "seg", completo: "segunda-feira" },
  { curto: "ter", completo: "terça-feira" },
  { curto: "qua", completo: "quarta-feira" },
  { curto: "qui", completo: "quinta-feira" },
  { curto: "sex", completo: "sexta-feira" },
  { curto: "sáb", completo: "sábado" },
] as const;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

export function paraISO(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** 0 = domingo … 6 = sábado. Data inválida devolve -1. */
export function diaDaSemana(iso: string): number {
  const d = parseDataISO(iso);
  return d ? new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay() : -1;
}

export interface CelulaDoDia {
  iso: string;
  dia: number;
  doMes: boolean; // false = dia de outro mês (aparece esmaecido)
}

/** 6 semanas × 7 dias (altura sempre igual), domingo primeiro, com os dias vizinhos do mês anterior/seguinte. */
export function gradeDoMes(ano: number, mes: number): CelulaDoDia[][] {
  const primeiro = paraISO(ano, mes, 1);
  const inicio = somarDiasISO(primeiro, -diaDaSemana(primeiro));
  const semanas: CelulaDoDia[][] = [];
  for (let s = 0; s < 6; s++) {
    const semana: CelulaDoDia[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = somarDiasISO(inicio, s * 7 + d);
      const data = parseDataISO(iso)!;
      semana.push({ iso, dia: data.dia, doMes: data.ano === ano && data.mes === mes });
    }
    semanas.push(semana);
  }
  return semanas;
}

/** Soma meses mantendo o dia, ou o último dia do mês se ele não existir (31/01 + 1 mês = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const d = parseDataISO(iso);
  if (!d) return "";
  const total = d.ano * 12 + (d.mes - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return paraISO(ano, mes, Math.min(d.dia, diasNoMes(ano, mes)));
}

export const somarAnos = (iso: string, anos: number): string => somarMeses(iso, anos * 12);

// ── Limites (min e max são datas civis ISO, inclusivos) ─────────────────────────────────────────────

export function dentroDoIntervalo(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export function limitarAoIntervalo(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** O mês inteiro está fora dos limites? (para desabilitar as setas de mês) */
export function mesForaDoIntervalo(ano: number, mes: number, min?: string, max?: string): boolean {
  const primeiro = paraISO(ano, mes, 1);
  const ultimo = paraISO(ano, mes, diasNoMes(ano, mes));
  return (max !== undefined && max !== "" && primeiro > max) || (min !== undefined && min !== "" && ultimo < min);
}

// ── Formatos de gravação ────────────────────────────────────────────────────────────────────────────

/**
 * Valor a gravar para o dia escolhido.
 * - "iso": "AAAA-MM-DD".
 * - "dd/mm": "DD/MM" se o dia é do ano corrente (de Brasília, `hojeIso`); de OUTRO ano, "DD/MM/AAAA".
 *   Nunca grava texto com observação.
 */
export function formatarEscolha(iso: string, formato: FormatoData, hojeIso: string): string {
  const d = parseDataISO(iso);
  if (!d) return "";
  if (formato === "iso") return iso;
  return formatarDataCurta(iso, hojeIso);
}

// ── Leitura do valor que já está no campo ───────────────────────────────────────────────────────────

// Data limpa: o texto INTEIRO é DD/MM ou DD/MM/AAAA (mesmo critério estrito de parseDataBR, em prazoFornecedor.ts).
const DATA_LIMPA_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
// Primeira data NO INÍCIO de um texto livre (mesmo critério de interpretarDataEmbarque/interpretarRegistroLpco): o
// lookahead recusa continuações como "04/11/26" ou "04/112".
const PRIMEIRA_DATA_RE = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/;

export type ValorInterpretado =
  | { tipo: "vazio" }
  | { tipo: "data"; iso: string }
  // Qualquer outro texto (anotação, data inválida, formato desconhecido): fica como está. `isoInicial` é a
  // data DD/MM que o texto traz no início (para pré-selecionar no calendário), ou null.
  | { tipo: "texto"; texto: string; isoInicial: string | null };

function isoDeDiaMes(dia: string, mes: string, ano: string | undefined, hojeIso: string): string | null {
  const anoNumero = ano ? Number(ano) : parseDataISO(hojeIso)?.ano;
  if (anoNumero === undefined) return null;
  const iso = paraISO(anoNumero, Number(mes), Number(dia));
  return parseDataISO(iso) ? iso : null; // rejeita 31/02 e afins
}

export function interpretarValor(valor: string, formato: FormatoData, hojeIso: string): ValorInterpretado {
  const texto = valor.trim();
  if (!texto) return { tipo: "vazio" };

  if (formato === "iso") {
    return parseDataISO(texto) ? { tipo: "data", iso: texto } : { tipo: "texto", texto, isoInicial: null };
  }

  const limpa = DATA_LIMPA_RE.exec(texto);
  if (limpa) {
    const iso = isoDeDiaMes(limpa[1]!, limpa[2]!, limpa[3], hojeIso);
    if (iso) return { tipo: "data", iso };
    return { tipo: "texto", texto, isoInicial: null };
  }

  const inicio = PRIMEIRA_DATA_RE.exec(texto);
  const isoInicial = inicio ? isoDeDiaMes(inicio[1]!, inicio[2]!, inicio[3], hojeIso) : null;
  return { tipo: "texto", texto, isoInicial };
}

/** O que o campo mostra: a data limpa como está gravada (ISO vira dd/mm/aaaa) e o texto antigo exatamente como está. */
export function textoParaExibir(valor: string, formato: FormatoData, hojeIso: string): string {
  const lido = interpretarValor(valor, formato, hojeIso);
  if (lido.tipo === "vazio") return "";
  if (lido.tipo === "texto") return lido.texto;
  return formato === "iso" ? formatarDataBR(lido.iso) : valor.trim();
}

// ── Rótulos (pt-BR) ─────────────────────────────────────────────────────────────────────────────────

/** "5 de novembro de 2026" */
export function rotuloDoDia(iso: string): string {
  const d = parseDataISO(iso);
  return d ? `${d.dia} de ${MESES[d.mes - 1]} de ${d.ano}` : "";
}

/** "Novembro de 2026" */
export function tituloDoMes(ano: number, mes: number): string {
  const nome = MESES[mes - 1] ?? "";
  return `${nome.charAt(0).toLocaleUpperCase("pt-BR")}${nome.slice(1)} de ${ano}`;
}

export const capitalizar = (texto: string): string => `${texto.charAt(0).toLocaleUpperCase("pt-BR")}${texto.slice(1)}`;
