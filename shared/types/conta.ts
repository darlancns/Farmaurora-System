/**
 * Contratos dos endpoints da própria conta (server/api/auth/conta/**).
 *
 * O id da conta NUNCA faz parte destes bodies: o servidor usa sempre o usuário da
 * sessão (event.context.user.id). Cargo, consultorNome e isAdmin também não são
 * aceitos — qualquer campo fora destes é ignorado.
 */

/** Campo da conta que gera notificação pros administradores. */
export type CampoContaEditado = "senha" | "email" | "nome";

/** Body do POST /api/auth/conta/senha. */
export interface AlterarSenhaDTO {
  senhaAtual: string;
  novaSenha: string;
}

/** Body do POST /api/auth/conta/email. O e-mail vai digitado duas vezes. */
export interface AlterarEmailDTO {
  senhaAtual: string;
  email: string;
  emailConfirmacao: string;
}

/** Body do PATCH /api/auth/conta/nome. */
export interface AlterarNomeDTO {
  nome: string;
}

/** Respostas: o mínimo pro cliente atualizar o estado local, sem dado sensível. */
export interface AlterarSenhaResult {
  atualizada: true;
}

export interface AlterarEmailResult {
  email: string;
}

export interface AlterarNomeResult {
  nome: string;
}
