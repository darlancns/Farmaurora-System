import { defineEventHandler, getRouterParam, createError } from "h3";
import { getRecado, concluirRecado } from "../../../utils/recadosStore";
import type { AuthUser } from "#shared/types/auth";

/**
 * Marca o recado como concluído pro usuário autenticado — ação final e
 * irreversível, individual por conta (ver docs/recados-spec.md seção 6). Sem
 * endpoint de "desconcluir". Idempotente: chamar de novo num recado já
 * concluído não dá erro nem reenvia notificação ao autor.
 */
export default defineEventHandler(async (event): Promise<{ concluido: true }> => {
  const user = event.context.user as AuthUser;
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const existente = await getRecado(id);
  if (!existente) {
    throw createError({ statusCode: 404, statusMessage: "Recado não encontrado." });
  }

  const nome = user.nome ?? user.email;
  await concluirRecado(user.id, nome, id);
  return { concluido: true };
});
