import { defineEventHandler } from "h3";
import { listRecadosVisiveis } from "../../utils/recadosStore";
import type { AuthUser } from "#shared/types/auth";
import type { Recado } from "#shared/types/recado";

/**
 * Lista os recados visíveis pro usuário autenticado: públicos + do próprio
 * cargo + direcionados a ele + os que ele autorou. Sem filtro de aba
 * (Todos/Recebidos/Enviados) nem de tipo — fica pro client (Fase B/D).
 */
export default defineEventHandler(async (event): Promise<Recado[]> => {
  const user = event.context.user as AuthUser;
  return await listRecadosVisiveis(user.id, user.role);
});
