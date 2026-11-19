import { describe, expect, it } from "vitest";
import { CONSULTORES_PROCESSO } from "#shared/constants/processos";
import { isValidProcessoPatch, isValidProcessoPayload } from "../../server/utils/processoValidation";

// O app NÃO tem mais lista de consultores no código: a fonte única é o Cadastro (lista "consultores"; ver consultorRegra.spec.ts e
// consultorValidacaoServidor.spec.ts). CONSULTORES_PROCESSO sobrou SÓ para os scripts da carga histórica (scripts/migration/*), que
// normalizam os nomes da planilha; estes testes travam essa lista da carga. A validação de Processo confere só a FORMA do consultor
// (texto não vazio): que seja um consultor ativo do Cadastro (ou o valor já gravado) é conferido pelo handler.

const NOVOS_NA_CARGA = ["Alessandra", "Bolívar", "Bráulio", "Dani", "Flávia", "Paulinho"] as const;

const ORDEM_ESPERADA: string[] = [
  "Alessandra",
  "André Vitório",
  "Bolívar",
  "Bráulio",
  "Dani",
  "Flávia",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulinho",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
];

function payload(consultor: unknown): Record<string, unknown> {
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

describe("CONSULTORES_PROCESSO: só a lista da CARGA histórica (o app lê o Cadastro)", () => {
  it("tem os 13 nomes aprovados da carga, sem duplicatas", () => {
    expect(CONSULTORES_PROCESSO).toHaveLength(13);
    expect(new Set(CONSULTORES_PROCESSO).size).toBe(13);
    expect([...CONSULTORES_PROCESSO].sort()).toEqual([...ORDEM_ESPERADA].sort());
  });

  it("está em ordem alfabética pt-BR", () => {
    const ordenada = [...CONSULTORES_PROCESSO].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(CONSULTORES_PROCESSO).toEqual(ordenada);
    expect(CONSULTORES_PROCESSO).toEqual(ORDEM_ESPERADA);
  });

  it("não inclui Flavinha (é a mesma pessoa que Flávia)", () => {
    expect(CONSULTORES_PROCESSO).not.toContain("Flavinha");
    expect(CONSULTORES_PROCESSO).toContain("Flávia");
  });

  it("não inclui nomes que só aparecem no cabeçalho do doc (Rodrigão, Daniel)", () => {
    expect(CONSULTORES_PROCESSO).not.toContain("Rodrigão");
    expect(CONSULTORES_PROCESSO).not.toContain("Daniel");
  });
});

describe("validação de Processo com consultor: só a forma (o Cadastro é conferido pelo handler)", () => {
  it("criação aceita qualquer texto não vazio, inclusive consultores novos e 'Flavinha' (quem decide é o Cadastro)", () => {
    for (const nome of [...NOVOS_NA_CARGA, "André Vitório", "Flavinha", "Rodrigão"]) {
      expect(isValidProcessoPayload(payload(nome)), nome).toBe(true);
    }
  });

  it("criação rejeita consultor vazio, só com espaços ou que não é texto", () => {
    for (const valor of ["", "   ", undefined, null, 7, {}]) {
      expect(isValidProcessoPayload(payload(valor)), String(valor)).toBe(false);
    }
  });

  it("edição (patch): consultor texto não vazio passa; vazio e não-texto não; sem a chave, nada é conferido", () => {
    expect(isValidProcessoPatch({ consultor: "Flávia" })).toBe(true);
    expect(isValidProcessoPatch({ consultor: "Paulinho" })).toBe(true);
    expect(isValidProcessoPatch({ consultor: "" })).toBe(false);
    expect(isValidProcessoPatch({ consultor: 3 })).toBe(false);
    expect(isValidProcessoPatch({ paciente: "Outro" })).toBe(true);
  });
});
