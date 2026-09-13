import { defineEventHandler, getRouterParam, createError } from "h3";
import { deletePatient } from "../../utils/patientsStore";

export default defineEventHandler(async (event): Promise<{ deleted: true }> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const deleted = await deletePatient(id);

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Lançamento não encontrado." });
  }

  return { deleted: true };
});
