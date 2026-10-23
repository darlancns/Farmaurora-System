import { describe, expect, it } from "vitest";
import { isValidNovoLancamentoBanco } from "../../server/utils/pagamentoValidation";

// POST /api/pagamentos/banco — forma do body. Além dos campos do lançamento, o
// destino do lote:
//  - sem forcarLoteNovo   → a moeda define o lote (entra no aberto da empresa+moeda,
//                           criando um se não houver) — é o que a UI envia
//  - forcarLoteNovo: true → cria um lote novo (semear testes; a UI não usa)
//  - loteId               → campo removido, sempre inválido

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
  it("aceita forcarLoteNovo: true sozinho", () => {
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: true })).toBe(true);
  });

  it("aceita forcarLoteNovo: false (equivale a ausente)", () => {
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: false })).toBe(true);
  });

  it("rejeita forcarLoteNovo não-boolean", () => {
    expect(isValidNovoLancamentoBanco({ ...base, forcarLoteNovo: "sim" })).toBe(false);
  });

  it("rejeita qualquer loteId (campo removido): cliente antigo não grava no lote errado", () => {
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "lote_123" })).toBe(false);
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "lote_123", forcarLoteNovo: false })).toBe(false);
    expect(isValidNovoLancamentoBanco({ ...base, loteId: "" })).toBe(false);
  });
});
