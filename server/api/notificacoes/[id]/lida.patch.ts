import { defineEventHandler, getRouterParam, createError } from "h3";
import { marcarComoLida } from "../../../utils/notificacoesStore";
import type { AuthUser } from "#shared/types/auth";

/** Marca uma notificação do próprio usuário como lida. */
export default defineEventHandler(async (event): Promise<{ lida: true }> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const ok = await marcarComoLida(user.id, id);
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: "Notificação não encontrada." });
  }
  return { lida: true };
});
