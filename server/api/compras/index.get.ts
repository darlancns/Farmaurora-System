import { defineEventHandler, getQuery, createError } from "h3";
import type { ListaCompras } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarConsultaListaCompras } from "../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../utils/comprasAcesso";
import { anoMesDeBrasilia, listarComprasDoMes } from "../../utils/comprasStore";
import { responderErroDeCompra } from "../../utils/comprasErro";

// Lista as compras de um mês para o painel esquerdo: `?ano_mes=AAAA-MM` (sem ele, o mês ATUAL de Brasília), `?pagina=` ("mostrar mais": 50 por vez, `temMais` diz se há outra página) e, só para as
// canceladas junto das outras, `?incluir_canceladas=1`. Sem ele, as canceladas ficam de fora. O `?status=` que existia deixou de existir
// (o estado é só ativa ou cancelada) e, se vier, é ignorado como qualquer parâmetro desconhecido. Quem LÊ Compras (administrador,
// operacional, sócio; o mapa da conta decide). Cada compra vem só com o necessário para a linha (sem valores, contatos nem endereços;
// o detalhe é GET /api/compras/:id) e a resposta traz os `totais` { ativas, canceladas } do mês inteiro. Mais recente primeiro.
export default defineEventHandler(async (event): Promise<ListaCompras> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const consulta = validarConsultaListaCompras(getQuery(event), anoMesDeBrasilia());
  if (!consulta.ok) throw createError({ statusCode: 400, statusMessage: consulta.erro });

  try {
    return await listarComprasDoMes(consulta.valor.anoMes, {
      incluirCanceladas: consulta.valor.incluirCanceladas,
      pagina: consulta.valor.pagina,
    });
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
