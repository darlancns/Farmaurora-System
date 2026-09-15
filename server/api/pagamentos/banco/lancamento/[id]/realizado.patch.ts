import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { atualizarLancamentoRealizado, type BancoPayload } from "../../../../../utils/pagamentosStore";
import { isValidAtualizarLancamentoRealizado } from "../../../../../utils/pagamentoValidation";

// Corrige cliente + data de pagamento de um lançamento JÁ PAGO, em
// "Pagamentos realizados". `cliente` grava só neste lançamento; `pagoEm`
// grava no LOTE inteiro (mesmo escopo que pagoEm sempre teve). Caminho
// separado do PATCH geral do lançamento (que continua bloqueado pós-pago) —
// os dois coexistem, com propósitos diferentes.
export default defineEventHandler(async (event): Promise<BancoPayload> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do lançamento não informado." });
  }

  const body = await readBody(event);
  if (!isValidAtualizarLancamentoRealizado(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do pagamento realizado inválidos." });
  }

  return await atualizarLancamentoRealizado(id, body);
});
