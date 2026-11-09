import type { AuthUser } from "../../shared/types/auth";

// Nome gravado em dir.fechamento_restante_por: o `nome` da conta; sem ele (conta antiga), a parte do
// e-mail antes do @ — a mesma regra do GlobalHeader.vue. Sem usuário (não deveria ocorrer: o
// middleware exige sessão em /api/dir) devolve "desconhecido".
export function nomeParaAuditoriaDir(user: Pick<AuthUser, "nome" | "email"> | null | undefined): string {
  if (!user) return "desconhecido";
  return user.nome?.trim() || user.email.split("@")[0] || "desconhecido";
}
