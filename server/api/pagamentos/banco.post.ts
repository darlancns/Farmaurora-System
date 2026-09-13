import { defineEventHandler, readBody, createError } from "h3";
import { criarLancamentoBanco } from "../../utils/pagamentosStore";
import { isValidNovoLancamentoBanco } from "../../utils/pagamentoValidation";
import type { LancamentoBanco, LoteBanco } from "../../../shared/types/Pagamento";

export default defineEventHandler(
  async (event): Promise<{ lancamento: LancamentoBanco; lote: LoteBanco }> => {
    const body = await readBody(event);

    if (!isValidNovoLancamentoBanco(body)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Dados do lançamento inválidos ou incompletos.",
      });
    }

    return await criarLancamentoBanco(body);
  }
);
