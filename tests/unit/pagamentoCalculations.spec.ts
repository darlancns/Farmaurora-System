import { describe, expect, it } from "vitest";
import type { BancoCambio, LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import {
  calcularTotalReaisLote,
  faixaTaxasLancamentos,
  formatFaixaTaxas,
  somarValorReais,
  taxasRendimentoCompletas,
} from "../../app/utils/pagamentoCalculations";

// Fechamento por ordem do banco Rendimento: a taxa varia entre lançamentos do
// mesmo lote. XP/Intex seguem com a taxa única do lote — as duas coisas não
// podem regredir uma na outra.

let seq = 0;
function buildLancamento(overrides: Partial<LancamentoBanco> = {}): LancamentoBanco {
  seq += 1;
  return {
    id: `lanc_${seq}`,
    loteId: "lote_1",
    data: "2026-09-10",
    empresa: "FARMAURORA",
    fornecedor: "Poros - Turquia",
    invoice: `INV-${seq}`,
    cliente: `Cliente ${seq}`,
    valorMoeda: 1000,
    moeda: "USD",
    valorReais: null,
    taxa: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function buildLote(overrides: Partial<LoteBanco> = {}): LoteBanco {
  return {
    id: "lote_1",
    data: "2026-09-10",
    empresa: "FARMAURORA",
    moeda: "USD",
    numeroLote: 1,
    opcoes: [
      { banco: "XP", taxaCorretagem: 0, taxa: null },
      { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null },
      { banco: "INTEX", taxaCorretagem: 0, taxa: null },
    ],
    bancoEscolhido: null,
    taxaEscolhida: null,
    realizado: false,
    pagoEm: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("taxasRendimentoCompletas — fechamento parcial não é permitido", () => {
  const ids = ["a", "b", "c"];

  it("true só quando TODOS os pendentes têm taxa > 0", () => {
    expect(
      taxasRendimentoCompletas(ids, [
        { lancamentoId: "a", taxa: 5.4 },
        { lancamentoId: "b", taxa: 5.41 },
        { lancamentoId: "c", taxa: 5.42 },
      ])
    ).toBe(true);
  });

  it("false quando falta algum id", () => {
    expect(
      taxasRendimentoCompletas(ids, [
        { lancamentoId: "a", taxa: 5.4 },
        { lancamentoId: "b", taxa: 5.41 },
      ])
    ).toBe(false);
  });

  it("false quando alguma taxa é <= 0 ou não-finita", () => {
    expect(
      taxasRendimentoCompletas(ids, [
        { lancamentoId: "a", taxa: 5.4 },
        { lancamentoId: "b", taxa: 0 },
        { lancamentoId: "c", taxa: 5.42 },
      ])
    ).toBe(false);
    expect(
      taxasRendimentoCompletas(["a"], [{ lancamentoId: "a", taxa: Number.NaN }])
    ).toBe(false);
  });

  it("false quando não há pendentes", () => {
    expect(taxasRendimentoCompletas([], [])).toBe(false);
  });
});

describe("somarValorReais / faixa de taxas", () => {
  it("soma os valorReais já convertidos (null conta 0)", () => {
    const lancs = [
      buildLancamento({ valorReais: 5400 }),
      buildLancamento({ valorReais: 2705 }),
      buildLancamento({ valorReais: null }),
    ];
    expect(somarValorReais(lancs)).toBe(8105);
  });

  it("faixaTaxasLancamentos pega min/max das taxas por ordem", () => {
    const lancs = [
      buildLancamento({ taxa: 5.47 }),
      buildLancamento({ taxa: 5.4 }),
      buildLancamento({ taxa: 5.4231 }),
    ];
    expect(faixaTaxasLancamentos(lancs)).toEqual({ min: 5.4, max: 5.47 });
    expect(formatFaixaTaxas(lancs)).toBe("5,4000 – 5,4700");
  });

  it("formatFaixaTaxas colapsa quando min === max e é null sem taxas", () => {
    expect(formatFaixaTaxas([buildLancamento({ taxa: 5.4231 })])).toBe("5,4231");
    expect(formatFaixaTaxas([buildLancamento({ taxa: null })])).toBeNull();
  });
});

describe("calcularTotalReaisLote", () => {
  it("null enquanto nenhum banco foi escolhido", () => {
    const lote = buildLote();
    const lancs = [buildLancamento({ valorMoeda: 1000 })];
    expect(calcularTotalReaisLote(lote, lancs)).toBeNull();
  });

  it("XP/Intex: totalMoeda × taxa única (sem regressão)", () => {
    const lote = buildLote({ bancoEscolhido: "XP" as BancoCambio, taxaEscolhida: 5.4 });
    const lancs = [
      buildLancamento({ valorMoeda: 1000, valorReais: 5400, taxa: null }),
      buildLancamento({ valorMoeda: 500, valorReais: 2700, taxa: null }),
    ];
    expect(calcularTotalReaisLote(lote, lancs)).toBeCloseTo(1500 * 5.4, 6);
  });

  it("Rendimento por ordem (taxaEscolhida null): soma dos valorReais individuais", () => {
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: null });
    const lancs = [
      buildLancamento({ valorMoeda: 1000, taxa: 5.4, valorReais: 1000 * 5.4 }),
      buildLancamento({ valorMoeda: 800, taxa: 5.47, valorReais: 800 * 5.47 }),
      buildLancamento({ valorMoeda: 1200, taxa: 5.41, valorReais: 1200 * 5.41 }),
    ];
    // taxas diferentes entre si → total é a soma das conversões individuais
    expect(calcularTotalReaisLote(lote, lancs)).toBeCloseTo(5400 + 4376 + 6492, 6);
  });

  it("Rendimento fechado direto (1 pendente, taxaEscolhida real): mesma soma", () => {
    // O caso "1 ordem" tem taxaEscolhida !== null, mas calcularTotalReaisLote
    // segue pelo ramo RENDIMENTO (soma dos valorReais) — o único lançamento já
    // tem valorReais = valorMoeda × taxa, então o total bate.
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: 5.5 });
    const lancs = [buildLancamento({ valorMoeda: 1000, taxa: 5.5, valorReais: 5500 })];
    expect(calcularTotalReaisLote(lote, lancs)).toBe(5500);
  });
});
