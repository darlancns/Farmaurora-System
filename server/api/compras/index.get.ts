import { defineEventHandler, getQuery, createError } from "h3";
import type { ListaCompras } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarConsultaListaCompras } from "../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../utils/comprasAcesso";
import { anoMesDeBrasilia, listarComprasDoMes, responderErroDeCompra } from "../../utils/comprasStore";

// Lista as compras de um mês para o painel esquerdo: `?ano_mes=AAAA-MM` (sem ele, o mês ATUAL de Brasília), `?status=` (rascunho,
// pronta, parcial, encaminhada ou cancelada), `?pagina=` ("mostrar mais": 50 por vez, `temMais` diz se há outra página) e, só para as
// canceladas junto das outras, `?incluir_canceladas=1`. Sem filtro, as canceladas ficam de fora. Quem LÊ Compras (administrador,
// operacional, sócio; o mapa da conta decide). Cada compra vem só com o necessário para a linha (sem valores, contatos nem endereços;
// o detalhe é GET /api/compras/:id) e a resposta traz os `totais` por estado do mês inteiro. Mais recente primeiro.
export default defineEventHandler(async (event): Promise<ListaCompras> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const consulta = validarConsultaListaCompras(getQuery(event), anoMesDeBrasilia());
  if (!consulta.ok) throw createError({ statusCode: 400, statusMessage: consulta.erro });

  try {
    return await listarComprasDoMes(consulta.valor.anoMes, {
      status: consulta.valor.status,
      incluirCanceladas: consulta.valor.incluirCanceladas,
      pagina: consulta.valor.pagina,
    });
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
