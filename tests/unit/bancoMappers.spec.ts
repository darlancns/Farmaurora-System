import { describe, expect, it } from "vitest";
import type { LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import {
  lancToRow,
  loteToRow,
  montarLancamento,
  montarLote,
  type LancRow,
  type LoteRow,
} from "../../server/utils/pagamentos/bancoMappers";

// Mapeadores puros linha (Supabase) ↔ modelo, extraídos de pagamentosStore.ts
// na Round 8 (Passo 2) — cobertura de ida e volta com um caso realista de cada.

describe("montarLote", () => {
  it("mapeia uma row completa, com taxas como string (quirk comum do Supabase)", () => {
    const row: LoteRow = {
      id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      moeda: "USD",
      numero_lote: "2",
      xp_taxa_corretagem: "0",
      xp_taxa: "5.15",
      rendimento_taxa_corretagem: "0",
      rendimento_taxa: null,
      intex_taxa_corretagem: "0",
      intex_taxa: null,
      banco_escolhido: "XP",
      taxa_escolhida: "5.15",
      realizado: false,
      pago_em: null,
      created_at: "2026-09-10T00:00:00.000Z",
    };

    expect(montarLote(row)).toEqual<LoteBanco>({
      id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      moeda: "USD",
      numeroLote: 2,
      opcoes: [
        { banco: "XP", taxaCorretagem: 0, taxa: 5.15 },
        { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null },
        { banco: "INTEX", taxaCorretagem: 0, taxa: null },
      ],
      bancoEscolhido: "XP",
      taxaEscolhida: 5.15,
      realizado: false,
      pagoEm: null,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
  });

  it("numero_lote 0 (ou não numérico) cai no default 1, não fica 0", () => {
    const row: LoteRow = {
      id: "lote_2",
      data: "2026-09-10",
      empresa: "MAINZFARMA",
      moeda: "EUR",
      numero_lote: 0,
      xp_taxa_corretagem: 0,
      xp_taxa: null,
      rendimento_taxa_corretagem: 0,
      rendimento_taxa: null,
      intex_taxa_corretagem: 0,
      intex_taxa: null,
      banco_escolhido: null,
      taxa_escolhida: null,
      realizado: false,
      pago_em: null,
      created_at: "2026-09-10T00:00:00.000Z",
    };

    expect(montarLote(row).numeroLote).toBe(1);
  });
});

describe("loteToRow", () => {
  it("achata um LoteBanco de volta pra row", () => {
    const lote: LoteBanco = {
      id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      moeda: "USD",
      numeroLote: 2,
      opcoes: [
        { banco: "XP", taxaCorretagem: 0, taxa: 5.15 },
        { banco: "RENDIMENTO", taxaCorretagem: 10, taxa: null },
        { banco: "INTEX", taxaCorretagem: 0, taxa: null },
      ],
      bancoEscolhido: "XP",
      taxaEscolhida: 5.15,
      realizado: false,
      pagoEm: null,
      createdAt: "2026-09-10T00:00:00.000Z",
    };

    expect(loteToRow(lote)).toEqual({
      id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      moeda: "USD",
      numero_lote: 2,
      xp_taxa_corretagem: 0,
      xp_taxa: 5.15,
      rendimento_taxa_corretagem: 10,
      rendimento_taxa: null,
      intex_taxa_corretagem: 0,
      intex_taxa: null,
      banco_escolhido: "XP",
      taxa_escolhida: 5.15,
      realizado: false,
      pago_em: null,
      created_at: "2026-09-10T00:00:00.000Z",
    });
  });

  it("banco ausente em opcoes cai no default de corretagem (TAXA_CORRETAGEM_PADRAO)", () => {
    const lote: LoteBanco = {
      id: "lote_3",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      moeda: "USD",
      numeroLote: 1,
      opcoes: [], // nenhum banco presente
      bancoEscolhido: null,
      taxaEscolhida: null,
      realizado: false,
      pagoEm: null,
      createdAt: "2026-09-10T00:00:00.000Z",
    };

    const row = loteToRow(lote);
    expect(row.xp_taxa_corretagem).toBe(0);
    expect(row.xp_taxa).toBeNull();
  });
});

describe("montarLancamento", () => {
  it("mapeia uma row completa, com valores numéricos como string", () => {
    const row: LancRow = {
      id: "lanc_1",
      lote_id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      fornecedor: "Poros - Turquia",
      invoice: "INV-1",
      cliente: "Cliente A",
      valor_moeda: "1000",
      moeda: "USD",
      valor_reais: "5150",
      taxa: "5.15",
      created_at: "2026-09-10T00:00:00.000Z",
    };

    expect(montarLancamento(row)).toEqual<LancamentoBanco>({
      id: "lanc_1",
      loteId: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      fornecedor: "Poros - Turquia",
      invoice: "INV-1",
      cliente: "Cliente A",
      valorMoeda: 1000,
      moeda: "USD",
      valorReais: 5150,
      taxa: 5.15,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
  });

  it("valor_reais e taxa null (lançamento pendente de cotação)", () => {
    const row: LancRow = {
      id: "lanc_2",
      lote_id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      fornecedor: "Poros - Turquia",
      invoice: "INV-2",
      cliente: "Cliente B",
      valor_moeda: 500,
      moeda: "USD",
      valor_reais: null,
      taxa: null,
      created_at: "2026-09-10T00:00:00.000Z",
    };

    const lanc = montarLancamento(row);
    expect(lanc.valorReais).toBeNull();
    expect(lanc.taxa).toBeNull();
  });
});

describe("lancToRow", () => {
  it("achata um LancamentoBanco de volta pra row", () => {
    const lanc: LancamentoBanco = {
      id: "lanc_1",
      loteId: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      fornecedor: "Poros - Turquia",
      invoice: "INV-1",
      cliente: "Cliente A",
      valorMoeda: 1000,
      moeda: "USD",
      valorReais: 5150,
      taxa: 5.15,
      createdAt: "2026-09-10T00:00:00.000Z",
    };

    expect(lancToRow(lanc)).toEqual({
      id: "lanc_1",
      lote_id: "lote_1",
      data: "2026-09-10",
      empresa: "FARMAURORA",
      fornecedor: "Poros - Turquia",
      invoice: "INV-1",
      cliente: "Cliente A",
      valor_moeda: 1000,
      moeda: "USD",
      valor_reais: 5150,
      taxa: 5.15,
      created_at: "2026-09-10T00:00:00.000Z",
    });
  });
});
