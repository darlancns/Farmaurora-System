import { defineEventHandler, getQuery, createError } from "h3";
import type { PaginaMedicamentos } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { validarConsultaMedicamentos } from "../../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../../utils/comprasAcesso";
import { listarMedicamentosDeCompra } from "../../../utils/comprasCatalogo";
import { responderErroDeCompra } from "../../../utils/comprasErro";

// A busca LEVE de medicamentos do formulário de Compras: só uma página de medicamentos ATIVOS (`?q=` busca, `?limite=` 1 a 100 — padrão 50 —,
// `?pagina=`), a cada tecla do campo de busca. Devolve { itens, pagina, limite, temMais, q } e NADA mais: nenhuma outra lista (ao contrário
// de GET /api/compras/opcoes, que fica para a carga inicial) e nunca chave PIX. Mesma regra de acesso: compras = ver (o sócio inclusive).
export default defineEventHandler(async (event): Promise<PaginaMedicamentos> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const consulta = validarConsultaMedicamentos(getQuery(event));
  if (!consulta.ok) throw createError({ statusCode: 400, statusMessage: consulta.erro });

  try {
    return await listarMedicamentosDeCompra(consulta.valor);
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
