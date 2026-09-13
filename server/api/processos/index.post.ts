import { defineEventHandler, readBody, createError } from "h3";
import { createProcesso } from "../../utils/processosStore";
import { isValidProcessoPayload } from "../../utils/processoValidation";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const body = await readBody(event);

  if (!isValidProcessoPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do processo inválidos ou incompletos.",
    });
  }

  return await createProcesso(body);
});
