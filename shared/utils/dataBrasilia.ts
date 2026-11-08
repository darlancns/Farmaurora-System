// "Hoje" e datas civis no fuso de Brasília (America/Sao_Paulo), iguais no servidor (Vercel,
// UTC) e no navegador, sem depender do fuso da máquina. Brasil não tem horário de verão desde
// 2019, mas nada aqui usa offset fixo: o Intl resolve o fuso (e o histórico) sozinho.
//
// Datas civis circulam como "YYYY-MM-DD" (texto). A aritmética (somar dias, diferença) é feita
// em UTC sobre o calendário puro — nunca com `new Date("YYYY-MM-DD")` local —, então o
// resultado não muda com o fuso de quem roda.

const FUSO_BRASILIA = "America/Sao_Paulo";

const DIA_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_BRASILIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Hora cheia (0-23) em Brasília. `hourCycle: "h23"` evita o "24" da meia-noite que `hour12: false` produz.
const HORA_BRASILIA = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_BRASILIA,
  hour: "2-digit",
  hourCycle: "h23",
});

const MESES_PT = [
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
];

const DATA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface DataCivil {
  ano: number;
  mes: number; // 1-12
  dia: number; // 1-31
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function paraISO(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

// Dia (YYYY-MM-DD) em Brasília de um instante. Instante inválido devolve "".
export function dataBrasiliaDe(instante: Date | string | number): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return "";
  const partes = DIA_BRASILIA.formatToParts(d);
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pega("year")}-${pega("month")}-${pega("day")}`;
}

// "Hoje" em Brasília. `agora` existe para testar (injetar o instante).
export function hojeBrasilia(agora: Date = new Date()): string {
  return dataBrasiliaDe(agora);
}

// Hora (0-23) em Brasília de um instante, independente do fuso da máquina. Instante inválido devolve NaN.
export function horaBrasilia(agora: Date = new Date()): number {
  if (Number.isNaN(agora.getTime())) return Number.NaN;
  return Number(HORA_BRASILIA.format(agora));
}

// "YYYY-MM-DD" -> componentes, só para datas que existem no calendário (31/02 é null).
export function parseDataISO(iso: string): DataCivil | null {
  const m = DATA_ISO_RE.exec(iso);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia > diasNoMes) return null;
  return { ano, mes, dia };
}

// "YYYY-MM-DD" -> "dd/mm/aaaa" só com texto (sem Date, sem fuso). Inválida devolve "".
export function formatarDataBR(iso: string): string {
  const d = parseDataISO(iso);
  return d ? `${doisDigitos(d.dia)}/${doisDigitos(d.mes)}/${String(d.ano).padStart(4, "0")}` : "";
}

// "YYYY-MM-DD" -> "DD/MM". Inválida devolve "".
export function formatarDiaMes(iso: string): string {
  const d = parseDataISO(iso);
  return d ? `${doisDigitos(d.dia)}/${doisDigitos(d.mes)}` : "";
}

// "YYYY-MM-DD" -> "DD/MM" se o ano é o de `hojeIso`; de OUTRO ano, "DD/MM/AAAA" (mesmo formato que o calendário
// grava nas datas do Processo). Só texto, sem Date. Inválida devolve "".
export function formatarDataCurta(iso: string, hojeIso: string): string {
  const d = parseDataISO(iso);
  if (!d) return "";
  const hoje = parseDataISO(hojeIso);
  const ano = hoje && hoje.ano === d.ano ? "" : `/${String(d.ano).padStart(4, "0")}`;
  return `${doisDigitos(d.dia)}/${doisDigitos(d.mes)}${ano}`;
}

// "YYYY-MM-DD" -> "20 de outubro de 2026" (título do lote). Inválida devolve "".
export function formatarDataLongaBR(iso: string): string {
  const d = parseDataISO(iso);
  return d ? `${doisDigitos(d.dia)} de ${MESES_PT[d.mes - 1]} de ${d.ano}` : "";
}

// true se `iso` é depois do "hoje" de Brasília. Texto que não é data nunca é "futuro".
export function ehDataFutura(iso: string, agora: Date = new Date()): boolean {
  return parseDataISO(iso) !== null && iso > hojeBrasilia(agora);
}

function diaJuliano(d: DataCivil): number {
  return Date.UTC(d.ano, d.mes - 1, d.dia) / MS_POR_DIA;
}

// Soma `dias` (pode ser negativo) a uma data civil. Data inválida devolve "".
export function somarDiasISO(iso: string, dias: number): string {
  const d = parseDataISO(iso);
  if (!d) return "";
  const r = new Date((diaJuliano(d) + dias) * MS_POR_DIA);
  return paraISO(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

// Dias corridos de `b` até `a` (a - b). Data inválida devolve NaN.
export function diferencaEmDias(a: string, b: string): number {
  const da = parseDataISO(a);
  const db = parseDataISO(b);
  if (!da || !db) return Number.NaN;
  return diaJuliano(da) - diaJuliano(db);
}

// Texto inteiro "DD/MM" ou "DD/MM/AAAA" (com 4 dígitos no ano).
export const DATA_BR_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

// Parse defensivo de "DD/MM" ou "DD/MM/AAAA" para uma data civil "YYYY-MM-DD" (ano assumido
// como o ano corrente de Brasília quando omitido). Qualquer outro texto (ex.: "ASD", "já tem",
// string vazia) ou data que não existe (31/02) retorna null — nunca lança erro, nunca inventa
// uma data. Sem `Date` local: o resultado não depende do fuso da máquina.
export function parseDataBR(str: string | undefined | null, hoje: Date = new Date()): string | null {
  if (!str) return null;
  const match = str.trim().match(DATA_BR_RE);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = match[3] ? Number(match[3]) : Number(hojeBrasilia(hoje).slice(0, 4));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = paraISO(ano, mes, dia);
  // parseDataISO rejeita datas inexistentes (ex.: 31/02), que um `new Date` normalizaria em silêncio.
  return parseDataISO(iso) ? iso : null;
}
