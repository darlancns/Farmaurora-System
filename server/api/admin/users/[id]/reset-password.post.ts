import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { createSupabaseAdminClient } from "../../../../utils/supabaseServerClient";
import { formatPasswordError } from "#shared/utils/authErrors";
import type { AuthUser } from "#shared/types/auth";

interface ResetBody {
  password?: unknown;
}

/**
 * Define uma nova senha para uma conta. Admin only.
 *
 * Sem trava de "própria conta": redefinir a própria senha não tem risco de
 * lockout. A senha nunca é logada nem devolvida no corpo da resposta — quem a
 * exibe uma única vez é o client, a partir do valor que ele mesmo gerou/digitou.
 */
export default defineEventHandler(async (event): Promise<{ id: string; updated: true }> => {
  const user: AuthUser | null = event.context.user;
  if (!user || !user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Acesso restrito a administradores." });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = (await readBody(event)) as ResetBody;
  const password = typeof body.password === "string" ? body.password : "";

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "A nova senha precisa ter pelo menos 8 caracteres.",
    });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });

  if (error) {
    const notFound = error.status === 404;
    throw createError({
      statusCode: notFound ? 404 : 502,
      statusMessage: notFound
        ? "Conta não encontrada."
        : formatPasswordError(error, "Não foi possível redefinir a senha no Supabase Auth."),
    });
  }

  return { id, updated: true };
});
