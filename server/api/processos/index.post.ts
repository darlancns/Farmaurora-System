import { defineEventHandler, readBody, createError } from "h3";
import { createProcesso } from "../../utils/processosStore";
import { ciaAereaCanonica, erroModalCiaNoPost, isValidProcessoPayload } from "../../utils/processoValidation";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const body = await readBody(event);

  if (!isValidProcessoPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do processo inválidos ou incompletos.",
    });
  }

  // Cia. aérea preenchida exige modal preenchido e compatível com ela.
  const erroCia = erroModalCiaNoPost(body);
  if (erroCia) {
    throw createError({ statusCode: 400, statusMessage: erroCia });
  }

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = sem cia).
  const cia = ciaAereaCanonica(body.companhiaAerea);
  const { companhiaAerea: _bruta, ...resto } = body;
  return await createProcesso(cia ? { ...resto, companhiaAerea: cia } : resto);
});
