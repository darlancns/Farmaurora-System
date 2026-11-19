import { describe, expect, it } from "vitest";
import { montarAlteracao, formDeItem, listaTemEdicao, nomeNormalizado } from "../../app/utils/cadastroForm";
import { mensagemConfirmarRenomear, mensagemContasNaoAtualizadas, resumoImpactoRenomear } from "../../app/utils/cadastroConsultor";
import type { Consultor, Fornecedor } from "../../shared/types/Cadastro";
import { validarPatchCadastro } from "../../shared/utils/cadastroValidacao";

// Renomear consultor: validação do nome novo (só consultores), corpo do PATCH do formulário e os textos da confirmação.

const consultor = (nome: string): Consultor => ({ id: "k1", nome, ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" });

describe("validarPatchCadastro — o nome do consultor pode mudar; o das outras listas não passa pela regra de nome novo", () => {
  it("consultor: nome novo é aparado, com espaços colapsados", () => {
    expect(validarPatchCadastro("consultores", { nome: "  Nome   Novo " })).toEqual({ ok: true, valor: { nome: "Nome Novo" } });
  });

  it('consultor: "Outro" é reservado em qualquer caixa; vazio, não-texto e nome comprido são recusados', () => {
    expect(validarPatchCadastro("consultores", { nome: "Outro" })).toMatchObject({ ok: false });
    expect(validarPatchCadastro("consultores", { nome: "OUTRO" })).toMatchObject({ ok: false });
    expect(validarPatchCadastro("consultores", { nome: "   " })).toEqual({ ok: false, erro: "Informe o nome." });
    expect(validarPatchCadastro("consultores", { nome: 7 })).toEqual({ ok: false, erro: "Informe o nome." });
    expect(validarPatchCadastro("consultores", { nome: "x".repeat(121) })).toMatchObject({ ok: false });
  });

  it("consultor: nome e ativo juntos passam; as outras listas continuam só aparando o nome (o servidor recusa a troca com 422)", () => {
    expect(validarPatchCadastro("consultores", { nome: "Nome Novo", ativo: true })).toEqual({ ok: true, valor: { nome: "Nome Novo", ativo: true } });
    // Nas outras listas "Outro" nem é conferido aqui (a troca de nome é recusada mais adiante).
    expect(validarPatchCadastro("cias-aereas", { nome: "Outro" })).toEqual({ ok: true, valor: { nome: "Outro" } });
  });
});

describe("cadastroForm — consultor", () => {
  it("o consultor tem edição (o nome); cia aérea continua sem", () => {
    expect(listaTemEdicao("consultores")).toBe(true);
    expect(listaTemEdicao("consultores", false)).toBe(true);
    expect(listaTemEdicao("cias-aereas")).toBe(false);
  });

  it("nomeNormalizado: aparado e com espaços colapsados", () => {
    expect(nomeNormalizado("  A   B  ")).toBe("A B");
  });

  it("montarAlteracao: só o nome muda → PATCH { nome }; sem mudança → 'Nenhuma alteração informada.'; só caixa/acento já é mudança", () => {
    const atual = consultor("Mateus Morais");
    const form = (nome: string) => ({ ...formDeItem("consultores", atual), nome });
    expect(montarAlteracao("consultores", form("Mateus Teste"), atual)).toEqual({ ok: true, valor: { nome: "Mateus Teste" } });
    expect(montarAlteracao("consultores", form("  Mateus   Morais "), atual)).toEqual({ ok: false, erro: "Nenhuma alteração informada." });
    expect(montarAlteracao("consultores", form("MATEUS MORAIS"), atual)).toEqual({ ok: true, valor: { nome: "MATEUS MORAIS" } });
    expect(montarAlteracao("consultores", form("Outro"), atual)).toMatchObject({ ok: false });
  });

  it("nas outras listas o nome NUNCA vai no PATCH da edição (continua imutável)", () => {
    const f: Fornecedor = { id: "f1", nome: "Poros", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "", pais: "", prazoAlertaDias: 3, semAlerta: false };
    const r = montarAlteracao("fornecedores", { ...formDeItem("fornecedores", f), nome: "Poros Novo" }, f);
    expect(r.ok && "nome" in r.valor).toBe(false);
  });
});

describe("textos do renomear (só números e nomes de consultor)", () => {
  it("resumoImpactoRenomear: singular e plural", () => {
    expect(resumoImpactoRenomear({ processos: 3, pacientes: 1, dir: 0, contas: 2 })).toBe(
      "3 processos do Follow-Up, 1 prestação, 0 POs da DIR e 2 contas de login",
    );
    expect(resumoImpactoRenomear({ processos: 1, pacientes: 2, dir: 1, contas: 1 })).toBe(
      "1 processo do Follow-Up, 2 prestações, 1 PO da DIR e 1 conta de login",
    );
  });

  it("mensagemConfirmarRenomear: nome atual, nome novo, as contagens e o aviso de que vale para todo o sistema", () => {
    expect(mensagemConfirmarRenomear("Antigo Teste", "Novo Teste", { processos: 2, pacientes: 0, dir: 5, contas: 1 })).toBe(
      'Renomear "Antigo Teste" para "Novo Teste"? O novo nome passa a valer em 2 processos do Follow-Up, 0 prestações, 5 POs da DIR e 1 conta de login. Vale para todo o sistema e não é desfeito automaticamente.',
    );
  });

  it("mensagemContasNaoAtualizadas: singular e plural", () => {
    expect(mensagemContasNaoAtualizadas({ atualizadas: 0, falhas: [{ id: "a", email: "a@x.com" }] })).toBe(
      "Consultor renomeado, mas 1 conta de login não foi atualizada. Tente de novo:",
    );
    expect(
      mensagemContasNaoAtualizadas({ atualizadas: 0, falhas: [{ id: "a", email: "a@x.com" }, { id: "b", email: "b@x.com" }] }),
    ).toBe("Consultor renomeado, mas 2 contas de login não foram atualizadas. Tente de novo:");
  });
});
