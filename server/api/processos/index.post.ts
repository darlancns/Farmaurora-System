import { defineEventHandler, readBody, createError } from "h3";
import { createProcesso } from "../../utils/processosStore";
import {
  ciaAereaCanonica,
  erroModalCiaNoPost,
  erroNumeroPo,
  isValidProcessoPayload,
  numeroPoCanonico,
} from "../../utils/processoValidation";
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

  // Nº Ordem preenchido precisa estar no formato PO-00-0000 (+ / e números; incompleto vale).
  const erroPo = erroNumeroPo(body);
  if (erroPo) {
    throw createError({ statusCode: 400, statusMessage: erroPo });
  }

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = sem cia) e do Nº Ordem (normalizado;
  // vazio = sem Nº Ordem, a coluna nem entra no insert).
  const cia = ciaAereaCanonica(body.companhiaAerea);
  const po = numeroPoCanonico(body.numeroPo);
  const { companhiaAerea: _bruta, numeroPo: _poBruto, ...resto } = body;
  return await createProcesso({ ...resto, ...(cia ? { companhiaAerea: cia } : {}), ...(po ? { numeroPo: po } : {}) });
});
