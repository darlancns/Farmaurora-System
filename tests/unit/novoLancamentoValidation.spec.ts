import { describe, expect, it } from "vitest";
import { isValidNovoLancamentoBanco } from "../../server/utils/pagamentoValidation";

// POST /api/pagamentos/banco — forma do body. Além dos campos do lançamento, o
// destino do lote:
//  - sem loteId nem forcarLoteNovo → legado (entra no lote aberto da empresa+moeda)
//  - loteId: "..."                 → grava neste lote específico ("+ Lançamento" de um card)
//  - forcarLoteNovo: true          → cria um lote novo ("+ Novo lote")
//  - os dois juntos                → sempre inválido

const base = {
  empresa: "FARMAURORA",
  moeda: "USD",
  fornecedor: "Poros - Turquia",
  invoice: "INV-1",
  cliente: "Cliente Teste",
  valorMoeda: 1000,
};

describe("isValidNovoLancamentoBanco — campos do lançamento (sem regressão)", () => {
  it("aceita o body legado, sem destino de lote", () => {
    expect(isValidNovoLancamentoBanco(base)).toBe(true);
  });

  it("rejeita valorMoeda <= 0", () => {
    expect(isValidNovoLancamentoBanco({ ...base, valorMoeda: 0 })).toBe(false);
  });

  it("rejeita empresa/moeda fora do enum", () => {
    expect(isValidNovoLancamentoBanco({ ...base, moeda: "GBP" })).toBe(false);
    expect(isValidNovoLancamentoBanco({ ...base, empresa: "OUTRA" })).toBe(false);
  });

  it("rejeita campos de texto vazios", () => {
    expect(isValidNovoLancamentoBanco({ ...base, cliente: "  " })).toBe(false);
  });
});

describe("isValidNovoLancamentoBanco — destino do lote", () => {
  it("aceita loteId sozinho (string não-vazia)", () => {
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "lote_123" })).toBe(true);
  });

  it("aceita forcarLoteNovo: true sozinho", () => {
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: true })).toBe(true);
  });

  it("aceita forcarLoteNovo: false (equivale a ausente)", () => {
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: false })).toBe(true);
  });

  it("rejeita loteId + forcarLoteNovo: true juntos", () => {
    expect(
      isValidNovoLancamentoBanco({ ...base, loteId: "lote_123", forcarLoteNovo: true }),
    ).toBe(false);
  });

  it("aceita loteId + forcarLoteNovo: false (não é conflito)", () => {
    expect(
      isValidNovoLancamentoBanco({ ...base, loteId: "lote_123", forcarLoteNovo: false }),
    ).toBe(true);
  });

  it("rejeita loteId vazio", () => {
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "" })).toBe(false);
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "   " })).toBe(false);
  });

  it("rejeita loteId não-string e forcarLoteNovo não-boolean", () => {
    expect(isValidNovoLancamentoBanco({ ...base, loteId: 123 })).toBe(false);
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: "sim" })).toBe(false);
  });
});
