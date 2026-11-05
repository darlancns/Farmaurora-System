import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, NOME_MAX_LENGTH } from "../../shared/constants/conta";
import { validarEmailDaConta, validarNomeDaConta, validarSenhaDaConta } from "../../app/utils/minhaContaForm";

// Validação do formulário "Minha conta" no cliente (a do servidor continua sendo a autoridade).

describe("validarEmailDaConta", () => {
  const ok = {
    email: "novo@farmaurora.com.br",
    confirmacao: "novo@farmaurora.com.br",
    senhaAtual: "SenhaAtual#2026",
    emailAtual: "fulano@farmaurora.com.br",
  };

  it("tudo certo → null", () => {
    expect(validarEmailDaConta(ok)).toBeNull();
  });

  it("e-mail diferente da confirmação → 'não coincidem'", () => {
    expect(validarEmailDaConta({ ...ok, confirmacao: "outro@farmaurora.com.br" })).toBe("Os e-mails não coincidem.");
  });

  it("compara sem diferenciar caixa nem espaços nas pontas", () => {
    expect(validarEmailDaConta({ ...ok, email: " Novo@Farmaurora.com.br ", confirmacao: "novo@FARMAURORA.com.br" })).toBeNull();
  });

  it("e-mail igual ao atual → recusa (mesmo com outra caixa)", () => {
    const e = validarEmailDaConta({ ...ok, email: "FULANO@farmaurora.com.br", confirmacao: "fulano@farmaurora.com.br" });
    expect(e).toBe("Esse já é o e-mail da sua conta.");
  });

  it("vazio e formato inválido", () => {
    expect(validarEmailDaConta({ ...ok, email: "", confirmacao: "" })).toBe("Informe o novo e-mail.");
    expect(validarEmailDaConta({ ...ok, email: "semarroba", confirmacao: "semarroba" })).toBe("Informe um e-mail válido.");
  });

  it("sem senha atual → pede a senha (depois de validar o e-mail)", () => {
    expect(validarEmailDaConta({ ...ok, senhaAtual: "" })).toBe("Informe a senha atual.");
  });

  it("a mensagem nunca repete o e-mail nem a senha digitados", () => {
    const e = validarEmailDaConta({ ...ok, confirmacao: "x@y.com" }) ?? "";
    expect(e).not.toContain("novo@");
    expect(e).not.toContain(ok.senhaAtual);
  });
});

describe("validarSenhaDaConta", () => {
  const ok = { senhaAtual: "SenhaAtual#2026", novaSenha: "NovaSenha#2026", confirmacao: "NovaSenha#2026" };

  it("tudo certo → null", () => {
    expect(validarSenhaDaConta(ok)).toBeNull();
  });

  it(`senha curta (< ${MIN_PASSWORD_LENGTH}) → recusa; exatamente o mínimo passa`, () => {
    const curta = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validarSenhaDaConta({ ...ok, novaSenha: curta, confirmacao: curta })).toContain(String(MIN_PASSWORD_LENGTH));
    const minima = "b".repeat(MIN_PASSWORD_LENGTH);
    expect(validarSenhaDaConta({ ...ok, novaSenha: minima, confirmacao: minima })).toBeNull();
  });

  it("confirmação diferente → 'não coincidem'", () => {
    expect(validarSenhaDaConta({ ...ok, confirmacao: "Outra#2026xx" })).toBe("As senhas não coincidem.");
  });

  it("sem senha atual → pede a senha atual", () => {
    expect(validarSenhaDaConta({ ...ok, senhaAtual: "" })).toBe("Informe a senha atual.");
  });

  it("nova igual à atual → recusa", () => {
    expect(validarSenhaDaConta({ senhaAtual: "MesmaSenha#1", novaSenha: "MesmaSenha#1", confirmacao: "MesmaSenha#1" })).toBe(
      "A nova senha precisa ser diferente da atual.",
    );
  });

  it("a mensagem nunca repete as senhas digitadas", () => {
    const e = validarSenhaDaConta({ senhaAtual: "SegredoAntigo!", novaSenha: "curta", confirmacao: "curta" }) ?? "";
    expect(e).not.toContain("SegredoAntigo!");
    expect(e).not.toContain("curta");
  });
});

describe("validarNomeDaConta", () => {
  it("nome novo válido → null", () => {
    expect(validarNomeDaConta("Renan Souza", "Renan Ferreira")).toBeNull();
  });

  it("vazio ou só espaços → pede o nome", () => {
    expect(validarNomeDaConta("   ", "Renan")).toBe("Informe o seu nome.");
  });

  it("igual ao atual → recusa (não há o que salvar)", () => {
    expect(validarNomeDaConta("  Renan Ferreira ", "Renan Ferreira")).toBe("Esse já é o seu nome.");
  });

  it("acima do limite ou com quebra de linha → recusa", () => {
    expect(validarNomeDaConta("a".repeat(NOME_MAX_LENGTH + 1), "x")).toContain(String(NOME_MAX_LENGTH));
    expect(validarNomeDaConta("Ana\nMaria", "x")).toContain("quebra de linha");
  });
});
