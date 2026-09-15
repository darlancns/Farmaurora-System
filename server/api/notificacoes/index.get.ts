import { defineEventHandler } from "h3";
import { listNotificacoes } from "../../utils/notificacoesStore";
import type { AuthUser } from "#shared/types/auth";
import type { Notificacao } from "#shared/types/notificacao";

/** Lista as notificações do usuário autenticado, mais recentes primeiro. */
export default defineEventHandler(async (event): Promise<Notificacao[]> => {
  const user = event.context.user as AuthUser;
  return await listNotificacoes(user.id);
});
