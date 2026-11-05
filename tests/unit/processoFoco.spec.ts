import { describe, expect, it } from "vitest";
import {
  planejarFocoProcesso,
  processoIdDaQuery,
  QUERY_PROCESSO,
  rotaParaProcesso,
} from "../../app/utils/processoFoco";
import type { Processo } from "#shared/types/processo";

function proc(id: string, status: Processo["status"] = "desembaraco"): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    pasta: `2026 - ${id}`,
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    medicamentos: [],
    status,
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("rotaParaProcesso", () => {
  it("monta /processos?processo=<id>", () => {
    expect(rotaParaProcesso("proc_1")).toEqual({ path: "/processos", query: { processo: "proc_1" } });
    expect(QUERY_PROCESSO).toBe("processo");
  });
});

describe("processoIdDaQuery", () => {
  it("aceita string, primeiro item de lista, e devolve vazio para o resto", () => {
    expect(processoIdDaQuery("proc_1")).toBe("proc_1");
    expect(processoIdDaQuery(["proc_2", "proc_3"])).toBe("proc_2");
    expect(processoIdDaQuery(undefined)).toBe("");
    expect(processoIdDaQuery(null)).toBe("");
    expect(processoIdDaQuery("  ")).toBe("");
  });
});

describe("planejarFocoProcesso", () => {
  const a = proc("a");
  const b = proc("b", "entregue");

  it("processo visível na aba de andamento: nada a limpar", () => {
    expect(planejarFocoProcesso([a, b], [a, b], "a")).toEqual({ aba: "andamento", limparFiltros: false });
  });

  it("processo entregue: troca para a aba Entregues", () => {
    expect(planejarFocoProcesso([a, b], [a, b], "b")).toEqual({ aba: "entregues", limparFiltros: false });
  });

  it("processo escondido por busca/filtro ativo: pede para limpar os filtros", () => {
    expect(planejarFocoProcesso([a, b], [b], "a")).toEqual({ aba: "andamento", limparFiltros: true });
  });

  it("processo que não existe (apagado ou fora do escopo): null", () => {
    expect(planejarFocoProcesso([a, b], [a, b], "zzz")).toBeNull();
    expect(planejarFocoProcesso([], [], "a")).toBeNull();
  });
});
