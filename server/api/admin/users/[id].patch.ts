import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import {
  parseRoleInput,
  roleAppMetadata,
  toAdminUserSummary,
  assertNotLastAdmin,
} from "../../../utils/authUser";
import type { AuthUser, AdminUserSummary } from "#shared/types/auth";

interface PatchBody {
  role?: unknown;
  consultorNome?: unknown;
}

/**
 * Atualiza o cargo (e o nome do consultor, quando aplicável) de uma conta.
 *
 * Admin only. Mesma validação do POST (`parseRoleInput`). Se o novo cargo não
 * for consultor, `consultorNome` é apagado do app_metadata.
 *
 * Trava anti-lockout: não permite demover (tirar o cargo `administrador` de)
 * a ÚNICA conta administrador restante — vale para qualquer conta, inclusive
 * a própria.
 */
export default defineEventHandler(async (event): Promise<AdminUserSummary> => {
  const user: AuthUser | null = event.context.user;
  if (!user || !user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Acesso restrito a administradores." });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = (await readBody(event)) as PatchBody;
  const { role, consultorNome } = parseRoleInput(body);

  const admin = createSupabaseAdminClient();

  // Só uma demoção (novo cargo ≠ administrador) pode causar lockout.
  if (role !== "administrador") {
    await assertNotLastAdmin(admin, id, "demover");
  }

  const { data, error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: roleAppMetadata(role, consultorNome),
  });

  if (error || !data.user) {
    const notFound = error?.status === 404;
    throw createError({
      statusCode: notFound ? 404 : 502,
      statusMessage: notFound
        ? "Conta não encontrada."
        : "Não foi possível atualizar a conta no Supabase Auth.",
    });
  }

  return toAdminUserSummary(data.user);
});
