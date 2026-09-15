import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getRecado, updateRecado } from "../../utils/recadosStore";
import { isValidNewRecadoPayload } from "../../utils/recadoValidation";
import type { AuthUser } from "#shared/types/auth";
import type { Recado } from "#shared/types/recado";

/**
 * Edita um recado — só o autor (ver docs/recados-spec.md seção 4). Substitui
 * o recado inteiro (mesmo validador do POST) e reenvia notificação aos
 * destinatários atuais.
 */
export default defineEventHandler(async (event): Promise<Recado> => {
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
    throw createError({ statusCode: 403, statusMessage: "Só o autor pode editar este recado." });
  }

  const body = await readBody(event);
  if (!isValidNewRecadoPayload(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do recado inválidos ou incompletos." });
  }

  const autorNome = user.nome ?? user.email;
  const atualizado = await updateRecado(id, autorNome, body);
  if (!atualizado) {
    throw createError({ statusCode: 404, statusMessage: "Recado não encontrado." });
  }
  return atualizado;
});
