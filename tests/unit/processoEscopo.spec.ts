import { describe, expect, it } from "vitest";
import type { AuthUser } from "#shared/types/auth";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import { filtrarProcessosVisiveis, processoVisivelParaUsuario } from "../../server/utils/processoEscopo";

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

function usuario(role: AuthUser["role"], consultorNome?: ConsultorProcesso): AuthUser {
  return { id: "u1", email: "u@farmaurora.com.br", role, consultorNome, isAdmin: role === "administrador" };
}

const TODOS: Processo[] = [
  processo("Bolívar"),
  processo("Bolívar"),
  processo("Flavinha"),
  processo("Flávia"),
  processo("André Vitório"),
];

describe("escopo do cargo consultor — consultor novo", () => {
  it("Bolívar vê só os próprios processos", () => {
    const vistos = filtrarProcessosVisiveis(TODOS, usuario("consultor", "Bolívar"));
    expect(vistos).toHaveLength(2);
    expect(vistos.every((p) => p.consultor === "Bolívar")).toBe(true);
  });

  it("Flavinha não enxerga os de Flávia (nomes distintos) nem os de outro consultor", () => {
    const vistos = filtrarProcessosVisiveis(TODOS, usuario("consultor", "Flavinha"));
    expect(vistos.map((p) => p.consultor)).toEqual(["Flavinha"]);
  });

  it("detalhe: próprio processo visível, de outro consultor não", () => {
    const u = usuario("consultor", "Dani");
    expect(processoVisivelParaUsuario(processo("Dani"), u)).toBe(true);
    expect(processoVisivelParaUsuario(processo("Bolívar"), u)).toBe(false);
    expect(processoVisivelParaUsuario(processo("André Vitório"), u)).toBe(false);
  });

  it("consultor antigo continua vendo só o próprio", () => {
    const vistos = filtrarProcessosVisiveis(TODOS, usuario("consultor", "André Vitório"));
    expect(vistos.map((p) => p.consultor)).toEqual(["André Vitório"]);
  });

  it("consultor sem nome não vê nada", () => {
    expect(filtrarProcessosVisiveis(TODOS, usuario("consultor"))).toEqual([]);
    expect(processoVisivelParaUsuario(processo("Bolívar"), usuario("consultor"))).toBe(false);
  });

  it("demais cargos veem tudo", () => {
    for (const role of ["socio", "operacional", "administrador"] as const) {
      expect(filtrarProcessosVisiveis(TODOS, usuario(role))).toHaveLength(TODOS.length);
      expect(processoVisivelParaUsuario(processo("Bolívar"), usuario(role))).toBe(true);
    }
  });
});
