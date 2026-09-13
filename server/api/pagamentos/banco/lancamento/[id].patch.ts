import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { atualizarLancamentoBanco, type BancoPayload } from "../../../../utils/pagamentosStore";
import { isValidAtualizarLancamentoBanco } from "../../../../utils/pagamentoValidation";

// Edita os campos livres de um lançamento do Banco (fornecedor, invoice, cliente,
// valorMoeda). Só funciona enquanto o lote está em aberto.
export default defineEventHandler(async (event): Promise<BancoPayload> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do lançamento não informado." });
  }

  const body = await readBody(event);
  if (!isValidAtualizarLancamentoBanco(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do lançamento inválidos." });
  }

  return await atualizarLancamentoBanco(id, body);
});
