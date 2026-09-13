import type { ConsultorNome } from "./Patient";
import type { Role } from "../utils/rbac";

/**
 * Usuário autenticado, normalizado a partir da sessão do Supabase Auth.
 * O Supabase Auth cuida da autenticação (email + senha); os dados de negócio
 * (Pacientes, Processos, Pagamentos) vivem em tabelas Postgres do MESMO projeto
 * Supabase, acessadas server-side com a service role key (ver
 * server/utils/supabaseServerClient.ts). Não há RLS: o controle de acesso é
 * feito na camada de API (server/middleware/auth.ts + shared/utils/rbac.ts).
 *
 * `role` e `consultorNome` vêm de `user.app_metadata` (gravável só server-side
 * com a service role key — o client não consegue se auto-promover).
 */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** Presente só quando `role === "consultor"`. */
  consultorNome?: ConsultorNome;
  /** Derivado de `role === "administrador"` — mantido para checks legados. */
  isAdmin: boolean;
}

/**
 * Resumo de uma conta para a tela de Configurações → Contas. Só campos não
 * sensíveis — nunca hash de senha, tokens ou identities.
 */
export interface AdminUserSummary {
  id: string;
  email: string;
  role: Role;
  consultorNome?: ConsultorNome;
  createdAt: string;
  lastSignInAt: string | null;
}

/** Body do PATCH /api/admin/users/[id]. */
export interface UpdateUserRoleDTO {
  role: Role;
  consultorNome?: ConsultorNome;
}
