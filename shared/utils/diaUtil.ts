import { diaDaSemana, parseDataISO, somarDiasISO } from "./dataBrasilia";

// Dia útil no Brasil, para o aviso "Prazo limite pra Manifestação da ANVISA". Datas civis "AAAA-MM-DD"; a conta é de
// calendário puro (UTC, via somarDiasISO e diaDaSemana) — o resultado não depende do fuso da máquina.
//
// Dia útil = segunda a sexta, fora dos FERIADOS NACIONAIS abaixo. Decisões da Cris:
//  - Carnaval e Corpus Christi CONTAM COMO DIA ÚTIL (são ponto facultativo): o aviso pode adiantar 1 dia, nunca atrasar.
//  - Sem feriados locais (DF, estados, municípios).

// Fixos (MM-DD): Confraternização, Tiradentes, Trabalho, Independência, N. Sra. Aparecida, Finados, República,
// Consciência Negra (nacional desde a Lei 14.759/2023) e Natal.
const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"] as const;

/** Domingo de Páscoa (calendário gregoriano), pelo algoritmo anônimo de Meeus/Jones/Butcher. "AAAA-MM-DD". */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados nacionais do ano, em ordem: os 9 fixos + Sexta-feira Santa (Páscoa − 2 dias). */
export function feriadosNacionais(ano: number): string[] {
  const prefixo = String(ano).padStart(4, "0");
  const fixos = FERIADOS_FIXOS.map((mmdd) => `${prefixo}-${mmdd}`);
  const sextaFeiraSanta = somarDiasISO(pascoa(ano), -2);
  return [...fixos, sextaFeiraSanta].sort();
}

// Cache por ano (a lista é pequena e fixa; evita recalcular a Páscoa a cada dia testado).
const cacheFeriados = new Map<number, ReadonlySet<string>>();
function feriadosDoAno(ano: number): ReadonlySet<string> {
  let conjunto = cacheFeriados.get(ano);
  if (!conjunto) {
    conjunto = new Set(feriadosNacionais(ano));
    cacheFeriados.set(ano, conjunto);
  }
  return conjunto;
}

/** `iso` é dia útil (segunda a sexta, fora dos feriados nacionais)? Data inválida: false. */
export function ehDiaUtil(iso: string): boolean {
  const d = parseDataISO(iso);
  if (!d) return false;
  const semana = diaDaSemana(iso);
  if (semana === 0 || semana === 6) return false;
  return !feriadosDoAno(d.ano).has(iso);
}

/**
 * Primeiro dia útil ESTRITAMENTE DEPOIS de `iso`: soma 1 dia e continua somando enquanto for sábado, domingo ou
 * feriado nacional. Ex.: prazo na sexta 27/11/2026 -> segunda 30/11; prazo na quinta 19/11/2026 (20/11 é feriado) ->
 * segunda 23/11. Data inválida devolve "".
 */
export function primeiroDiaUtilApos(iso: string): string {
  if (!parseDataISO(iso)) return "";
  let dia = somarDiasISO(iso, 1);
  while (!ehDiaUtil(dia)) dia = somarDiasISO(dia, 1);
  return dia;
}
