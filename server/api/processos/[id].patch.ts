import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, patchProcesso, patchProcessoVersionado } from "../../utils/processosStore";
import {
  ciaAereaCanonica,
  erroModalCiaNoPatch,
  isValidProcessoPatch,
  isVersaoValida,
  patchExigeVersao,
  patchTocaModalOuCia,
} from "../../utils/processoValidation";
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
  // A linha armazenada só é lida quando alguma checagem abaixo precisa dela (uma leitura, reaproveitada).
  let armazenado: Processo | null | undefined;
  async function linhaArmazenada(): Promise<Processo> {
    if (armazenado === undefined) armazenado = await getProcesso(id!);
    if (!armazenado) {
      throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
    }
    return armazenado;
  }

  if (patchTocaAlertaMandado(body as Record<string, unknown>)) {
    const atual = await linhaArmazenada();
    const user: AuthUser | null = event.context.user;
    assertPodeResolverMandado(user, atual.responsavelOperacional);
  }

  // Cia. aérea × modal: só confere se o patch toca modal ou cia (ver erroModalCiaNoPatch). Um patch que
  // não mexe nos dois nunca valida a cia — dado antigo inconsistente não impede editar outros campos.
  if (patchTocaModalOuCia(body)) {
    const atual = await linhaArmazenada();
    const erroCia = erroModalCiaNoPatch(body, { modalEnvio: atual.modalEnvio, companhiaAerea: atual.companhiaAerea });
    if (erroCia) {
      throw createError({ statusCode: 400, statusMessage: erroCia });
    }
  }

  // `versao` e `parcial` não são colunas: saem do patch antes de gravar.
  const { versao, parcial, ...patch } = body as ProcessoPatchDTO & { versao?: string };

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = null).
  if ("companhiaAerea" in patch) patch.companhiaAerea = ciaAereaCanonica(patch.companhiaAerea);

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

  // Formato antigo (sem `parcial`): a chamada é exatamente a de sempre.
  const updated = parcial === true ? await patchProcesso(id, patch, { parcial: true }) : await patchProcesso(id, patch);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  return updated;
});
