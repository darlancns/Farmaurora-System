import { defineEventHandler, getRouterParam, createError } from "h3";
import { deleteProcesso } from "../../utils/processosStore";

export default defineEventHandler(async (event): Promise<{ deleted: true }> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const deleted = await deleteProcesso(id);

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return { deleted: true };
});
