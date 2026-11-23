import { defineEventHandler, getRouterParam, createError, readBody, setResponseStatus } from "h3";
import type { Compra } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { idDaCompraValido, validarNovaCompra } from "../../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../../utils/comprasAcesso";
import { duplicarCompra } from "../../../utils/comprasStore";
import { responderErroDeCompra } from "../../../utils/comprasErro";

// Duplica a compra: uma NOVA compra com os mesmos dados e os mesmos medicamentos (ids novos), sem cancelada, com o Nº da compra DIGITADO no corpo
// (`{ sequencia }`): o número da original nunca é copiado e o servidor nunca escolhe um. Só quem ESCREVE em Compras. 201 com a nova; 400 número
// inválido; 404 se a original não existe; 409 (`data.code` = NUMERO_JA_EXISTE) se o número já existe no mês (nada é criado).
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  const corpo = validarNovaCompra(await readBody(event));
  if (!corpo.ok) throw createError({ statusCode: 400, statusMessage: corpo.erro });

  try {
    const copia = await duplicarCompra(id, nomeParaAuditoria(user), { sequencia: corpo.valor.sequencia });
    if (!copia) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    setResponseStatus(event, 201);
    return copia;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
