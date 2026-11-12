import { describe, expect, it } from "vitest";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import {
  agruparPorColuna,
  chaveDaPasta,
  colunaDoProcesso,
  COLUNAS_KANBAN,
  compararPorPasta,
} from "../../app/utils/processoKanban";

function proc(id: string, pasta: string, status: StatusProcesso = "em_transito"): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status,
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

describe("COLUNAS_KANBAN", () => {
  it("5 colunas na ordem do fluxo, com id estável e rótulo", () => {
    expect(COLUNAS_KANBAN).toEqual([
      { id: "na-origem", status: "elaboracao_fornecedores", rotulo: "Na origem" },
      { id: "em-transito", status: "em_transito", rotulo: "Em trânsito" },
      { id: "desembaraco", status: "desembaraco", rotulo: "Desembaraço" },
      { id: "liberado", status: "liberado", rotulo: "Liberado" },
      { id: "entregue", status: "entregue", rotulo: "Entregue" },
    ]);
  });

  it("colunaDoProcesso: o status; legado que escapasse cai no equivalente", () => {
    expect(colunaDoProcesso({ status: "liberado" })).toBe("liberado");
    expect(colunaDoProcesso({ status: "outro" as unknown as StatusProcesso })).toBe("desembaraco");
    expect(colunaDoProcesso({ status: "aguardando_inicio" as unknown as StatusProcesso })).toBe("elaboracao_fornecedores");
  });
});

describe("chaveDaPasta", () => {
  it("lê ano e número, tolerando espaços e hífen colado", () => {
    expect(chaveDaPasta("2026 - 366")).toMatchObject({ grupo: 0, ano: 2026, numero: 366 });
    expect(chaveDaPasta("2026-366")).toMatchObject({ grupo: 0, ano: 2026, numero: 366 });
    expect(chaveDaPasta("  2025 -9 ")).toMatchObject({ grupo: 0, ano: 2025, numero: 9 });
    expect(chaveDaPasta("2026 - 007")).toMatchObject({ grupo: 0, ano: 2026, numero: 7 });
  });

  it("fora do padrão = grupo 1; vazia ou ausente = grupo 2", () => {
    for (const p of ["ABC", "2026", "26 - 1", "2026 - 1 - 2", "2026 / 5", "2026 - X"]) {
      expect(chaveDaPasta(p).grupo, p).toBe(1);
    }
    expect(chaveDaPasta("").grupo).toBe(2);
    expect(chaveDaPasta("   ").grupo).toBe(2);
    expect(chaveDaPasta(undefined).grupo).toBe(2);
    expect(chaveDaPasta(null).grupo).toBe(2);
  });
});

describe("ordem dentro da coluna: o mais antigo em cima (Pasta crescente)", () => {
  it("ano, depois número como número (9 antes de 10); fora do padrão depois; sem pasta no fim; empate pelo id", () => {
    const lista = [
      proc("z", ""),
      proc("a", "2026 - 10"),
      proc("b", "Pasta antiga"),
      proc("c", "2025 - 400"),
      proc("d2", "2026 - 9"),
      proc("d1", "2026-9"),
      proc("e", "ABC 2"),
      proc("f", "ABC 10"),
    ];
    expect([...lista].sort(compararPorPasta).map((p) => p.id)).toEqual(["c", "d1", "d2", "a", "e", "f", "b", "z"]);
  });

  it("comparação estável e simétrica", () => {
    const a = proc("a", "2026 - 1");
    const b = proc("b", "2026 - 1");
    expect(compararPorPasta(a, b)).toBeLessThan(0);
    expect(compararPorPasta(b, a)).toBeGreaterThan(0);
    expect(compararPorPasta(a, a)).toBe(0);
  });
});

describe("agruparPorColuna", () => {
  it("todas as colunas existem (mesmo vazias); cada processo cai na sua; cada coluna ordenada por Pasta", () => {
    const lista = [
      proc("1", "2026 - 5", "entregue"),
      proc("2", "2026 - 2", "em_transito"),
      proc("3", "2026 - 1", "em_transito"),
      proc("4", "2026 - 3", "elaboracao_fornecedores"),
      proc("5", "2025 - 1", "entregue"),
    ];
    const g = agruparPorColuna(lista);
    expect(Object.keys(g)).toEqual(["elaboracao_fornecedores", "em_transito", "desembaraco", "liberado", "entregue"]);
    expect(g.elaboracao_fornecedores.map((p) => p.id)).toEqual(["4"]);
    expect(g.em_transito.map((p) => p.id)).toEqual(["3", "2"]);
    expect(g.desembaraco).toEqual([]);
    expect(g.liberado).toEqual([]);
    expect(g.entregue.map((p) => p.id)).toEqual(["5", "1"]);
  });

  it("não altera a lista de entrada", () => {
    const lista = [proc("b", "2026 - 2"), proc("a", "2026 - 1")];
    agruparPorColuna(lista);
    expect(lista.map((p) => p.id)).toEqual(["b", "a"]);
  });
});
