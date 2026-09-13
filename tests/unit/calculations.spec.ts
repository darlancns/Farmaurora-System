import { describe, expect, it } from "vitest";
import type { Patient } from "#shared/types/Patient";
import {
  calculateImposto,
  calculateValorNota,
  isFarmauroraModeloCompleto,
  isNotaCheia,
  withComputedFields,
} from "../../app/utils/calculations";

// TESTE DE CARACTERIZAÇÃO — E-1: calculations.ts (nota cheia).
//
// Objetivo: documentar o que o código FAZ HOJE, não o que deveria fazer. Nenhuma
// linha de app/utils/calculations.ts foi alterada nesta rodada. Se algum caso
// abaixo parecer estranho, ele foi escrito assim de propósito, refletindo o
// comportamento atual — as suspeitas estão listadas no relatório do terminal, não
// corrigidas aqui.
//
// Regra de negócio (conforme cabeçalho do arquivo, já revisada 3x):
//   Critério de nota cheia (estável desde a 2ª revisão):
//     (custoImportacao + despesaTotal + transporteTotal) / alvara < 0.5
//   valorNota quando É cheia (3ª revisão, atual): valorNota = alvara (alvará cheio, sem desconto)
//   valorNota quando NÃO é cheia (estável desde a 1ª): alvara - custoImportacao - despesaTotal - transporteTotal
//   imposto (sempre): valorNota * TAXA_IMPOSTO[empresa]  (FARMAURORA 0.16 / MAINZFARMA 0.135)

function buildPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "pac_1",
    data: "2026-09-10",
    paciente: "João da Silva",
    descricaoCompra: "Importação de medicamento X",
    descricaoResumo: "Medicamento X",
    medicamentos: [{ qtd: "2", medicamento: "Medicamento X 10mg" }],
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    alvara: 1000,
    custoImportacao: 200,
    despesaTotal: 50,
    transporteTotal: 50,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    attachedSlots: [],
    createdAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("isNotaCheia", () => {
  it("NÃO é cheia quando a proporção (custo+despesa+transporte)/alvara está bem acima de 0.5", () => {
    // 600/1000 = 0.6
    expect(isNotaCheia(1000, 600, 0, 0)).toBe(false);
  });

  it("é cheia quando a proporção está bem abaixo de 0.5", () => {
    // (100+50+50)/1000 = 0.2
    expect(isNotaCheia(1000, 100, 50, 50)).toBe(true);
  });

  it("FRONTEIRA: proporção exatamente 0.5 NÃO é cheia — o comparador é `<` (estrito), não `<=`", () => {
    // 500/1000 = 0.5 exatos → 0.5 < 0.5 é false
    expect(isNotaCheia(1000, 500, 0, 0)).toBe(false);
  });

  it("FRONTEIRA: logo abaixo de 0.5 (0.499) é cheia", () => {
    expect(isNotaCheia(1000, 499, 0, 0)).toBe(true);
  });

  it("FRONTEIRA: logo acima de 0.5 (0.501) NÃO é cheia", () => {
    expect(isNotaCheia(1000, 501, 0, 0)).toBe(false);
  });

  it("considera só custoImportacao quando despesaTotal e transporteTotal são 0", () => {
    // 400/1000 = 0.4 → cheia
    expect(isNotaCheia(1000, 400, 0, 0)).toBe(true);
  });

  it("soma dos três custos = 0 com alvara positivo → 0 < 0.5 → é cheia", () => {
    expect(isNotaCheia(1000, 0, 0, 0)).toBe(true);
  });

  it("alvara = 0 → retorna false pelo guard `alvara <= 0` (NÃO divide, não gera Infinity/NaN)", () => {
    expect(isNotaCheia(0, 100, 0, 0)).toBe(false);
  });

  it("alvara negativo → retorna false pelo mesmo guard `alvara <= 0`", () => {
    expect(isNotaCheia(-100, 10, 0, 0)).toBe(false);
  });
});

describe("calculateValorNota", () => {
  it("caso NÃO-cheio: subtrai custoImportacao, despesaTotal E transporteTotal do alvará", () => {
    // (600+100+100)/1000 = 0.8 → não-cheia → 1000 - 600 - 100 - 100 = 200
    expect(calculateValorNota(1000, 600, 100, 100)).toBe(200);
  });

  it("caso cheio: retorna o alvará puro, SEM descontar custo/despesa/transporte", () => {
    // (100+50+50)/1000 = 0.2 → cheia → retorna 1000 (e não 1000 - 200 = 800)
    expect(calculateValorNota(1000, 100, 50, 50)).toBe(1000);
  });

  it("caso NÃO-cheio com custo maior que o alvará: resultado fica NEGATIVO (sem trava em 0)", () => {
    // (900+100+100)/1000 = 1.1 → não-cheia → 1000 - 900 - 100 - 100 = -100
    expect(calculateValorNota(1000, 900, 100, 100)).toBe(-100);
  });

  it("FRONTEIRA 0.5: como não é cheia (comparador `<`), aplica a subtração", () => {
    // 500/1000 = 0.5 → não-cheia → 1000 - 500 - 0 - 0 = 500
    expect(calculateValorNota(1000, 500, 0, 0)).toBe(500);
  });
});

