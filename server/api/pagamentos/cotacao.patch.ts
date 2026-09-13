import { defineEventHandler, readBody, createError } from "h3";
import { atualizarCotacaoLote, type BancoPayload } from "../../utils/pagamentosStore";
import { isValidAtualizarCotacao } from "../../utils/pagamentoValidation";

// Lê/atualiza a cotação de um lote do dia. Aceita:
//  - { loteId, opcoes: [...] }          -> grava taxa/corretagem digitadas
//  - { loteId, bancoEscolhido: "XP" }   -> "Usar este banco" (regra 3)
export default defineEventHandler(async (event): Promise<BancoPayload> => {
  const body = await readBody(event);

  if (!body || typeof body !== "object" || typeof (body as { loteId?: unknown }).loteId !== "string") {
    throw createError({ statusCode: 400, statusMessage: "loteId não informado." });
  }

  const { loteId, ...patch } = body as { loteId: string } & Record<string, unknown>;

  if (!isValidAtualizarCotacao(patch)) {
    throw createError({ statusCode: 400, statusMessage: "Dados da cotação inválidos." });
  }

  return await atualizarCotacaoLote(loteId, patch);
});
