import { defineEventHandler } from "h3";
import { listarBancoPayload, type BancoPayload } from "../../utils/pagamentosStore";

export default defineEventHandler(async (): Promise<BancoPayload> => {
  return await listarBancoPayload();
});
