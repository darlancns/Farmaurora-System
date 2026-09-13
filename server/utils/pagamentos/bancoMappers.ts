import { BANCOS_CAMBIO, TAXA_CORRETAGEM_PADRAO } from "../../../shared/constants/pagamentos";
import type { BancoCambio, EmpresaPagamento, LancamentoBanco, LoteBanco, Moeda } from "../../../shared/types/Pagamento";
import { num, numOrNull } from "../storeKit";

// Mapeadores puros linha (Supabase) ↔ modelo — sem Supabase/rede, testáveis
// isoladamente (ver tests/unit/bancoMappers.spec.ts).

export interface LoteRow {
  id: string;
  data: string;
  empresa: EmpresaPagamento;
  moeda: Moeda;
  numero_lote: number | string;
  xp_taxa_corretagem: number | string;
  xp_taxa: number | string | null;
  rendimento_taxa_corretagem: number | string;
  rendimento_taxa: number | string | null;
  intex_taxa_corretagem: number | string;
  intex_taxa: number | string | null;
  banco_escolhido: BancoCambio | null;
  taxa_escolhida: number | string | null;
  realizado: boolean;
  pago_em: string | null;
  created_at: string;
}

export interface LancRow {
  id: string;
  lote_id: string;
  data: string;
  empresa: EmpresaPagamento;
  fornecedor: string;
  invoice: string;
  cliente: string;
  valor_moeda: number | string;
  moeda: Moeda;
  valor_reais: number | string | null;
  taxa: number | string | null;
  created_at: string;
}

// Colunas achatadas por banco, na ordem canônica BANCOS_CAMBIO (XP, RENDIMENTO, INTEX).
export const BANCO_COL: Record<BancoCambio, { corretagem: keyof LoteRow; taxa: keyof LoteRow }> = {
  XP: { corretagem: "xp_taxa_corretagem", taxa: "xp_taxa" },
  RENDIMENTO: { corretagem: "rendimento_taxa_corretagem", taxa: "rendimento_taxa" },
  INTEX: { corretagem: "intex_taxa_corretagem", taxa: "intex_taxa" },
};

export function montarLote(row: LoteRow): LoteBanco {
  return {
    id: row.id,
    data: row.data,
    empresa: row.empresa,
    moeda: row.moeda,
    numeroLote: num(row.numero_lote) || 1,
    opcoes: BANCOS_CAMBIO.map((banco) => ({
      banco,
      taxaCorretagem: num(row[BANCO_COL[banco].corretagem]),
      taxa: numOrNull(row[BANCO_COL[banco].taxa]),
    })),
    bancoEscolhido: row.banco_escolhido,
    taxaEscolhida: numOrNull(row.taxa_escolhida),
    realizado: row.realizado,
    pagoEm: row.pago_em,
    createdAt: row.created_at,
  };
}

export function loteToRow(lote: LoteBanco): Record<string, unknown> {
  const opc = (b: BancoCambio) => lote.opcoes.find((o) => o.banco === b);
  return {
    id: lote.id,
    data: lote.data,
    empresa: lote.empresa,
    moeda: lote.moeda,
    numero_lote: lote.numeroLote,
    xp_taxa_corretagem: opc("XP")?.taxaCorretagem ?? TAXA_CORRETAGEM_PADRAO,
    xp_taxa: opc("XP")?.taxa ?? null,
    rendimento_taxa_corretagem: opc("RENDIMENTO")?.taxaCorretagem ?? TAXA_CORRETAGEM_PADRAO,
    rendimento_taxa: opc("RENDIMENTO")?.taxa ?? null,
    intex_taxa_corretagem: opc("INTEX")?.taxaCorretagem ?? TAXA_CORRETAGEM_PADRAO,
    intex_taxa: opc("INTEX")?.taxa ?? null,
    banco_escolhido: lote.bancoEscolhido,
    taxa_escolhida: lote.taxaEscolhida,
    realizado: lote.realizado,
    pago_em: lote.pagoEm,
    created_at: lote.createdAt,
  };
}

export function montarLancamento(row: LancRow): LancamentoBanco {
  return {
    id: row.id,
    loteId: row.lote_id,
    data: row.data,
    empresa: row.empresa,
    fornecedor: row.fornecedor,
    invoice: row.invoice,
    cliente: row.cliente,
    valorMoeda: num(row.valor_moeda),
    moeda: row.moeda,
    valorReais: numOrNull(row.valor_reais),
    taxa: numOrNull(row.taxa),
    createdAt: row.created_at,
  };
}

export function lancToRow(l: LancamentoBanco): Record<string, unknown> {
  return {
    id: l.id,
    lote_id: l.loteId,
    data: l.data,
    empresa: l.empresa,
    fornecedor: l.fornecedor,
    invoice: l.invoice,
    cliente: l.cliente,
    valor_moeda: l.valorMoeda,
    moeda: l.moeda,
    valor_reais: l.valorReais,
    taxa: l.taxa,
    created_at: l.createdAt,
  };
}
