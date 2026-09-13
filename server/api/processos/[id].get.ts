import { defineEventHandler, getRouterParam, createError } from "h3";
import { getProcesso } from "../../utils/processosStore";
import type { Processo } from "../../../shared/types/processo";
import type { AuthUser } from "#shared/types/auth";
import { isRowScopedToOwnConsultor } from "#shared/utils/rbac";

export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const processo = await getProcesso(id);

  if (!processo) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  // Cargo "consultor": processo de outro consultor responde 404 (não vaza
  // existência de registros fora do próprio nome).
  const user: AuthUser | null = event.context.user;
  if (user && isRowScopedToOwnConsultor(user.role) && processo.consultor !== user.consultorNome) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return processo;
});
