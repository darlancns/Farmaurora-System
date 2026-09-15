import { defineEventHandler, getRouterParam, createError } from "h3";
import { getRecado, deleteRecado } from "../../utils/recadosStore";
import type { AuthUser } from "#shared/types/auth";

/** Exclui um recado — só o autor. Hard delete, sem soft delete. */
export default defineEventHandler(async (event): Promise<{ deleted: true }> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const existente = await getRecado(id);
  if (!existente) {
    throw createError({ statusCode: 404, statusMessage: "Recado não encontrado." });
  }
  if (existente.autorId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: "Só o autor pode excluir este recado." });
  }

  const deleted = await deleteRecado(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Recado não encontrado." });
  }
  return { deleted: true };
});
