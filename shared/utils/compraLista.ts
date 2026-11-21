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
