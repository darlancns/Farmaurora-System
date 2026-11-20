import { defineEventHandler, getRouterParam, createError } from "h3";
import type { Compra } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { idDaCompraValido } from "../../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../../utils/comprasAcesso";
import { cancelarCompra, responderErroDeCompra } from "../../../utils/comprasStore";

// Cancela a compra (cancelada = true; compra NUNCA é apagada). Idempotente. Só quem ESCREVE em Compras. 404 se não existe.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  try {
    const compra = await cancelarCompra(id, nomeParaAuditoria(user));
    if (!compra) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    return compra;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
