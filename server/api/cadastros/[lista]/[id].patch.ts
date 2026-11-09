import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { exigirAdministradorNosCadastros, listaDaRota } from "../../../utils/cadastroAcesso";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { alterarCadastro, responderErroDeRegra } from "../../../utils/cadastrosStore";
import { validarPatchCadastro } from "../../../../shared/utils/cadastroValidacao";
import type { Cadastro } from "../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../shared/types/auth";

// Altera um item (país, prazo/sem alerta, contato, telefone, e-mail, ativo). Só o administrador. Desativar e reativar
// são `{ ativo: false | true }` — NÃO existe rota de exclusão. O NOME não muda depois de criado: 422.
export default defineEventHandler(async (event): Promise<Cadastro> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);
  const lista = listaDaRota(event);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  const dados = validarPatchCadastro(lista, await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  let atualizado: Cadastro | null;
  try {
    atualizado = await alterarCadastro(lista, id, dados.valor, nomeParaAuditoria(user));
  } catch (e) {
    return responderErroDeRegra(e);
  }

  if (!atualizado) throw createError({ statusCode: 404, statusMessage: "Item não encontrado." });
  return atualizado;
});
