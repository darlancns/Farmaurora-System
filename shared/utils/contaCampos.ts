import type { Role } from "./rbac";

// Regras puras (sem h3/Supabase) dos campos da própria conta — usadas pelo servidor
// (server/utils/contaValidation.ts) e, na Fase C, pela tela.

/** E-mail em minúsculas e sem espaços nas pontas (o Supabase também normaliza assim). */
export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

// Formato mínimo: algo@dominio.tld, sem espaços. A validade real quem decide é o Supabase Auth.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Quebras de linha e demais caracteres de controle (inclui tab, U+2028 e U+2029): o nome aparece
// no cabeçalho e dentro da mensagem das notificações — não pode quebrar o layout nem a linha.
// Feito por código de caractere (e não por regex) pra o arquivo não carregar caracteres invisíveis.
function ehCaractereProibido(ch: string): boolean {
  const codigo = ch.charCodeAt(0);
  return codigo <= 0x1f || codigo === 0x7f || codigo === 0x2028 || codigo === 0x2029;
}

export function nomeTemCaractereProibido(nome: string): boolean {
  return Array.from(nome).some(ehCaractereProibido);
}

/** Troca cada caractere proibido por espaço e colapsa espaços repetidos (texto numa linha só). */
export function nomeEmUmaLinha(nome: string): string {
  return Array.from(nome)
    .map((ch) => (ehCaractereProibido(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// Quem pode editar o PRÓPRIO nome:
// - consultor: o nome vira entidade única do sistema (fase própria) — por enquanto só o administrador;
// - operacional: o primeiro nome liga a conta ao alerta de Mandado de Segurança
//   (shared/utils/mandadoPermissao.ts) — trocar quebraria o vínculo;
// - sócio e administrador: livre.
export const ROLES_QUE_EDITAM_NOME: readonly Role[] = ["socio", "administrador"];

export function podeEditarNomeDaConta(role: Role): boolean {
  return ROLES_QUE_EDITAM_NOME.includes(role);
}

export const MENSAGEM_NOME_BLOQUEADO: Readonly<Partial<Record<Role, string>>> = {
  consultor: "O nome do consultor é compartilhado pelo sistema. Peça ao administrador para alterá-lo.",
  operacional: "O seu nome está ligado aos alertas dos processos. Peça ao administrador para alterá-lo.",
};
