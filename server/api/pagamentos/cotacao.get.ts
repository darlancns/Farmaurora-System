import { defineEventHandler } from "h3";
import { listarBancoPayload, type BancoPayload } from "../../utils/pagamentosStore";

// A cotação é derivada dos lotes + lançamentos do Banco (mesma fonte). O cliente
// monta as views por lote com app/utils/pagamentoCalculations.ts.
export default defineEventHandler(async (): Promise<BancoPayload> => {
  return await listarBancoPayload();
});
