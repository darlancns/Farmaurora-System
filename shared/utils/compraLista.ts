import type { CompraDaLista } from "../types/compra";

// O item da lista do mês a partir de uma compra (ou das linhas lidas pela lista). UMA função, usada pelo servidor (GET /api/compras) e
// pelo cliente (que atualiza o cartão com a compra recém-salva sem reler o mês): os dois sempre concordam nos nomes dos medicamentos.

export interface CompraParaItemDaLista {
  id: string;
  anoMes: string;
  sequencia: number;
  cancelada: boolean;
  paciente: string;
  numeroOrdens: number;
  itens: ReadonlyArray<{ posicao: number; medicamento: string }>;
  /** A versão (updated_at, ISO UTC). */
  atualizadoEm: string;
}

export function itemDaLista(compra: CompraParaItemDaLista): CompraDaLista {
  const nomes: string[] = [];
  for (const i of [...compra.itens].sort((a, b) => a.posicao - b.posicao)) {
    const nome = i.medicamento.trim();
    if (nome !== "" && !nomes.includes(nome)) nomes.push(nome);
  }
  return {
    id: compra.id,
    anoMes: compra.anoMes,
    sequencia: compra.sequencia,
    cancelada: compra.cancelada === true,
    paciente: compra.paciente,
    medicamentos: nomes,
    numeroOrdens: compra.numeroOrdens,
    atualizadoEm: compra.atualizadoEm,
  };
}

// ── A ordem da lista ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * As duas visões da lista do mês: "recentes" (o que foi mexido por último vem primeiro, pela versão `atualizadoEm`) e "numero" (pelo Nº da compra, do
 * maior para o menor; `inverter` troca o sentido). Servidor (a página que ele devolve) e cliente (a lista na tela) ordenam com o MESMO comparador.
 */
export const ORDENS_DA_LISTA = ["recentes", "numero"] as const;
export type OrdemDaLista = (typeof ORDENS_DA_LISTA)[number];

/** A visão de quem nunca escolheu: as mais recentes primeiro. (O servidor, sem `?ordem=`, devolve "numero", como sempre foi.) */
export const ORDEM_PADRAO_DA_LISTA: OrdemDaLista = "recentes";

export function isOrdemDaLista(valor: unknown): valor is OrdemDaLista {
  return typeof valor === "string" && (ORDENS_DA_LISTA as readonly string[]).includes(valor);
}

const instanteDe = (item: Pick<CompraDaLista, "atualizadoEm">): number => {
  const t = Date.parse(item.atualizadoEm);
  return Number.isNaN(t) ? 0 : t;
};
const porId = (a: Pick<CompraDaLista, "id">, b: Pick<CompraDaLista, "id">): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** O comparador da lista (desempate sempre determinístico: o Nº e, por fim, o id). `inverter` vira a lista de cabeça para baixo. */
export function compararDaLista(ordem: OrdemDaLista, inverter = false): (a: CompraDaLista, b: CompraDaLista) => number {
  const base =
    ordem === "recentes"
      ? (a: CompraDaLista, b: CompraDaLista): number => instanteDe(b) - instanteDe(a) || b.sequencia - a.sequencia || porId(a, b)
      : (a: CompraDaLista, b: CompraDaLista): number => b.sequencia - a.sequencia || porId(a, b);
  return inverter ? (a, b) => base(b, a) : base;
}
