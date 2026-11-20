import { TEXTOS_RESUMO } from "../constants/compraResumo";
import { dataBrasiliaDe, hojeBrasilia } from "./dataBrasilia";

// O mês da Compra no cliente e no servidor: tudo em BRASÍLIA (nunca o fuso do navegador). Funções puras.

const ANO_MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const HORA_MINUTO_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function anoMesValido(valor: unknown): valor is string {
  return typeof valor === "string" && ANO_MES_RE.test(valor);
}

/** O mês corrente de BRASÍLIA ("AAAA-MM"). `agora` existe para testar. */
export function anoMesAtualBrasilia(agora: Date = new Date()): string {
  return hojeBrasilia(agora).slice(0, 7);
}

/** O mês de BRASÍLIA de um instante ("AAAA-MM"); instante inválido devolve "". */
export function anoMesDoInstante(instante: Date | string | number): string {
  return dataBrasiliaDe(instante).slice(0, 7);
}

/** "2026-11" + n meses ("2026-12" com 1; "2026-10" com -1; vira o ano). Mês inválido devolve o próprio texto. */
export function somarMeses(anoMes: string, n: number): string {
  const m = ANO_MES_RE.exec(anoMes);
  if (!m) return anoMes;
  const indice = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

/** "2026-11" → "Novembro/2026" (mês por extenso, o mesmo do título do resumo). Mês inválido devolve "". */
export function rotuloDoMes(anoMes: string): string {
  const m = ANO_MES_RE.exec(anoMes);
  return m ? `${TEXTOS_RESUMO.meses[Number(m[2]) - 1]}/${m[1]}` : "";
}

/** "Compra 13 - Novembro/2026": o título do formulário, igual ao da primeira linha do resumo (sem os asteriscos). */
export function tituloDaCompra(anoMes: string, sequencia: number): string {
  return `${TEXTOS_RESUMO.compra} ${String(sequencia).padStart(2, "0")} - ${rotuloDoMes(anoMes)}`;
}

/** "Compra 13": o rótulo curto do cartão. */
export function rotuloCurtoDaCompra(sequencia: number): string {
  return `${TEXTOS_RESUMO.compra} ${String(sequencia).padStart(2, "0")}`;
}

/** "16:22": a hora e o minuto em BRASÍLIA de um instante. Inválido devolve "". */
export function horaMinutoBrasilia(instante: Date | string | number): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  return Number.isNaN(d.getTime()) ? "" : HORA_MINUTO_BRASILIA.format(d);
}
