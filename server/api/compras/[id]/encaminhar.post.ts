import { defineEventHandler, getRouterParam, readBody, createError } from "h3";
import type { RespostaEncaminhar } from "../../../../shared/types/compra";
import type { AuthUser } from "../../../../shared/types/auth";
import { idDaCompraValido, validarEncaminharCompra } from "../../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../../utils/comprasAcesso";
import { exigirEscritaDir } from "../../../utils/dirAcesso";
import { encaminharCompra } from "../../../utils/comprasEncaminhar";
import { responderErroDeCompra } from "../../../utils/comprasStore";

// ENCAMINHAR para a DIR: cada ordem ainda não encaminhada vira UMA linha da DIR. Cria linhas na DIR, então exige as DUAS permissões:
// `compras = editar` E `dir = editar` (o middleware só confere a seção da URL, `compras`; a da DIR é conferida aqui).
// Corpo: `{ atualizadoEm, ordemIds?, confirmarTemperaturaMista? }`. 200 `{ compra, criadas, jaEncaminhada }`.
// 400 corpo inválido · 404 não existe · 409 cancelada, versão antiga (`data.atual`) ou PO já na DIR · 422 checklist, vendedor inativo,
// PO repetido na compra ou temperatura mista sem confirmar (cada um com `data.code`). Repetir é seguro (idempotente).
export default defineEventHandler(async (event): Promise<RespostaEncaminhar> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);
  exigirEscritaDir(user);

  const id = getRouterParam(event, "id");
  if (!idDaCompraValido(id)) throw createError({ statusCode: 400, statusMessage: "ID inválido." });

  const corpo = validarEncaminharCompra(await readBody(event));
  if (!corpo.ok) throw createError({ statusCode: 400, statusMessage: corpo.erro });

  try {
    const resposta = await encaminharCompra(id, corpo.valor, nomeParaAuditoria(user));
    if (!resposta) throw createError({ statusCode: 404, statusMessage: "Compra não encontrada." });
    return resposta;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
