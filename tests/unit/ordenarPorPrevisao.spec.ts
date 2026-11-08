import { describe, expect, it } from "vitest";
import { dataDePrevisao, ordenarPorPrevisaoEntrega } from "../../app/utils/ordenarPorPrevisao";

// Ordem da aba Entregues: "Previsão entrega" por data real, crescente (a mais próxima/antiga primeiro).
// "Hoje" fixo: 07/11/2026 (meio-dia em Brasília).
const HOJE = new Date("2026-11-07T12:00:00-03:00");

const p = (id: string, previsao?: string | null) => ({ id, datas: { previsaoEntrega: previsao } });
const ids = (lista: Array<{ id: string }>) => lista.map((x) => x.id);

describe("dataDePrevisao", () => {
  it.each([
    ["20/08", "2026-08-20"],
    ["05/12", "2026-12-05"],
    ["5/8", "2026-08-05"],
    ["20/08/2027", "2027-08-20"],
    ["  20/08  ", "2026-08-20"],
    ["13/10; deferido 14/10", "2026-10-13"],
    ["26/10 (VCP)", "2026-10-26"],
    ["09/10 - agd. análise", "2026-10-09"],
    ["07/01/2027 (previsto)", "2027-01-07"],
  ])("%j → %s", (texto, iso) => {
    expect(dataDePrevisao(texto, "2026-11-07")).toBe(iso);
  });

  it.each([[undefined], [null], [""], ["   "], ["já tem, compra recorrente"], ["ASD"], ["31/02"], ["31/04 - algo"], ["Entre 28/08 e 02/09"], ["04/11/26"]])(
    "sem data interpretável: %j → null",
    (texto) => {
      expect(dataDePrevisao(texto as string | null | undefined, "2026-11-07")).toBeNull();
    },
  );

  it("sem ano usa o ano de hoje; 29/02 só existe em ano bissexto", () => {
    expect(dataDePrevisao("10/03", "2030-01-01")).toBe("2030-03-10");
    expect(dataDePrevisao("29/02", "2028-05-01")).toBe("2028-02-29");
    expect(dataDePrevisao("29/02", "2026-05-01")).toBeNull();
    expect(dataDePrevisao("29/02/2028", "2026-05-01")).toBe("2028-02-29");
  });
});

describe("ordenarPorPrevisaoEntrega", () => {
  it("só DD/MM: ordena por data real — '05/12' vem DEPOIS de '20/08' (por texto vinha antes)", () => {
    const r = ordenarPorPrevisaoEntrega([p("dez", "05/12"), p("ago", "20/08"), p("jan", "10/01")], HOJE);
    expect(ids(r)).toEqual(["jan", "ago", "dez"]);
  });

  it("mistura DD/MM e DD/MM/AAAA: o ano manda (sem ano = ano de Brasília)", () => {
    const r = ordenarPorPrevisaoEntrega(
      [p("a", "05/01/2027"), p("b", "20/08"), p("c", "30/12/2025"), p("d", "01/12"), p("e", "10/10/2026")],
      HOJE,
    );
    expect(ids(r)).toEqual(["c", "b", "e", "d", "a"]);
  });

  it("virada de ano com ano explícito", () => {
    const r = ordenarPorPrevisaoEntrega([p("jan27", "02/01/2027"), p("dez26", "31/12/2026"), p("dez25", "31/12/2025")], HOJE);
    expect(ids(r)).toEqual(["dez25", "dez26", "jan27"]);
  });

  it("texto antigo com observação depois da data ordena pela data do começo", () => {
    const r = ordenarPorPrevisaoEntrega(
      [p("c", "26/10 (VCP)"), p("a", "13/10; deferido 14/10"), p("b", "09/10 - agd. análise")],
      HOJE,
    );
    expect(ids(r)).toEqual(["b", "a", "c"]);
  });

  it("vazio, null, undefined e texto sem data vão para o FIM, na ordem original entre si", () => {
    const r = ordenarPorPrevisaoEntrega(
      [p("sem1"), p("data2", "20/11"), p("ja-tem", "já tem, compra recorrente"), p("data1", "01/11"), p("nulo", null), p("vazio", ""), p("asd", "ASD")],
      HOJE,
    );
    expect(ids(r)).toEqual(["data1", "data2", "sem1", "ja-tem", "nulo", "vazio", "asd"]);
  });

  it("data inválida (31/02) conta como sem data (fim da lista)", () => {
    const r = ordenarPorPrevisaoEntrega([p("inv", "31/02"), p("ok", "01/12")], HOJE);
    expect(ids(r)).toEqual(["ok", "inv"]);
  });

  it("empates mantêm a ordem original (estável), inclusive 'DD/MM' e 'DD/MM/AAAA' do mesmo dia", () => {
    const r = ordenarPorPrevisaoEntrega(
      [p("x", "10/12"), p("y", "10/12/2026"), p("z", "10/12 (obs)"), p("antes", "09/12")],
      HOJE,
    );
    expect(ids(r)).toEqual(["antes", "x", "y", "z"]);
    const inverso = ordenarPorPrevisaoEntrega([p("z", "10/12 (obs)"), p("y", "10/12/2026"), p("x", "10/12")], HOJE);
    expect(ids(inverso)).toEqual(["z", "y", "x"]);
  });

  it("não altera a lista recebida", () => {
    const original = [p("b", "20/12"), p("a", "01/12")];
    const copia = [...original];
    ordenarPorPrevisaoEntrega(original, HOJE);
    expect(original).toEqual(copia);
  });

  it("lista vazia e de um item", () => {
    expect(ordenarPorPrevisaoEntrega([], HOJE)).toEqual([]);
    expect(ids(ordenarPorPrevisaoEntrega([p("so", "01/01")], HOJE))).toEqual(["so"]);
  });

  it("o ano corrente é o de Brasília (virada às 22:00 BRT de 31/12)", () => {
    const naVirada = new Date("2026-12-31T22:00:00-03:00"); // já é 01/01/2027 em UTC
    const r = ordenarPorPrevisaoEntrega([p("dez", "05/12"), p("jan", "10/01")], naVirada);
    expect(ids(r)).toEqual(["jan", "dez"]); // ambos de 2026 (ano de Brasília): jan < dez
    const depois = ordenarPorPrevisaoEntrega([p("dez", "05/12"), p("jan", "10/01")], new Date("2027-01-01T00:30:00-03:00"));
    expect(ids(depois)).toEqual(["jan", "dez"]); // ambos de 2027
  });

  it("é o MESMO resultado em qualquer fuso da máquina (aritmética de calendário)", () => {
    const r = ordenarPorPrevisaoEntrega([p("c", "01/03"), p("a", "28/02"), p("b", "29/02/2028")], HOJE);
    expect(ids(r)).toEqual(["a", "c", "b"]);
  });
});
