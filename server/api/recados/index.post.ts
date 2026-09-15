import { defineEventHandler, readBody, createError } from "h3";
import { createRecado } from "../../utils/recadosStore";
import { isValidNewRecadoPayload } from "../../utils/recadoValidation";
import type { AuthUser } from "#shared/types/auth";
import type { Recado } from "#shared/types/recado";

/**
 * Cria um recado. Qualquer cargo pode criar (Section "recados" libera escrita
 * geral — ver shared/utils/rbac.ts). Dispara notificação aos destinatários
 * (recadosStore.createRecado → notificacoesStore).
 */
export default defineEventHandler(async (event): Promise<Recado> => {
  const user = event.context.user as AuthUser;
  const body = await readBody(event);

  if (!isValidNewRecadoPayload(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do recado inválidos ou incompletos." });
  }

  const autorNome = user.nome ?? user.email;
  return await createRecado(user.id, autorNome, body);
});
