import type { EmpresaPagamento, LoteBanco, Moeda } from "#shared/types/Pagamento";
import { formatarDataLongaBR } from "#shared/utils/dataBrasilia";

// "Novo pagamento" no Banco: a moeda define o lote. Quem decide o destino é o
// servidor (criarLancamentoBanco); o que está aqui só espelha a escolha dele para
// AVISAR no modal — não há nenhuma regra de gravação ou de cálculo.

export const AVISO_LOTE_COTADO = "Este lote já foi cotado. Adicionar o pagamento reabre a cotação.";

// Data longa exibida no título do lote em aberto ("20 de outubro de 2026").
export function formatDataLote(iso: string): string {
  return formatarDataLongaBR(iso);
}

// Lotes abertos da (empresa + moeda), do mais recente ao mais antigo — a mesma
// ordem em que o servidor escolhe o destino (created_at desc, id asc).
export function lotesAbertosDaMoeda(
  lotes: LoteBanco[],
  empresa: EmpresaPagamento,
  moeda: Moeda,
): LoteBanco[] {
  return lotes
    .filter((l) => l.empresa === empresa && l.moeda === moeda && !l.realizado)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function avisosDestinoNovoPagamento(
  lotes: LoteBanco[],
  empresa: EmpresaPagamento,
  moeda: Moeda,
): string[] {
  const abertos = lotesAbertosDaMoeda(lotes, empresa, moeda);
  const alvo = abertos[0];
  if (!alvo) return [];

  const avisos: string[] = [];
  if (abertos.length > 1) {
    avisos.push(
      `Há ${abertos.length} lotes em ${moeda} em aberto. Este entra no mais recente (${formatDataLote(alvo.data)}).`,
    );
  }
  if (alvo.bancoEscolhido !== null) avisos.push(AVISO_LOTE_COTADO);
  return avisos;
}
