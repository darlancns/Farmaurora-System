import { defineEventHandler, createError } from "h3";
import { createSupabaseAdminClient } from "../../utils/supabaseServerClient";
import { listAllAuthUsers, toAdminUserSummary } from "../../utils/authUser";
import { canReadSection } from "#shared/utils/rbac";
import type { AuthUser, AdminUserSummary } from "#shared/types/auth";

/**
 * Lista todas as contas para a tela de Configurações → Contas.
 *
 * Só o administrador lê (seção `admin` no middleware + checagem redundante aqui, a mesma regra) — o sócio
 * leva 403. Escrita (criar/editar/excluir/resetar senha) também é exclusiva de administrador nos outros
 * endpoints de server/api/admin/. Devolve também `permissoes` (mapa por página, ou null). Pagina o `listUsers` até o fim (ver `listAllAuthUsers`) —
 * nunca assume que cabe tudo numa página. Devolve só campos não sensíveis (ver
 * `toAdminUserSummary`): sem hash de senha, tokens ou identities.
 */
export default defineEventHandler(async (event): Promise<AdminUserSummary[]> => {
  const user: AuthUser | null = event.context.user;
  if (!user || !canReadSection(user.role, "admin")) {
    throw createError({ statusCode: 403, statusMessage: "Acesso restrito a administradores." });
  }

  const admin = createSupabaseAdminClient();
  const summaries = (await listAllAuthUsers(admin)).map(toAdminUserSummary);

  summaries.sort((a, b) => a.email.localeCompare(b.email));
  return summaries;
});
