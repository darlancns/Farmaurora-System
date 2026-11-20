import { defineEventHandler, getRouterParam, createError } from "h3";
import type { PreviaEncaminhar } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { idDaCompraValido } from "../../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../../utils/comprasAcesso";
import { previaEncaminhar } from "../../../utils/comprasEncaminhar";
import { responderErroDeCompra } from "../../../utils/comprasStore";

// A PRÉVIA do "Encaminhar para a DIR" (só leitura): a linha da DIR que cada ordem criaria e tudo o que impede o Encaminhar (erros da checagem,
// vendedor inativo, POs repetidos na compra, POs que já existem na DIR). Vale `compras = ver`. Da DIR só se sabe QUAIS POs já existem: nada de
// paciente nem de id de outra linha. 404 se a compra não existe; 409 se está cancelada.
export default defineEventHandler(async (event): Promise<PreviaEncaminhar> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  try {
    const previa = await previaEncaminhar(id);
    if (!previa) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    return previa;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
