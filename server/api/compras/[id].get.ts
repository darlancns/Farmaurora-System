import { defineEventHandler, getRouterParam, createError } from "h3";
import type { Compra } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { idDaCompraValido } from "../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../utils/comprasAcesso";
import { obterCompra } from "../../utils/comprasStore";

// A compra com as ordens e os itens por posição. Quem LÊ Compras (o sócio inclusive, com os valores). 404 se não existe.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  const compra = await obterCompra(id);
  if (!compra) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
  return compra;
});
