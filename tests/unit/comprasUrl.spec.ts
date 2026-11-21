import { describe, expect, it } from "vitest";
import { lerQueryCompras, mesmaQuery, montarQueryCompras } from "../../app/utils/comprasUrl";

// A URL da página Compras: ?mes=AAAA-MM&id=...&canceladas=1&aba=... Tudo que vem da URL é conferido. Não há filtro por status:
// links antigos com ?status=... são ignorados com segurança.

describe("lerQueryCompras", () => {
  it("lê mês, compra, canceladas e aba", () => {
    expect(lerQueryCompras({ mes: "2026-11", id: "cmp_1731000000_ab12cd", canceladas: "1", aba: "resumo" })).toEqual({
      mes: "2026-11",
      id: "cmp_1731000000_ab12cd",
      canceladas: true,
      aba: "resumo",
    });
  });

  it("sem nada: tudo vazio (o mês corrente é decidido por quem usa, em Brasília)", () => {
    expect(lerQueryCompras({})).toEqual({ mes: null, id: null, canceladas: false, aba: null });
  });

  it("lixo é ignorado: mês fora do formato, id inseguro, canceladas que não é 1, aba desconhecida", () => {
    expect(lerQueryCompras({ mes: "2026-13", id: "../x", canceladas: "sim" })).toEqual({ mes: null, id: null, canceladas: false, aba: null });
    expect(lerQueryCompras({ mes: "novembro", id: "a b", aba: "tabela" })).toEqual({ mes: null, id: null, canceladas: false, aba: null });
    expect(lerQueryCompras({ id: "x".repeat(65) }).id).toBeNull();
  });

  it("valor repetido na URL (?mes=a&mes=b) vale o primeiro", () => {
    expect(lerQueryCompras({ mes: ["2026-10", "2026-11"] })).toMatchObject({ mes: "2026-10" });
  });

  it("um link ANTIGO com ?status= é ignorado: o resto vale e o estado não tem status", () => {
    for (const status of ["rascunho", "pronta", "cancelada", "parcial", "encaminhada", "lixo", ["pronta", "rascunho"]]) {
      const lido = lerQueryCompras({ mes: "2026-11", id: "cmp_1", canceladas: "1", status });
      expect(lido).toEqual({ mes: "2026-11", id: "cmp_1", canceladas: true, aba: null });
      expect("status" in lido).toBe(false);
    }
  });
});

describe("montarQueryCompras", () => {
  it("o mês sempre; id e canceladas só quando em uso", () => {
    expect(montarQueryCompras({ mes: "2026-11", id: null, canceladas: false })).toEqual({ mes: "2026-11" });
    expect(montarQueryCompras({ mes: "2026-11", id: "cmp_1", canceladas: true })).toEqual({ mes: "2026-11", id: "cmp_1", canceladas: "1" });
    expect(montarQueryCompras({ mes: "2026-11", id: "cmp_1", canceladas: false, aba: "formulario" })).toEqual({ mes: "2026-11", id: "cmp_1", aba: "formulario" });
  });

  it("nunca grava status, nem que alguém o passe", () => {
    const query = montarQueryCompras({ mes: "2026-11", id: "cmp_1", canceladas: false, status: "pronta" } as unknown as Parameters<typeof montarQueryCompras>[0]);
    expect(query).toEqual({ mes: "2026-11", id: "cmp_1" });
  });

  it("ida e volta: o que se grava é o que se lê", () => {
    const estado = { mes: "2026-10", id: "cmp_9", canceladas: true, aba: "resumo" as const };
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

  it("uma URL antiga com ?status= difere da nova (sem status): a página a regrava sem o status", () => {
    expect(mesmaQuery({ mes: "2026-11", status: "pronta" }, { mes: "2026-11" })).toBe(false);
  });
});
