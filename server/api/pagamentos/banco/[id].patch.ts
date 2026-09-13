import { defineEventHandler, getRouterParam, createError } from "h3";
import { fecharLoteBanco } from "../../../utils/pagamentosStore";
import type { LoteBanco } from "../../../../shared/types/Pagamento";

// Regra 4: marca o dia como pago — fecha o lote e move o lote inteiro
// (lançamentos + resumo) para "Pagamentos realizados".
export default defineEventHandler(async (event): Promise<LoteBanco> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do lote não informado." });
  }
  return await fecharLoteBanco(id);
});
