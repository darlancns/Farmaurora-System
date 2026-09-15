import { defineEventHandler, getRouterParam, createError } from "h3";
import { toggleFixar } from "../../../utils/recadosStore";
import type { AuthUser } from "#shared/types/auth";

/**
 * Fixa/desfixa um recado pro usuário autenticado — toggle individual por
 * conta, sem afetar a visualização de ninguém mais. Qualquer um que enxergue
 * o recado pode fixar, não só o autor.
 */
export default defineEventHandler(async (event): Promise<{ fixado: boolean }> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const fixado = await toggleFixar(user.id, id);
  return { fixado };
});
