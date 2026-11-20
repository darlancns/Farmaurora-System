import { defineEventHandler, getQuery, createError } from "h3";
import type { CompraDaLista } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarAnoMesDaConsulta } from "../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../utils/comprasAcesso";
import { anoMesDeBrasilia, listarComprasDoMes, responderErroDeCompra } from "../../utils/comprasStore";

// Lista as compras de um mês: `?ano_mes=AAAA-MM` (sem ele, o mês ATUAL de Brasília) e, com `?incluir_canceladas=1`, também as canceladas.
// Quem LÊ Compras (administrador, operacional, sócio; o mapa da conta decide). Cada compra vem sem as ordens, com o total de ordens e
// quantas já foram encaminhadas; o detalhe é GET /api/compras/:id. Mais recente primeiro.
export default defineEventHandler(async (event): Promise<{ anoMes: string; compras: CompraDaLista[] }> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const consulta = getQuery(event);
  const mes = validarAnoMesDaConsulta(consulta.ano_mes, anoMesDeBrasilia());
  if (!mes.ok) throw createError({ statusCode: 400, statusMessage: mes.erro });

  try {
    const compras = await listarComprasDoMes(mes.valor, { incluirCanceladas: consulta.incluir_canceladas === "1" });
    return { anoMes: mes.valor, compras };
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
