import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, gravarCienciaPrazoAnvisa } from "../../../utils/processosStore";
import { assertPodeDarCienciaAnvisa } from "../../../utils/processoAnvisaAuth";
import { parseDataISO } from "../../../../shared/utils/dataBrasilia";
import type { AuthUser } from "../../../../shared/types/auth";
import type { Processo } from "../../../../shared/types/processo";

/**
 * "Ciente" no aviso "Prazo limite pra Manifestação da ANVISA" (sino). Corpo: { prazo: "AAAA-MM-DD" } — o prazo que a
 * pessoa está reconhecendo. Grava alerta_anvisa_ciente_prazo = prazo SÓ se ele ainda for o prazo_anvisa atual (senão
 * 409: o prazo mudou e a ciência não pode valer para o novo). Vale para todos (como Mandado e Fornecedor).
 *
 * Permissão (no padrão do resolver do Mandado, processoMandadoAuth.ts): administrador ou operacional responsável pela
 * LINHA gravada; os demais recebem 403. Não mexe em updated_at nem cria notificação gravada. Devolve o processo.
 */
export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  const body = (await readBody(event)) as Record<string, unknown> | null;
  const prazo = typeof body?.prazo === "string" ? body.prazo.trim() : "";
  if (!parseDataISO(prazo)) {
    throw createError({ statusCode: 400, statusMessage: "Prazo inválido. Use AAAA-MM-DD." });
  }

  const atual = await getProcesso(id);
  if (!atual) throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });

  const user: AuthUser | null | undefined = event.context.user;
  assertPodeDarCienciaAnvisa(user, atual.responsavelOperacional);

  const mudou = () =>
    createError({
      statusCode: 409,
      statusMessage: "O prazo da ANVISA deste processo mudou. Confira o prazo novo antes de dar ciência.",
    });
  if (atual.datas.prazoAnvisa !== prazo) throw mudou();

  const resultado = await gravarCienciaPrazoAnvisa(id, prazo);
  if (resultado.tipo === "nao_encontrado") throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  if (resultado.tipo === "prazo_mudou") throw mudou();
  return resultado.processo;
});
