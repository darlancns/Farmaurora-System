import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { updateLembrete } from "../../utils/lembretesPessoaisStore";
import { isValidLembretePatch } from "../../utils/lembreteValidation";
import type { AuthUser } from "#shared/types/auth";
import type { LembretePessoal } from "#shared/types/lembretePessoal";

/**
 * Edita um lembrete pessoal — sempre escopado ao próprio usuário (a query já
 * filtra por usuario_id em lembretesPessoaisStore.updateLembrete). Patch
 * parcial: só as chaves presentes no body mudam.
 */
export default defineEventHandler(async (event): Promise<LembretePessoal> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);
  if (!isValidLembretePatch(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do lembrete inválidos." });
  }

  const atualizado = await updateLembrete(id, user.id, body);
  if (!atualizado) {
    throw createError({ statusCode: 404, statusMessage: "Lembrete não encontrado." });
  }
  return atualizado;
});
