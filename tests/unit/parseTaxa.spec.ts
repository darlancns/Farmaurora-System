import { describe, expect, it } from "vitest";
import { TAXA_MAX, TAXA_MIN } from "#shared/constants/pagamentos";
import { parseBrCurrency } from "../../app/utils/formatters";
import {
  mensagemTaxaInvalida,
  parseTaxa,
  parseTaxaValida,
  taxaNoIntervalo,
} from "../../app/utils/parseTaxa";

// Taxa de câmbio NÃO é valor monetário: "." nunca é milhar. O bug que motivou
// este parser: parseBrCurrency("5.4231") === 54231 (10.000x).

describe("parseTaxa", () => {
  it.each([
    ["5,4231", 5.4231],
    ["5.4231", 5.4231],
    ["5,4", 5.4],
    ["5.4", 5.4],
    ["  5,4231  ", 5.4231],
    ["5", 5],
    [",5", 0.5],
  ])("%j -> %j", (entrada, esperado) => {
    expect(parseTaxa(entrada)).toBe(esperado);
  });

  it("vírgula e ponto dão exatamente o mesmo número", () => {
    expect(parseTaxa("5,4231")).toBe(parseTaxa("5.4231"));
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["texto", "abc"],
    ["mais de um separador (ponto)", "5.4.2"],
    ["mais de um separador (vírgula)", "5,4,2"],
    ["vírgula e ponto (milhar não existe em taxa)", "1.234,56"],
    ["zero", "0"],
    ["zero decimal", "0,00"],
    ["negativo", "-3"],
    ["separador solto no fim", "5,"],
    ["com símbolo", "R$ 5,42"],
    ["notação científica", "1e3"],
  ])("inválido: %s (%j) -> null", (_nome, entrada) => {
    expect(parseTaxa(entrada)).toBeNull();
  });

  it("null/undefined -> null", () => {
    expect(parseTaxa(null)).toBeNull();
    expect(parseTaxa(undefined)).toBeNull();
  });

  it("NÃO trunca casas decimais (taxas gravadas chegam a 8 casas)", () => {
    expect(parseTaxa("5,10410027")).toBe(5.10410027);
    expect(parseTaxa("5.10410027")).toBe(5.10410027);
    expect(parseTaxa("5,108178")).toBe(5.108178);
    expect(parseTaxa("5,12345678")).toBe(5.12345678);
  });

  it("round-trip: o texto que o rascunho gera ao reabrir (String(taxa) com vírgula) volta igual", () => {
    for (const taxa of [5.4231, 5.10410027, 5.108178, 5.1046, 8, 4.987762]) {
      const comoNoRascunho = String(taxa).replace(".", ",");
      expect(parseTaxa(comoNoRascunho)).toBe(taxa);
    }
  });

  it("o parser de moeda NÃO foi alterado (continua tratando '.' como milhar)", () => {
    expect(parseBrCurrency("5.4231")).toBe(54231);
    expect(parseBrCurrency("1.234,56")).toBe(1234.56);
  });
});

describe("taxaNoIntervalo / parseTaxaValida (trava de sanidade)", () => {
  it(`aceita ${TAXA_MIN} a ${TAXA_MAX} (inclusive)`, () => {
    expect(taxaNoIntervalo(TAXA_MIN)).toBe(true);
    expect(taxaNoIntervalo(5.4231)).toBe(true);
    expect(taxaNoIntervalo(TAXA_MAX)).toBe(true);
  });

  it("rejeita fora do intervalo e não finitos", () => {
    expect(taxaNoIntervalo(0.99)).toBe(false);
    expect(taxaNoIntervalo(20.01)).toBe(false);
    expect(taxaNoIntervalo(54231)).toBe(false);
    expect(taxaNoIntervalo(Number.NaN)).toBe(false);
    expect(taxaNoIntervalo(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("parseTaxaValida: texto fora do intervalo vira null", () => {
    expect(parseTaxaValida("5.4231")).toBe(5.4231);
    expect(parseTaxaValida("54231")).toBeNull();
    expect(parseTaxaValida("0,5")).toBeNull();
    expect(parseTaxaValida("abc")).toBeNull();
    expect(parseTaxaValida("")).toBeNull();
  });
});

describe("mensagemTaxaInvalida", () => {
  it("null para campo vazio ou válido", () => {
    expect(mensagemTaxaInvalida("")).toBeNull();
    expect(mensagemTaxaInvalida("   ")).toBeNull();
    expect(mensagemTaxaInvalida("5,4231")).toBeNull();
    expect(mensagemTaxaInvalida("5.4231")).toBeNull();
  });

  it("mensagem de intervalo para número fora da faixa", () => {
    expect(mensagemTaxaInvalida("54231")).toBe(`Taxa deve estar entre ${TAXA_MIN} e ${TAXA_MAX}.`);
  });

  it("mensagem de formato para texto não numérico", () => {
    expect(mensagemTaxaInvalida("abc")).toContain("inválida");
    expect(mensagemTaxaInvalida("5.4.2")).toContain("inválida");
  });
});
