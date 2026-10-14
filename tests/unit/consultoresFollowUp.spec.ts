import { describe, expect, it } from "vitest";
import { CONSULTORES } from "#shared/constants/consultores";
import { CONSULTORES_PROCESSO } from "#shared/constants/processos";
import type { ConsultorNome } from "#shared/types/Patient";
import type { ConsultorProcesso } from "#shared/types/processo";
import { isValidProcessoPatch, isValidProcessoPayload } from "../../server/utils/processoValidation";

// Pacientes NÃO ganha consultores novos: a lista de Pacientes fica travada nos 7
// originais mesmo que o Follow-Up cresça. Qualquer mudança aqui tem que ser uma
// decisão consciente (e mexe em PatientForm/patientValidation).
const SETE_ORIGINAIS = [
  "André Vitório",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
] as const satisfies readonly ConsultorNome[];

const NOVOS_NO_FOLLOW_UP = ["Alessandra", "Bolívar", "Bráulio", "Dani", "Flávia", "Flavinha", "Paulinho"] as const;

const ORDEM_ESPERADA: ConsultorProcesso[] = [
  "Alessandra",
  "André Vitório",
  "Bolívar",
  "Bráulio",
  "Dani",
  "Flávia",
  "Flavinha",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulinho",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
];

// Em build-time: todo ConsultorNome é um ConsultorProcesso (vue-tsc quebra se não).
const _subconjunto: ConsultorProcesso = "André Vitório" as ConsultorNome;
void _subconjunto;

describe("Pacientes: CONSULTORES travado nos 7 originais", () => {
  it("exatamente os 7 nomes originais", () => {
    expect([...CONSULTORES].sort()).toEqual([...SETE_ORIGINAIS].sort());
  });

  it("não contém nenhum consultor exclusivo do Follow-Up", () => {
    for (const nome of NOVOS_NO_FOLLOW_UP) {
      expect(CONSULTORES as string[]).not.toContain(nome);
    }
  });
});

describe("Follow-Up: CONSULTORES_PROCESSO", () => {
  it("todo ConsultorNome (Pacientes) é subconjunto de ConsultorProcesso", () => {
    for (const nome of CONSULTORES) {
      expect(CONSULTORES_PROCESSO as string[]).toContain(nome);
    }
  });

  it("tem os 14 nomes aprovados, sem duplicatas", () => {
    expect(CONSULTORES_PROCESSO).toHaveLength(14);
    expect(new Set(CONSULTORES_PROCESSO).size).toBe(14);
    expect([...CONSULTORES_PROCESSO].sort()).toEqual([...ORDEM_ESPERADA].sort());
  });

  it("está em ordem alfabética pt-BR", () => {
    const ordenada = [...CONSULTORES_PROCESSO].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(CONSULTORES_PROCESSO).toEqual(ordenada);
    expect(CONSULTORES_PROCESSO).toEqual(ORDEM_ESPERADA);
  });

  it("não inclui nomes que só aparecem no cabeçalho do doc (Rodrigão, Daniel)", () => {
    expect(CONSULTORES_PROCESSO as string[]).not.toContain("Rodrigão");
    expect(CONSULTORES_PROCESSO as string[]).not.toContain("Daniel");
  });
});

function payload(consultor: string): Record<string, unknown> {
  return {
    paciente: "Fulano de Tal",
    pasta: "2026 - 400",
    empresa: "FARMAURORA",
    consultor,
    status: "em_transito",
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    datas: {},
  };
}

describe("validação de Processo com consultor", () => {
  it("criação aceita consultor novo", () => {
    for (const nome of NOVOS_NO_FOLLOW_UP) {
      expect(isValidProcessoPayload(payload(nome)), nome).toBe(true);
    }
  });

  it("criação continua aceitando os 7 antigos", () => {
    for (const nome of SETE_ORIGINAIS) {
      expect(isValidProcessoPayload(payload(nome)), nome).toBe(true);
    }
  });

  it("criação rejeita consultor fora da lista", () => {
    for (const nome of ["Rodrigão", "Daniel", "Fulano", ""]) {
      expect(isValidProcessoPayload(payload(nome)), nome).toBe(false);
    }
  });

  it("edição (patch) aceita consultor novo e rejeita desconhecido", () => {
    expect(isValidProcessoPatch({ consultor: "Flavinha" })).toBe(true);
    expect(isValidProcessoPatch({ consultor: "Paulinho" })).toBe(true);
    expect(isValidProcessoPatch({ consultor: "Rodrigão" })).toBe(false);
  });
});
