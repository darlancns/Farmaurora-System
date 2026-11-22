import { defineEventHandler, getRouterParam, readBody, createError } from "h3";
import type { Compra } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { idDaCompraValido, validarCompraSalvar } from "../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { validarEstadoContraCadastros } from "../../utils/comprasCatalogo";
import { salvarCompra } from "../../utils/comprasStore";
import { responderErroDeCompra } from "../../utils/comprasErro";

// O SALVAMENTO AUTOMÁTICO da compra (só quem ESCREVE em Compras). O corpo é o estado (ver shared/utils/compraValidacao.ts): validado aqui,
// no servidor; `atualizadoEm` é a versão que o cliente viu. 400 corpo inválido; 404 não existe; 409 versão antiga (a resposta traz a
// compra atual em `data.atual`), compra cancelada ou id de item de outra compra; 422 consultor, despachante ou fornecedor que não
// são do Cadastro (ativos), envio fora de MODAIS_ENVIO, cia que não vale para o envio, empresa ou brand inválidos, ou medicamento do
// Cadastro/pré-cadastro que não existe. Rascunho parcial é válido.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  const dados = validarCompraSalvar(await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  try {
    // Consultor, despachante, fornecedor, envio, cia, empresa e brand são conferidos com a compra como está no banco (e valem os valores que ela já tinha).
    const compra = await salvarCompra(id, dados.valor, nomeParaAuditoria(user), {
      antesDeGravar: (atual) => validarEstadoContraCadastros(dados.valor, atual),
    });
    if (!compra) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    return compra;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
