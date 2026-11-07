import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, patchProcesso, patchProcessoVersionado } from "../../utils/processosStore";
import { isValidProcessoPatch, isVersaoValida, patchExigeVersao } from "../../utils/processoValidation";
import { assertPodeResolverMandado, patchTocaAlertaMandado } from "../../utils/processoMandadoAuth";
import type { AuthUser } from "../../../shared/types/auth";
import type { Processo, ProcessoPatchDTO } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidProcessoPatch(body)) {
    // Atualizações sem a versão: mensagem própria (o cliente sempre a envia; faltar = cliente antigo).
    const semVersao = patchExigeVersao(body) && !isVersaoValida((body as Record<string, unknown>).versao);
    throw createError({
      statusCode: 400,
      statusMessage: semVersao
        ? "Versão do processo não informada. Recarregue a página e tente de novo."
        : "Dados do processo inválidos.",
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

  // `versao` não é coluna: sai do patch antes de gravar.
  const { versao, ...patch } = body as ProcessoPatchDTO & { versao?: string };

  // Com `atualizacoes`: grava só se o updated_at da linha ainda for a versão que o cliente viu.
  if (patchExigeVersao(body) && versao !== undefined) {
    const resultado = await patchProcessoVersionado(id, patch, versao);
    if (resultado.tipo === "nao_encontrado") {
      throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
    }
    if (resultado.tipo === "versao_desatualizada") {
      throw createError({
        statusCode: 409,
        statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo.",
      });
    }
    return resultado.processo;
  }

  const updated = await patchProcesso(id, patch);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return updated;
});
