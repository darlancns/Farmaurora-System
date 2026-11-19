import type { FakeSupabase } from "./fakeSupabase";

// Fixtures SINTÉTICAS de `cadastro_consultores` para os testes que passam pelo dirStore (que lê os consultores ativos do
// Cadastro). Só nomes de consultor — nunca nomes de pacientes.

export const TABELA_CONSULTORES = "cadastro_consultores";

/** Consultores ativos semeados: os nomes que as fixtures da DIR usam (novoDirDTO: "Mateus Morais"). */
export const CONSULTORES_ATIVOS_FIXTURE = ["André Vitório", "Mateus Morais", "Paulo Braga"] as const;
/** Um consultor INATIVO no Cadastro (como o "Junior" de produção). */
export const CONSULTOR_INATIVO_FIXTURE = "Junior";

export function linhaConsultor(nome: string, ativo = true, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `cons_${nome.toLowerCase().replace(/\W+/g, "_")}`,
    nome,
    nome_chave: nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase(),
    ativo,
    atualizado_por: null,
    created_at: "2026-11-18T00:00:00.000Z",
    updated_at: "2026-11-18T00:00:00.000Z",
    ...extra,
  };
}

/** Substitui a tabela pelos consultores padrão (ativos + o inativo). */
export function semearConsultores(fake: FakeSupabase): void {
  fake.tabelas[TABELA_CONSULTORES] = [
    ...CONSULTORES_ATIVOS_FIXTURE.map((nome) => linhaConsultor(nome)),
    linhaConsultor(CONSULTOR_INATIVO_FIXTURE, false),
  ];
}
