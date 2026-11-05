import { createError } from "h3";
import { parseNomeInput } from "./authUser";
import {
  EMAIL_MAX_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  NOME_MAX_LENGTH,
} from "#shared/constants/conta";
import { emailValido, nomeTemCaractereProibido, normalizarEmail } from "#shared/utils/contaCampos";

// Validação dos bodies da PRÓPRIA conta. Whitelist: só as chaves lidas abaixo existem pro handler —
// `id`, `role`, `consultorNome`, `isAdmin` etc. que vierem no body são ignorados (nem são lidos).
// Nenhuma mensagem de erro daqui repete o valor recebido (senha/e-mail não vazam em erro nem em log).

function campos(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function invalido(mensagem: string): never {
  throw createError({ statusCode: 400, statusMessage: mensagem });
}

/** Nome novo: obrigatório (parseNomeInput), até NOME_MAX_LENGTH, sem quebra de linha/controle. */
export function parseNomeProprio(body: unknown): string {
  const bruto = campos(body).nome;
  // Checa o texto cru: um "\n" no fim seria removido pelo trim do parseNomeInput e passaria.
  if (typeof bruto === "string" && nomeTemCaractereProibido(bruto)) {
    invalido("O nome não pode ter quebra de linha nem caracteres de controle.");
  }
  const nome = parseNomeInput({ nome: bruto }, { required: true });
  if (nome.length > NOME_MAX_LENGTH) {
    invalido(`O nome pode ter no máximo ${NOME_MAX_LENGTH} caracteres.`);
  }
  return nome;
}

/** E-mail novo: normalizado, válido e idêntico à confirmação. */
export function parseEmailProprio(body: unknown): { senhaAtual: string; email: string } {
  const b = campos(body);
  const senhaAtual = texto(b.senhaAtual);
  if (!senhaAtual) invalido("Informe a senha atual.");

  const email = normalizarEmail(texto(b.email));
  const confirmacao = normalizarEmail(texto(b.emailConfirmacao));
  if (!email) invalido("Informe o novo e-mail.");
  if (email.length > EMAIL_MAX_LENGTH || !emailValido(email)) invalido("Informe um e-mail válido.");
  if (email !== confirmacao) invalido("Os e-mails não coincidem.");

  return { senhaAtual, email };
}

/** Senha nova: mínimo/máximo e diferente da atual. Não faz trim — espaço é caractere de senha. */
export function parseSenhaProprio(body: unknown): { senhaAtual: string; novaSenha: string } {
  const b = campos(body);
  const senhaAtual = texto(b.senhaAtual);
  const novaSenha = texto(b.novaSenha);

  if (!senhaAtual) invalido("Informe a senha atual.");
  if (novaSenha.length < MIN_PASSWORD_LENGTH) {
    invalido(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (novaSenha.length > MAX_PASSWORD_LENGTH) {
    invalido(`A nova senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  if (novaSenha === senhaAtual) invalido("A nova senha precisa ser diferente da atual.");

  return { senhaAtual, novaSenha };
}
