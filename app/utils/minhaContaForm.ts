import { MIN_PASSWORD_LENGTH, NOME_MAX_LENGTH } from "#shared/constants/conta";
import { emailValido, nomeTemCaractereProibido, normalizarEmail } from "#shared/utils/contaCampos";

// Validação do formulário "Minha conta" ANTES de chamar o servidor — espelha as regras de
// server/utils/contaValidation.ts (que continua sendo a autoridade) pra a pessoa ver o erro na hora.
// Funções puras: devolvem a mensagem do primeiro problema (pt-BR) ou null quando está tudo certo.
// Nenhuma mensagem repete senha ou e-mail digitados.

export function validarNomeDaConta(nome: string, nomeAtual: string): string | null {
  const limpo = nome.trim();
  if (!limpo) return "Informe o seu nome.";
  if (nomeTemCaractereProibido(nome)) return "O nome não pode ter quebra de linha nem caracteres de controle.";
  if (limpo.length > NOME_MAX_LENGTH) return `O nome pode ter no máximo ${NOME_MAX_LENGTH} caracteres.`;
  if (limpo === nomeAtual.trim()) return "Esse já é o seu nome.";
  return null;
}

export interface CamposEmail {
  email: string;
  confirmacao: string;
  senhaAtual: string;
  /** E-mail atual da conta, só pra recusar "trocar" pelo mesmo. */
  emailAtual: string;
}

export function validarEmailDaConta(c: CamposEmail): string | null {
  const email = normalizarEmail(c.email);
  if (!email) return "Informe o novo e-mail.";
  if (!emailValido(email)) return "Informe um e-mail válido.";
  if (email !== normalizarEmail(c.confirmacao)) return "Os e-mails não coincidem.";
  if (email === normalizarEmail(c.emailAtual)) return "Esse já é o e-mail da sua conta.";
  if (!c.senhaAtual) return "Informe a senha atual.";
  return null;
}

export interface CamposSenha {
  senhaAtual: string;
  novaSenha: string;
  confirmacao: string;
}

export function validarSenhaDaConta(c: CamposSenha): string | null {
  if (!c.senhaAtual) return "Informe a senha atual.";
  if (c.novaSenha.length < MIN_PASSWORD_LENGTH) {
    return `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (c.novaSenha !== c.confirmacao) return "As senhas não coincidem.";
  if (c.novaSenha === c.senhaAtual) return "A nova senha precisa ser diferente da atual.";
  return null;
}
