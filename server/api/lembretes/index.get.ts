import { defineEventHandler } from "h3";
import { listLembretes } from "../../utils/lembretesPessoaisStore";
import type { AuthUser } from "#shared/types/auth";
import type { LembretePessoal } from "#shared/types/lembretePessoal";

/** Lista os lembretes pessoais do usuário autenticado — nunca de outra conta. */
export default defineEventHandler(async (event): Promise<LembretePessoal[]> => {
  const user = event.context.user as AuthUser;
  return await listLembretes(user.id);
});
