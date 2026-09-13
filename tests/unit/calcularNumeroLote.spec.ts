import { describe, expect, it } from "vitest";
import { calcularNumeroLote } from "../../server/utils/pagamentoLoteNumero";

// Numeração de lotes concorrentes por (empresa + moeda). Recebe os numeroLote dos
// lotes AINDA ABERTOS daquela (empresa + moeda); os pagos não entram.
//  - nenhum aberto            → 1  (uso comum do dia a dia)
//  - algum aberto             → maior + 1
//  - imutável: pagar o Lote 1 não renumera o Lote 2 (some da lista de abertos,
//    mas o 2 permanece 2 porque a função nunca é chamada para relabelar)
//  - reinicia em 1 quando todos foram pagos (lista vazia de novo)

describe("calcularNumeroLote", () => {
  it("dá 1 quando não há lote aberto dessa empresa+moeda", () => {
    expect(calcularNumeroLote([])).toBe(1);
  });

  it("dá 2 quando já existe o Lote 1 aberto", () => {
    expect(calcularNumeroLote([1])).toBe(2);
  });

  it("dá 3 quando Lote 1 e Lote 2 estão abertos", () => {
    expect(calcularNumeroLote([1, 2])).toBe(3);
  });

  it("usa o maior + 1, não a contagem — Lote 1 pago, só o Lote 2 aberto", () => {
    // O Lote 1 já saiu (realizado); resta [2]. Próximo é 3, não 2.
    expect(calcularNumeroLote([2])).toBe(3);
  });

  it("lida com buracos na sequência (Lote 2 pago, abertos = [1, 3])", () => {
    expect(calcularNumeroLote([1, 3])).toBe(4);
  });

  it("reinicia em 1 depois que todos os lotes foram pagos", () => {
    expect(calcularNumeroLote([])).toBe(1);
  });

  it("ordem da entrada não importa", () => {
    expect(calcularNumeroLote([3, 1, 2])).toBe(4);
  });
});
