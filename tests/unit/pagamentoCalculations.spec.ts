import { describe, expect, it } from "vitest";
import type { BancoCambio, LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import {
  calcularTotalReaisLote,
  faixaTaxasLancamentos,
  formatFaixaTaxas,
  formatTaxa,
  montarCotacaoDoLote,
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

// ── Total do lote COM corretagem (uma vez só, banco escolhido) ───────────────
describe("calcularTotalReaisLote — soma a corretagem do banco escolhido", () => {
  const opcoes = (xp: number, rend: number, intex: number) => [
    { banco: "XP" as const, taxaCorretagem: xp, taxa: null },
    { banco: "RENDIMENTO" as const, taxaCorretagem: rend, taxa: null },
    { banco: "INTEX" as const, taxaCorretagem: intex, taxa: null },
  ];

  it("Rendimento 1 ordem: Σ valorReais + corretagem do Rendimento", () => {
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: 5.4231, opcoes: opcoes(30, 50, 20) });
    const lancs = [buildLancamento({ valorMoeda: 1000, taxa: 5.4231, valorReais: 5423.1 })];
    expect(calcularTotalReaisLote(lote, lancs)).toBeCloseTo(5423.1 + 50, 6);
  });

  it("Rendimento 3 ordens: corretagem entra UMA vez (não 3x)", () => {
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: null, opcoes: opcoes(30, 50, 20) });
    const lancs = [
      buildLancamento({ valorMoeda: 1000, taxa: 5.4, valorReais: 5400 }),
      buildLancamento({ valorMoeda: 500, taxa: 5.47, valorReais: 2735 }),
      buildLancamento({ valorMoeda: 250, taxa: 5.43, valorReais: 1357.5 }),
    ];
    expect(calcularTotalReaisLote(lote, lancs)).toBeCloseTo(5400 + 2735 + 1357.5 + 50, 6);
  });

  it("XP e Intex: totalMoeda × taxa + a corretagem do PRÓPRIO banco escolhido", () => {
    const lancs = [buildLancamento({ valorMoeda: 1000 }), buildLancamento({ valorMoeda: 500 })];
    const xp = buildLote({ bancoEscolhido: "XP", taxaEscolhida: 5, opcoes: opcoes(30, 50, 20) });
    const intex = buildLote({ bancoEscolhido: "INTEX", taxaEscolhida: 5, opcoes: opcoes(30, 50, 20) });
    expect(calcularTotalReaisLote(xp, lancs)).toBeCloseTo(1500 * 5 + 30, 6);
    expect(calcularTotalReaisLote(intex, lancs)).toBeCloseTo(1500 * 5 + 20, 6);
  });

  it("corretagem 0 não muda nada (comportamento anterior)", () => {
    const lote = buildLote({ bancoEscolhido: "XP", taxaEscolhida: 5.4 });
    expect(calcularTotalReaisLote(lote, [buildLancamento({ valorMoeda: 1000 })])).toBeCloseTo(5400, 6);
  });

  it("sem banco escolhido continua null ('aguardando'), mesmo com corretagem preenchida", () => {
    const lote = buildLote({ bancoEscolhido: null, opcoes: opcoes(30, 50, 20) });
    expect(calcularTotalReaisLote(lote, [buildLancamento({ valorMoeda: 1000 })])).toBeNull();
  });

  it("XP sem taxaEscolhida continua null", () => {
    const lote = buildLote({ bancoEscolhido: "XP", taxaEscolhida: null, opcoes: opcoes(30, 50, 20) });
    expect(calcularTotalReaisLote(lote, [buildLancamento()])).toBeNull();
  });
});

