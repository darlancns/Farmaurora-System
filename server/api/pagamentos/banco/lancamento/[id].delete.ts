import { defineEventHandler, getRouterParam, createError } from "h3";
import { removerLancamentoBanco, type BancoPayload } from "../../../../utils/pagamentosStore";

// Exclui um lançamento do Banco. Só funciona enquanto o lote está em aberto; se
// o lote ficar vazio, ele também é removido.
export default defineEventHandler(async (event): Promise<BancoPayload> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do lançamento não informado." });
  }
  return await removerLancamentoBanco(id);
});
