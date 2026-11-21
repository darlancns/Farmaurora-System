import type { CompraDaLista } from "../types/compra";
import { contarPendencias, statusDaCompra, type CompraParaChecklist } from "./compraChecklist";

// O item da lista do mês a partir de uma compra (ou das linhas lidas pela lista). UMA função, usada pelo servidor (GET /api/compras) e
// pelo cliente (que atualiza o cartão com a compra recém-salva sem reler o mês): os dois sempre concordam no estado, nas pendências e
// nos nomes dos medicamentos.

export type CompraParaItemDaLista = CompraParaChecklist & {
  id: string;
  anoMes: string;
  sequencia: number;
  /** A versão (updated_at, ISO UTC). */
  atualizadoEm: string;
};

export function itemDaLista(compra: CompraParaItemDaLista): CompraDaLista {
  const ordens = [...compra.ordens].sort((a, b) => a.posicao - b.posicao);
  const nomes: string[] = [];
  for (const o of ordens) {
    for (const i of [...o.itens].sort((a, b) => a.posicao - b.posicao)) {
      const nome = i.medicamento.trim();
      if (nome !== "" && !nomes.includes(nome)) nomes.push(nome);
    }
  }
  return {
    id: compra.id,
    anoMes: compra.anoMes,
    sequencia: compra.sequencia,
    cancelada: compra.cancelada === true,
    paciente: compra.paciente,
    medicamentos: nomes,
    totalOrdens: ordens.length,
    pendencias: contarPendencias(compra),
    status: statusDaCompra(compra),
    atualizadoEm: compra.atualizadoEm,
  };
}
