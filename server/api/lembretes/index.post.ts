import { defineEventHandler, readBody, createError } from "h3";
import { createLembrete } from "../../utils/lembretesPessoaisStore";
import { isValidNewLembretePayload } from "../../utils/lembreteValidation";
import type { AuthUser } from "#shared/types/auth";
import type { LembretePessoal } from "#shared/types/lembretePessoal";

export default defineEventHandler(async (event): Promise<LembretePessoal> => {
  const user = event.context.user as AuthUser;
  const body = await readBody(event);

  if (!isValidNewLembretePayload(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do lembrete inválidos ou incompletos." });
  }

  return await createLembrete(user.id, body);
});
