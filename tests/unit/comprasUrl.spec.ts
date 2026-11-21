import { describe, expect, it } from "vitest";
import { lerQueryCompras, mesmaQuery, montarQueryCompras } from "../../app/utils/comprasUrl";

// A URL da página Compras: ?mes=AAAA-MM&id=...&status=...&canceladas=1&aba=... Tudo que vem da URL é conferido.

describe("lerQueryCompras", () => {
  it("lê mês, compra, filtro e canceladas", () => {
    expect(lerQueryCompras({ mes: "2026-11", id: "cmp_1731000000_ab12cd", status: "pronta", canceladas: "1", aba: "resumo" })).toEqual({
      mes: "2026-11",
      id: "cmp_1731000000_ab12cd",
      status: "pronta",
      canceladas: true,
      aba: "resumo",
    });
  });

  it("sem nada: tudo vazio (o mês corrente é decidido por quem usa, em Brasília)", () => {
    expect(lerQueryCompras({})).toEqual({ mes: null, id: null, status: null, canceladas: false, aba: null });
  });

  it("lixo é ignorado: mês fora do formato, id inseguro, estado desconhecido", () => {
    expect(lerQueryCompras({ mes: "2026-13", id: "../x", status: "todas", canceladas: "sim" })).toEqual({ mes: null, id: null, status: null, canceladas: false, aba: null });
    expect(lerQueryCompras({ mes: "novembro", id: "a b", status: "PRONTA", aba: "tabela" })).toEqual({ mes: null, id: null, status: null, canceladas: false, aba: null });
    expect(lerQueryCompras({ id: "x".repeat(65) }).id).toBeNull();
  });

  it("valor repetido na URL (?mes=a&mes=b) vale o primeiro", () => {
    expect(lerQueryCompras({ mes: ["2026-10", "2026-11"], status: ["rascunho", "pronta"] })).toMatchObject({ mes: "2026-10", status: "rascunho" });
  });

  it("os 3 estados são aceitos; os que saíram (parcial, encaminhada) são ignorados", () => {
    for (const s of ["rascunho", "pronta", "cancelada"]) expect(lerQueryCompras({ status: s }).status).toBe(s);
    for (const s of ["parcial", "encaminhada"]) expect(lerQueryCompras({ status: s }).status).toBeNull();
  });
});

describe("montarQueryCompras", () => {
  it("o mês sempre; id, filtro e canceladas só quando em uso", () => {
    expect(montarQueryCompras({ mes: "2026-11", id: null, status: null, canceladas: false })).toEqual({ mes: "2026-11" });
    expect(montarQueryCompras({ mes: "2026-11", id: "cmp_1", status: "pronta", canceladas: true })).toEqual({ mes: "2026-11", id: "cmp_1", status: "pronta", canceladas: "1" });
    expect(montarQueryCompras({ mes: "2026-11", id: "cmp_1", status: null, canceladas: false, aba: "formulario" })).toEqual({ mes: "2026-11", id: "cmp_1", aba: "formulario" });
  });

  it("ida e volta: o que se grava é o que se lê", () => {
    const estado = { mes: "2026-10", id: "cmp_9", status: "pronta" as const, canceladas: true, aba: "resumo" as const };
    expect(lerQueryCompras(montarQueryCompras(estado))).toEqual(estado);
  });
});

describe("mesmaQuery", () => {
  it("igual com as mesmas chaves e valores (ignora undefined e o primeiro de uma lista)", () => {
    expect(mesmaQuery({ mes: "2026-11" }, { mes: "2026-11" })).toBe(true);
    expect(mesmaQuery({ mes: ["2026-11"], id: undefined }, { mes: "2026-11" })).toBe(true);
    expect(mesmaQuery({ mes: "2026-11" }, { mes: "2026-10" })).toBe(false);
    expect(mesmaQuery({ mes: "2026-11" }, { mes: "2026-11", id: "x" })).toBe(false);
    expect(mesmaQuery({ mes: "2026-11", extra: "1" }, { mes: "2026-11" })).toBe(false);
  });
});
