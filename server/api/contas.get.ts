import { defineEventHandler } from "h3";
import { createSupabaseAdminClient } from "../utils/supabaseServerClient";
import { listAllAuthUsers, toContaSummary } from "../utils/authUser";
import type { ContaSummary } from "#shared/types/auth";

/**
 * Lista enxuta de contas pro seletor de destinatário de Recados — só id, nome
 * e cargo, sem e-mail nem datas. Diferente de GET /api/admin/users: aberto a
 * qualquer cargo autenticado (Section "recados" no RBAC), não só
 * administrador — ver shared/utils/rbac.ts.
 */
export default defineEventHandler(async (): Promise<ContaSummary[]> => {
  const admin = createSupabaseAdminClient();
  const summaries = (await listAllAuthUsers(admin)).map(toContaSummary);

  summaries.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
  return summaries;
});
