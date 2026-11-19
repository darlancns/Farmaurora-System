import { describe, expect, it } from "vitest";
import {
  colunasNovoCadastro,
  colunasPatchCadastro,
  montarCadastro,
  type DespachanteRow,
  type FornecedorRow,
  type CiaAereaRow,
} from "../../server/utils/cadastroMappers";

// Mapeadores puros linha ↔ modelo dos Cadastros: vazio ↔ NULL, nome_chave, prazo/sem alerta.

const BASE = {
  id: "forn_1",
  nome: "Poros",
  nome_chave: "poros",
  ativo: true,
  atualizado_por: "Cris",
  created_at: "2026-11-09T12:00:00.000Z",
  updated_at: "2026-11-09T12:00:00.000Z",
};

describe("montarCadastro", () => {
  it("fornecedor: NULL vira vazio/null; prazo numérico; ativo e atualizadoPor", () => {
    const row: FornecedorRow = { ...BASE, pais: null, prazo_alerta_dias: "3", sem_alerta: false };
    expect(montarCadastro("fornecedores", row)).toEqual({
      id: "forn_1",
      nome: "Poros",
      ativo: true,
      atualizadoPor: "Cris",
      createdAt: BASE.created_at,
      updatedAt: BASE.updated_at,
      pais: "",
      prazoAlertaDias: 3,
      semAlerta: false,
    });
  });

  it("fornecedor sem alerta: prazo null", () => {
    const row: FornecedorRow = { ...BASE, pais: "China", prazo_alerta_dias: null, sem_alerta: true, atualizado_por: null };
    const f = montarCadastro("fornecedores", row);
    expect(f.prazoAlertaDias).toBeNull();
    expect(f.semAlerta).toBe(true);
    expect(f.atualizadoPor).toBe("");
    expect(f.pais).toBe("China");
  });

  it("despachante e cia aérea", () => {
    const d: DespachanteRow = { ...BASE, id: "desp_1", contato_nome: null, telefone: "1133334444", email: null };
    expect(montarCadastro("despachantes", d)).toMatchObject({ contatoNome: "", telefone: "1133334444", email: "" });
    const t: CiaAereaRow = { ...BASE, id: "cia_1", ativo: false };
    expect(montarCadastro("cias-aereas", t)).toMatchObject({ id: "cia_1", ativo: false });
  });
});

describe("colunasNovoCadastro", () => {
  it("fornecedor: nome_chave normalizado, nasce ativo, vazio vira NULL", () => {
    expect(
      colunasNovoCadastro("fornecedores", { nome: "Speciality  Índia", pais: "", prazoAlertaDias: 3, semAlerta: false }),
    ).toEqual({
      nome: "Speciality  Índia",
      nome_chave: "speciality india",
      ativo: true,
      pais: null,
      prazo_alerta_dias: 3,
      sem_alerta: false,
    });
  });

  it("fornecedor sem alerta grava prazo NULL (respeita o CHECK da tabela)", () => {
    const c = colunasNovoCadastro("fornecedores", { nome: "Matsun", prazoAlertaDias: null, semAlerta: true });
    expect(c).toMatchObject({ sem_alerta: true, prazo_alerta_dias: null });
  });

  it("despachante e cia aérea", () => {
    expect(colunasNovoCadastro("despachantes", { nome: "STAR CUSTOMS", contatoNome: "Fulano", telefone: "", email: "" })).toEqual({
      nome: "STAR CUSTOMS",
      nome_chave: "star customs",
      ativo: true,
      contato_nome: "Fulano",
      telefone: null,
      email: null,
      chave_pix: null,
    });
    expect(colunasNovoCadastro("cias-aereas", { nome: "Ambiente" })).toEqual({ nome: "Ambiente", nome_chave: "ambiente", ativo: true });
  });
});

describe("colunasPatchCadastro", () => {
  it("só as chaves presentes; NUNCA nome nem nome_chave", () => {
    expect(colunasPatchCadastro("fornecedores", { nome: "Outro nome", pais: "Índia" })).toEqual({ pais: "Índia" });
    expect(colunasPatchCadastro("cias-aereas", { nome: "X" })).toEqual({});
    expect(colunasPatchCadastro("cias-aereas", { ativo: false })).toEqual({ ativo: false });
  });

  it("fornecedor: alerta vai junto e respeita o CHECK (sem alerta zera o prazo)", () => {
    expect(colunasPatchCadastro("fornecedores", { semAlerta: true, prazoAlertaDias: null })).toEqual({
      sem_alerta: true,
      prazo_alerta_dias: null,
    });
    expect(colunasPatchCadastro("fornecedores", { semAlerta: false, prazoAlertaDias: 7 })).toEqual({
      sem_alerta: false,
      prazo_alerta_dias: 7,
    });
  });

  it("despachante: esvaziar vira NULL", () => {
    expect(colunasPatchCadastro("despachantes", { contatoNome: "", telefone: "11 3333-4444" })).toEqual({
      contato_nome: null,
      telefone: "11 3333-4444",
    });
  });
});

describe("consultores (mesmo molde da cia aérea: só nome e ativo)", () => {
  const linha: ConsultorRow = {
    id: "cons_1",
    nome: "Consultor Teste",
    nome_chave: "consultor teste",
    ativo: true,
    atualizado_por: null,
    created_at: "2026-11-18T12:00:00.000Z",
    updated_at: "2026-11-18T12:00:00.000Z",
  };

  it("montar: NULL em atualizado_por vira vazio; só as chaves da base (sem campo extra)", () => {
    expect(montarCadastro("consultores", linha)).toEqual({
      id: "cons_1",
      nome: "Consultor Teste",
      ativo: true,
      atualizadoPor: "",
      createdAt: linha.created_at,
      updatedAt: linha.updated_at,
    });
    expect(montarCadastro("consultores", { ...linha, ativo: false })).toMatchObject({ ativo: false });
  });

  it("colunas de um item novo: nome, nome_chave normalizado (sem acento/caixa) e nasce ativo — nada mais", () => {
    expect(colunasNovoCadastro("consultores", { nome: "André  Vitório" })).toEqual({
      nome: "André  Vitório", // o nome já chega limpo da validação; o mapper não mexe nele
      nome_chave: "andre vitorio",
      ativo: true,
    });
  });

  it("alteração: só `ativo` entra; `nome` e `nome_chave` NUNCA (o nome não muda depois de criado)", () => {
    expect(colunasPatchCadastro("consultores", { ativo: false })).toEqual({ ativo: false });
    expect(colunasPatchCadastro("consultores", { nome: "Outro Nome", ativo: true })).toEqual({ ativo: true });
    expect(colunasPatchCadastro("consultores", { nome: "Outro Nome" })).toEqual({});
  });
});
