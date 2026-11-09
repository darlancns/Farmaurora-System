// Formatação de data/hora da DIR. Instantes (timestamptz) são mostrados SEMPRE em Brasília
// (America/Sao_Paulo), no servidor e no navegador, sem depender do fuso da máquina — mesma técnica
// de shared/utils/dataBrasilia.ts (Intl resolve o fuso).

const DATA_HORA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Instante ISO → "dd/mm hh:mm" em Brasília. Vazio ou inválido devolve "". */
export function formatarDataHoraBrasilia(instante: string): string {
  if (!instante) return "";
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return "";
  const partes = DATA_HORA_BRASILIA.formatToParts(d);
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pega("day")}/${pega("month")} ${pega("hour")}:${pega("minute")}`;
}
