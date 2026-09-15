import { defineEventHandler, getRouterParam, createError } from "h3";
import { deleteLembrete } from "../../utils/lembretesPessoaisStore";
import type { AuthUser } from "#shared/types/auth";

export default defineEventHandler(async (event): Promise<{ deleted: true }> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const deleted = await deleteLembrete(id, user.id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Lembrete não encontrado." });
  }
  return { deleted: true };
});
