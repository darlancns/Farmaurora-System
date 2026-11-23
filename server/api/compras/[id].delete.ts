import { defineEventHandler, getRouterParam, createError } from "h3";
import type { AuthUser } from "../../../shared/types/auth";
import { idDaCompraValido } from "../../../shared/utils/compraValidacao";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { apagarCompra } from "../../utils/comprasStore";
import { responderErroDeCompra } from "../../utils/comprasErro";

// APAGA a compra de verdade (e os itens dela; o número fica livre). Só quem ESCREVE em Compras (administrador e operacional, ou o mapa da conta; o sócio só
// lê e o consultor não acessa). Os pré-cadastros de medicamento pedidos a partir dela continuam existindo, sem o vínculo. 200 { id }; 404 se não existe
// (inclusive se outra pessoa acabou de apagar); 503 se o banco ainda não liberou o DELETE.
export default defineEventHandler(async (event): Promise<{ id: string }> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  try {
    if (!(await apagarCompra(id))) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    return { id };
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
