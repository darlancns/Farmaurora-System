import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, patchProcesso } from "../../utils/processosStore";
import { isValidProcessoPatch } from "../../utils/processoValidation";
import { assertPodeResolverMandado, patchTocaAlertaMandado } from "../../utils/processoMandadoAuth";
import type { AuthUser } from "../../../shared/types/auth";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidProcessoPatch(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do processo inválidos.",
    });
  }

  // Resolver o alerta de Mandado de Segurança só vale pro administrador e pro operacional
  // responsável DAQUELA linha — por isso lê a linha antes de gravar. Os demais campos do PATCH
  // não passam por esta checagem (o middleware já controlou a seção/método).
  if (patchTocaAlertaMandado(body as Record<string, unknown>)) {
    const atual = await getProcesso(id);
    if (!atual) {
      throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
    }
    const user: AuthUser | null = event.context.user;
    assertPodeResolverMandado(user, atual.responsavelOperacional);
  }

  const updated = await patchProcesso(id, body);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return updated;
});