// ── Card da Cotação: total REAL do Rendimento por ordem ──────────────────────
describe("montarCotacaoDoLote", () => {
  const opcoes = [
    { banco: "XP" as const, taxaCorretagem: 30, taxa: 5.5 },
    { banco: "RENDIMENTO" as const, taxaCorretagem: 50, taxa: 5.4 }, // referência
    { banco: "INTEX" as const, taxaCorretagem: 20, taxa: 5.6 },
  ];
  const lancs = [
    buildLancamento({ valorMoeda: 1000 }),
    buildLancamento({ valorMoeda: 500 }),
    buildLancamento({ valorMoeda: 250 }),
  ];
  const porBanco = (views: ReturnType<typeof montarCotacaoDoLote>, b: BancoCambio) =>
    views.find((v) => v.banco === b)!;

  it("ANTES da escolha: idêntico ao cálculo por taxa de referência (nada mudou)", () => {
    const lote = buildLote({ opcoes });
    const views = montarCotacaoDoLote(lote, opcoes, lancs);
    expect(porBanco(views, "RENDIMENTO").totalReais).toBeCloseTo(1750 * 5.4 + 50, 6);
    expect(porBanco(views, "XP").totalReais).toBeCloseTo(1750 * 5.5 + 30, 6);
    expect(porBanco(views, "RENDIMENTO").totalReaisReal).toBeUndefined();
    expect(porBanco(views, "RENDIMENTO").maisBarato).toBe(true);
  });

  it("Rendimento fechado POR ORDEM: o card mostra o total real e a diferença dos outros compara com ele", () => {
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: null, opcoes });
    // taxas reais por ordem, mais caras que a referência (5,4)
    const fechadas = [
      { ...lancs[0]!, taxa: 5.5, valorReais: 5500 },
      { ...lancs[1]!, taxa: 5.6, valorReais: 2800 },
      { ...lancs[2]!, taxa: 5.7, valorReais: 1425 },
    ];
    const views = montarCotacaoDoLote(lote, opcoes, fechadas);
    const real = 5500 + 2800 + 1425 + 50;

    const rend = porBanco(views, "RENDIMENTO");
    expect(rend.totalReais).toBeCloseTo(real, 6);
    expect(rend.totalReaisReal).toBe(true);
    // é exatamente o número do Banco / da foto
    expect(rend.totalReais).toBeCloseTo(calcularTotalReaisLote(lote, fechadas)!, 6);

    // XP (1750 × 5,5 + 30 = 9657,5) é MAIS BARATO que o real (9775): diferença do Rendimento = +117,5
    const xp = porBanco(views, "XP");
    expect(xp.totalReais).toBeCloseTo(1750 * 5.5 + 30, 6);
    expect(xp.maisBarato).toBe(true);
    expect(xp.diferenca).toBe(0);
    expect(rend.diferenca).toBeCloseTo(real - (1750 * 5.5 + 30), 6);
    expect(rend.maisBarato).toBe(false);
    expect(porBanco(views, "XP").totalReaisReal).toBe(false);
  });

  it("Rendimento com 1 ordem (taxaEscolhida real) NÃO usa o total real: segue o cálculo normal", () => {
    const um = [buildLancamento({ valorMoeda: 1000 })];
    const lote = buildLote({ bancoEscolhido: "RENDIMENTO", taxaEscolhida: 5.4, opcoes });
    const views = montarCotacaoDoLote(lote, opcoes, [{ ...um[0]!, taxa: 5.4, valorReais: 5400 }]);
    expect(porBanco(views, "RENDIMENTO").totalReaisReal).toBeUndefined();
    // mesmo número do Banco: 1000 × 5,4 + 50
    expect(porBanco(views, "RENDIMENTO").totalReais).toBeCloseTo(
      calcularTotalReaisLote(lote, [{ ...um[0]!, taxa: 5.4, valorReais: 5400 }])!,
      6,
    );
  });

  it("XP escolhido: o card do XP mostra o mesmo número do Banco", () => {
    const lote = buildLote({ bancoEscolhido: "XP", taxaEscolhida: 5.5, opcoes });
    const fechadas = lancs.map((l) => ({ ...l, valorReais: l.valorMoeda * 5.5 }));
    const views = montarCotacaoDoLote(lote, opcoes, fechadas);
    expect(porBanco(views, "XP").totalReais).toBeCloseTo(calcularTotalReaisLote(lote, fechadas)!, 6);
  });
});

describe("formatTaxa", () => {
  it("sempre vírgula e 4 casas", () => {
    expect(formatTaxa(5.4231)).toBe("5,4231");
    expect(formatTaxa(5.4)).toBe("5,4000");
    expect(formatTaxa(8)).toBe("8,0000");
    expect(formatTaxa(5.10410027)).toBe("5,1041");
    expect(formatTaxa(5.4231)).not.toContain(".");
  });

  it("formatFaixaTaxas usa o mesmo formato", () => {
    const lancs = [buildLancamento({ taxa: 5.4 }), buildLancamento({ taxa: 5.47 })];
    expect(formatFaixaTaxas(lancs)).toBe("5,4000 – 5,4700");
  });
});
