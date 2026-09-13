import { defineEventHandler, getRouterParam, createError } from "h3";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import { assertNotLastAdmin } from "../../../utils/authUser";
import type { AuthUser } from "#shared/types/auth";

/**
 * Exclui uma conta. Admin only.
 *
 * Trava anti-lockout: não permite excluir a ÚNICA conta administrador
 * restante — vale para qualquer conta, inclusive a própria.
 */
export default defineEventHandler(async (event): Promise<{ id: string; deleted: true }> => {
  const user: AuthUser | null = event.context.user;
  if (!user || !user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Acesso restrito a administradores." });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const admin = createSupabaseAdminClient();

  await assertNotLastAdmin(admin, id, "excluir");

  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    const notFound = error.status === 404;
    throw createError({
      statusCode: notFound ? 404 : 502,
      statusMessage: notFound
        ? "Conta não encontrada."
        : "Não foi possível excluir a conta no Supabase Auth.",
    });
  }

  return { id, deleted: true };
});
