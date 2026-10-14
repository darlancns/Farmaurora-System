import { describe, expect, it } from "vitest";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import { agruparProcessosPorConsultor } from "../../app/utils/agruparProcessosPorConsultor";

let seq = 0;
function processo(consultor: ConsultorProcesso): Processo {
  seq += 1;
  return {
    id: `proc_${seq}`,
    paciente: `Paciente ${seq}`,
    pasta: `2026 - ${seq}`,
    empresa: "FARMAURORA",
    consultor,
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("agruparProcessosPorConsultor", () => {
  it("consultor novo ganha grupo próprio, em ordem alfabética entre os demais", () => {
    const grupos = agruparProcessosPorConsultor([
      processo("Vinícius Alves"),
      processo("Paulinho"),
      processo("Bolívar"),
      processo("André Vitório"),
      processo("Bolívar"),
      processo("Flavinha"),
      processo("Flávia"),
    ]);

    expect(grupos.map((g) => g.consultor)).toEqual([
      "André Vitório",
      "Bolívar",
      "Flávia",
      "Flavinha",
      "Paulinho",
      "Vinícius Alves",
    ]);
    expect(grupos.find((g) => g.consultor === "Bolívar")?.processos).toHaveLength(2);
  });

  it("consultor sem processo não gera grupo", () => {
    const grupos = agruparProcessosPorConsultor([processo("Dani")]);
    expect(grupos.map((g) => g.consultor)).toEqual(["Dani"]);
  });

  it("lista vazia → nenhum grupo", () => {
    expect(agruparProcessosPorConsultor([])).toEqual([]);
  });
});
