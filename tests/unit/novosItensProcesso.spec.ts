import { describe, expect, it } from "vitest";
import { novasAtualizacoes, novasPendencias } from "../../shared/utils/novosItensProcesso";

// Itens NOVOS de uma lista (diferença de multiconjuntos). Formulário e timeline anexam no FIM; só o que
// ENTRA avisa: editar (sai um, entra outro) e apagar dão saldo <= 0 e não geram nada.

describe("novasPendencias", () => {
  it("adicionar 1 → esse item", () => {
    expect(novasPendencias(["A"], ["A", "B"])).toEqual(["B"]);
  });

  it("adicionar vários → todos, na ordem", () => {
    expect(novasPendencias(["A"], ["A", "B", "C", "D"])).toEqual(["B", "C", "D"]);
  });

  it("editar o texto de um item → nenhum", () => {
    expect(novasPendencias(["A", "B"], ["A", "B editada"])).toEqual([]);
    expect(novasPendencias(["A", "B"], ["A editada", "B"])).toEqual([]);
  });

  it("apagar → nenhum (um, vários, todos)", () => {
    expect(novasPendencias(["A", "B"], ["A"])).toEqual([]);
    expect(novasPendencias(["A", "B", "C"], ["B"])).toEqual([]);
    expect(novasPendencias(["A", "B"], [])).toEqual([]);
  });

  it("editar + adicionar → só o item anexado no fim (1 aviso)", () => {
    expect(novasPendencias(["A", "B"], ["A", "B editada", "C"])).toEqual(["C"]);
  });

  it("apagar + adicionar → saldo zero, nenhum (a lista só trocou de item)", () => {
    expect(novasPendencias(["A", "B"], ["A", "C"])).toEqual([]);
  });

  it("apagar 1 e adicionar 2 → saldo 1: o último adicionado", () => {
    expect(novasPendencias(["A", "B"], ["A", "C", "D"])).toEqual(["D"]);
  });

  it("duplicatas contam: repetir um texto já existente é item novo", () => {
    expect(novasPendencias(["A"], ["A", "A"])).toEqual(["A"]);
    expect(novasPendencias(["A", "A"], ["A", "A", "A", "A"])).toEqual(["A", "A"]);
  });

  it("duplicatas: apagar uma de duas iguais → nenhum", () => {
    expect(novasPendencias(["A", "A"], ["A"])).toEqual([]);
  });

  it("espaços nas pontas não distinguem itens e o resultado vem com trim", () => {
    expect(novasPendencias(["  A "], ["A", "  B  "])).toEqual(["B"]);
    expect(novasPendencias(["A"], [" A  "])).toEqual([]);
  });

  it("itens vazios (ou só espaços) são ignorados dos dois lados", () => {
    expect(novasPendencias(["A"], ["A", "", "   "])).toEqual([]);
    expect(novasPendencias(["A", ""], ["A", "B"])).toEqual(["B"]);
  });

  it("listas vazias", () => {
    expect(novasPendencias([], [])).toEqual([]);
    expect(novasPendencias([], ["A", "B"])).toEqual(["A", "B"]);
    expect(novasPendencias(["A"], [])).toEqual([]);
  });

  it("não altera as listas recebidas", () => {
    const antes = ["A"];
    const depois = ["A", "B"];
    novasPendencias(antes, depois);
    expect(antes).toEqual(["A"]);
    expect(depois).toEqual(["A", "B"]);
  });
});

describe("novasAtualizacoes — comparadas por { data, texto }", () => {
  const a = (data: string, texto: string) => ({ data, texto });

  it("adicionar 1 / vários", () => {
    expect(novasAtualizacoes([a("01/09", "X")], [a("01/09", "X"), a("02/09", "Y")])).toEqual([a("02/09", "Y")]);
    expect(novasAtualizacoes([], [a("01/09", "X"), a("", "Y")])).toEqual([a("01/09", "X"), a("", "Y")]);
  });

  it("editar o texto → nenhum; editar só a data → nenhum", () => {
    expect(novasAtualizacoes([a("01/09", "X")], [a("01/09", "X editado")])).toEqual([]);
    expect(novasAtualizacoes([a("01/09", "X")], [a("05/09", "X")])).toEqual([]);
  });

  it("apagar → nenhum", () => {
    expect(novasAtualizacoes([a("01/09", "X"), a("02/09", "Y")], [a("02/09", "Y")])).toEqual([]);
  });

  it("editar + adicionar → 1 (o do fim)", () => {
    expect(
      novasAtualizacoes([a("01/09", "X")], [a("01/09", "X editado"), a("08/11", "Chegada confirmada em 08/11.")]),
    ).toEqual([a("08/11", "Chegada confirmada em 08/11.")]);
  });

  it("mesmo texto com data diferente é um item diferente; mesma data e texto repetidos contam", () => {
    expect(novasAtualizacoes([a("01/09", "X")], [a("01/09", "X"), a("02/09", "X")])).toEqual([a("02/09", "X")]);
    expect(novasAtualizacoes([a("01/09", "X")], [a("01/09", "X"), a("01/09", "X")])).toEqual([a("01/09", "X")]);
  });

  it("espaços: trim em data e texto, resultado normalizado", () => {
    expect(novasAtualizacoes([a(" 01/09 ", " X ")], [a("01/09", "X"), a(" 02/09", "  Y ")])).toEqual([a("02/09", "Y")]);
  });

  it("texto vazio é ignorado; listas vazias", () => {
    expect(novasAtualizacoes([], [a("01/09", "   ")])).toEqual([]);
    expect(novasAtualizacoes([], [])).toEqual([]);
    expect(novasAtualizacoes([a("01/09", "X")], [])).toEqual([]);
  });
});
