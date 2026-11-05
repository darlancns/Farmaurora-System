import { describe, expect, it } from "vitest";
import { planejarFocoRecado, QUERY_RECADO, rotaParaRecado } from "../../app/utils/recadoFoco";
import type { Recado } from "#shared/types/recado";

function recado(id: string): Recado {
  return {
    id,
    autorId: "u1",
    titulo: `Recado ${id}`,
    mensagem: "msg",
    tipo: "geral",
    destinatarioTipo: "publico",
    fixadoPorMim: false,
    concluidoPorMim: false,
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
  };
}

describe("rotaParaRecado", () => {
  it("com id: /recados?recado=<id>", () => {
    expect(rotaParaRecado("recado_1")).toEqual({ path: "/recados", query: { recado: "recado_1" } });
    expect(QUERY_RECADO).toBe("recado");
  });

  it("sem id (recado apagado): só /recados, sem query", () => {
    expect(rotaParaRecado(undefined)).toEqual({ path: "/recados", query: {} });
    expect(rotaParaRecado(null)).toEqual({ path: "/recados", query: {} });
    expect(rotaParaRecado("")).toEqual({ path: "/recados", query: {} });
  });
});

describe("planejarFocoRecado", () => {
  it("recado recebido: aba Recebidos; recado enviado: aba Enviados", () => {
    expect(planejarFocoRecado([recado("a")], [recado("b")], "a")).toEqual({ aba: "recebidos" });
    expect(planejarFocoRecado([recado("a")], [recado("b")], "b")).toEqual({ aba: "enviados" });
  });

  it("recado que não está em nenhuma lista (apagado, concluído por mim ou sem acesso): null, sem erro", () => {
    expect(planejarFocoRecado([recado("a")], [recado("b")], "zzz")).toBeNull();
    expect(planejarFocoRecado([], [], "a")).toBeNull();
  });
});
