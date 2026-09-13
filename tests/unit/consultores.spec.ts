import { describe, expect, it } from "vitest";
import { CONSULTORES } from "#shared/constants/consultores";
import type { ConsultorNome } from "#shared/types/Patient";

// Trava de runtime: a lista canônica `CONSULTORES` deve ter EXATAMENTE os mesmos
// membros que o tipo `ConsultorNome`. A cobertura "tipo -> lista" (nome novo no
// tipo que não entrou na lista) é garantida em build-time por
// shared/constants/consultores.ts (`_ConsultorNaoListado`); aqui garantimos, em
// runtime, que a lista não ganhou/perdeu/renomeou nada em relação a esta
// referência escrita à mão a partir de shared/types/Patient.ts.
const NOMES_DO_TIPO = [
  "André Vitório",
  "Mateus Morais",
  "Paulo Braga",
  "Thiago Guedes",
  "Gabriela Megda",
  "Gabriela Santana",
  "Vinícius Alves",
] satisfies ConsultorNome[];

describe("CONSULTORES == membros de ConsultorNome", () => {
  it("mesma quantidade", () => {
    expect(CONSULTORES).toHaveLength(NOMES_DO_TIPO.length);
  });

  it("mesmo conjunto de nomes (ordem à parte)", () => {
    expect([...CONSULTORES].sort()).toEqual([...NOMES_DO_TIPO].sort());
  });

  it("sem duplicatas", () => {
    expect(new Set(CONSULTORES).size).toBe(CONSULTORES.length);
  });
});