describe("calculateImposto", () => {
  it("FARMAURORA aplica 16% e retorna o produto bruto (centavos quebrados preservados)", () => {
    // 1234.56 * 0.16 = 197.5296
    expect(calculateImposto(1234.56, "FARMAURORA")).toBeCloseTo(197.5296, 9);
  });

  it("MAINZFARMA aplica 13,5% e retorna o produto bruto (centavos quebrados preservados)", () => {
    // 333.33 * 0.135 = 44.99955
    expect(calculateImposto(333.33, "MAINZFARMA")).toBeCloseTo(44.99955, 9);
  });

  it("NÃO arredonda nem trunca para 2 casas — mantém a 3ª casa decimal", () => {
    // 1000.10 * 0.16 = 160.016 (arredondar p/ 2 casas daria 160.02)
    const imposto = calculateImposto(1000.1, "FARMAURORA");
    expect(imposto).toBeCloseTo(160.016, 9);
    expect(imposto).not.toBe(160.02);
  });

  it("valorNota = 0 → imposto 0 para qualquer empresa", () => {
    expect(calculateImposto(0, "FARMAURORA")).toBe(0);
    expect(calculateImposto(0, "MAINZFARMA")).toBe(0);
  });
});

describe("isFarmauroraModeloCompleto", () => {
  it("true: empresa FARMAURORA com despesaTotal > 0", () => {
    expect(
      isFarmauroraModeloCompleto({ empresa: "FARMAURORA", despesaTotal: 10, transporteTotal: 0 })
    ).toBe(true);
  });

  it("true: empresa FARMAURORA com apenas transporteTotal > 0", () => {
    expect(
      isFarmauroraModeloCompleto({ empresa: "FARMAURORA", despesaTotal: 0, transporteTotal: 10 })
    ).toBe(true);
  });

  it("false: empresa MAINZFARMA mesmo com despesa/transporte > 0", () => {
    expect(
      isFarmauroraModeloCompleto({ empresa: "MAINZFARMA", despesaTotal: 10, transporteTotal: 10 })
    ).toBe(false);
  });

  it("false: empresa FARMAURORA com despesaTotal E transporteTotal iguais a 0", () => {
    expect(
      isFarmauroraModeloCompleto({ empresa: "FARMAURORA", despesaTotal: 0, transporteTotal: 0 })
    ).toBe(false);
  });
});

describe("withComputedFields", () => {
  it("caso NÃO-cheio ponta-a-ponta: preserva todos os campos de entrada e adiciona os computados", () => {
    const patient = buildPatient({
      alvara: 1000,
      custoImportacao: 600,
      despesaTotal: 100,
      transporteTotal: 100,
      empresa: "FARMAURORA",
    });

    const result = withComputedFields(patient);

    // Campos originais preservados (spread `...patient`).
    expect(result.id).toBe(patient.id);
    expect(result.paciente).toBe(patient.paciente);
    expect(result.medicamentos).toEqual(patient.medicamentos);
    expect(result.empresa).toBe("FARMAURORA");
    expect(result.alvara).toBe(1000);
    expect(result.custoImportacao).toBe(600);
    expect(result.createdAt).toBe(patient.createdAt);

    // Campos computados: (600+100+100)/1000 = 0.8 → não-cheia.
    expect(result.isNotaCheia).toBe(false);
    expect(result.valorNota).toBe(200); // 1000 - 600 - 100 - 100
    expect(result.imposto).toBeCloseTo(32, 9); // 200 * 0.16
    expect(result.taxaImposto).toBe(0.16);
    expect(result.valorTotal).toBe(1000); // = patient.alvara
  });

  it("caso cheio: a flag isNotaCheia fica true e valorNota reflete o alvará puro", () => {
    const patient = buildPatient({
      alvara: 1000,
      custoImportacao: 100,
      despesaTotal: 50,
      transporteTotal: 50,
      empresa: "MAINZFARMA",
    });

    const result = withComputedFields(patient);

    // (100+50+50)/1000 = 0.2 → cheia.
    expect(result.isNotaCheia).toBe(true);
    expect(result.valorNota).toBe(1000); // alvará puro, sem descontar os 200
    expect(result.imposto).toBeCloseTo(135, 9); // 1000 * 0.135
    expect(result.taxaImposto).toBe(0.135);
    expect(result.valorTotal).toBe(1000);
  });
});
