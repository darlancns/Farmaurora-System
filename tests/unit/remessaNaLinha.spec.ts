import { describe, expect, it } from "vitest";
import type { Processo } from "#shared/types/processo";
import { contarProcessosPorPasta, remessaVisivelNaLinha } from "../../app/utils/remessaNaLinha";
import { filtrarPorBusca } from "../../app/utils/processoBusca";
import { separarAbas } from "../../app/utils/processoListas";

// Quando a linha do processo mostra "Ordem N": N > 1 OU a pasta se repete entre TODOS os processos carregados.

function proc(id: string, pasta: string, numeroRemessa: number, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const visivel = (p: Processo, todos: Processo[]) => remessaVisivelNaLinha(p, contarProcessosPorPasta(todos));

describe("remessaVisivelNaLinha", () => {
  it("N > 1 mostra, mesmo com a pasta única", () => {
    const a = proc("a", "2026 - 100", 2);
    expect(visivel(a, [a])).toBe(true);
    expect(visivel(proc("b", "2026 - 101", 12), [proc("b", "2026 - 101", 12)])).toBe(true);
  });

  it("N = 1 com pasta única NÃO mostra", () => {
    const a = proc("a", "2026 - 100", 1);
    const b = proc("b", "2026 - 101", 1);
    expect(visivel(a, [a, b])).toBe(false);
    expect(visivel(b, [a, b])).toBe(false);
  });

  it("N = 1 com pasta repetida mostra, nos DOIS processos", () => {
    const a = proc("a", "2026 - 409", 1);
    const b = proc("b", "2026 - 409", 2);
    const c = proc("c", "2026 - 409", 1);
    const todos = [a, b, c];
    expect(visivel(a, todos)).toBe(true);
    expect(visivel(c, todos)).toBe(true);
    expect(visivel(b, todos)).toBe(true);
  });

  it("pasta repetida com os dois em 1 (ex.: dados ainda não editados) também mostra", () => {
    const a = proc("a", "2026 - 409", 1);
    const b = proc("b", "2026 - 409", 1);
    expect(visivel(a, [a, b])).toBe(true);
    expect(visivel(b, [a, b])).toBe(true);
  });

  it("a pasta é comparada sem espaços e hífens ('2026 - 409' = '2026-409' = '2026409')", () => {
    const a = proc("a", "2026 - 409", 1);
    const b = proc("b", "2026-409", 1);
    const c = proc("c", "2026409", 1);
    expect(visivel(a, [a, b])).toBe(true);
    expect(visivel(c, [a, b, c])).toBe(true);
  });

  it("pastas parecidas mas diferentes não se contam ('2026 - 40' ≠ '2026 - 409')", () => {
    const a = proc("a", "2026 - 40", 1);
    const b = proc("b", "2026 - 409", 1);
    expect(visivel(a, [a, b])).toBe(false);
  });

  it("a contagem NÃO depende da lista filtrada: filtrar pela busca não faz a 'Ordem 1' sumir", () => {
    const a = proc("a", "2026 - 409", 1, { paciente: "Amanda Carvalho" });
    const b = proc("b", "2026 - 409", 2, { paciente: "Amanda Carvalho" });
    const outro = proc("o", "2026 - 100", 1, { paciente: "Zeca" });
    const todos = [a, b, outro];

    // A página filtra a lista exibida, mas conta sobre TODOS os processos.
    const exibidos = filtrarPorBusca(todos, "Amanda").filter((p) => p.id === "a");
    expect(exibidos.map((p) => p.id)).toEqual(["a"]);

    expect(remessaVisivelNaLinha(a, contarProcessosPorPasta(todos))).toBe(true);
    // Prova de que a lista filtrada daria outro resultado (e por isso a página NÃO a usa):
    expect(remessaVisivelNaLinha(a, contarProcessosPorPasta(exibidos))).toBe(false);
  });

  it("Entregues: a contagem junta Andamento + Entregues (a repetição pode estar na outra aba)", () => {
    const emAndamento = proc("a", "2026 - 409", 1, { status: "em_transito" });
    const entregue = proc("e", "2026 - 409", 1, { status: "entregue" });
    const todos = [emAndamento, entregue];

    const { andamento, entregues } = separarAbas(todos);
    expect(andamento.map((p) => p.id)).toEqual(["a"]);
    expect(entregues.map((p) => p.id)).toEqual(["e"]);

    const contagem = contarProcessosPorPasta(todos);
    expect(remessaVisivelNaLinha(entregue, contagem)).toBe(true);
    expect(remessaVisivelNaLinha(emAndamento, contagem)).toBe(true);
    // Só com a aba (errado), cada um parecia ter pasta única:
    expect(remessaVisivelNaLinha(entregue, contarProcessosPorPasta(entregues))).toBe(false);
  });

  it("Entregues com N > 1 mostra mesmo com pasta única", () => {
    const e = proc("e", "2026 - 77", 3, { status: "entregue" });
    expect(visivel(e, [e])).toBe(true);
  });

  it("sem contagem alguma (mapa vazio), só vale N > 1", () => {
    expect(remessaVisivelNaLinha(proc("a", "2026 - 1", 1), new Map())).toBe(false);
    expect(remessaVisivelNaLinha(proc("a", "2026 - 1", 2), new Map())).toBe(true);
  });
});

describe("contarProcessosPorPasta", () => {
  it("conta por pasta normalizada", () => {
    const c = contarProcessosPorPasta([proc("a", "2026 - 1", 1), proc("b", "2026-1", 1), proc("c", "2026 - 2", 1)]);
    expect(c.get("20261")).toBe(2);
    expect(c.get("20262")).toBe(1);
  });
});
