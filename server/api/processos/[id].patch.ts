import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { patchProcesso } from "../../utils/processosStore";
import { isValidProcessoPatch } from "../../utils/processoValidation";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidProcessoPatch(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do processo inválidos.",
    });
  }

  const updated = await patchProcesso(id, body);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return updated;
});
