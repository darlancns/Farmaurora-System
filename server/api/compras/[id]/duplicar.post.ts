import { defineEventHandler, getRouterParam, createError, setResponseStatus } from "h3";
import type { Compra } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { idDaCompraValido } from "../../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../../utils/comprasAcesso";
import { duplicarCompra, responderErroDeCompra } from "../../../utils/comprasStore";

// Duplica a compra: uma NOVA compra com o próximo número do mês atual de Brasília, com os mesmos dados e as mesmas ordens e itens
// (ids novos), sem po, dir_id, encaminhada_em nem cancelada. Só quem ESCREVE em Compras. 201 com a nova; 404 se a original não existe.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  try {
    const copia = await duplicarCompra(id, nomeParaAuditoria(user));
    if (!copia) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    setResponseStatus(event, 201);
    return copia;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
