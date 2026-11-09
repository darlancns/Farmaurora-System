import { defineEventHandler, readBody, createError } from "h3";
import { exigirAdministradorNosCadastros, listaDaRota } from "../../../utils/cadastroAcesso";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { criarCadastro, responderErroDeRegra } from "../../../utils/cadastrosStore";
import { validarNovoCadastro } from "../../../../shared/utils/cadastroValidacao";
import type { Cadastro } from "../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../shared/types/auth";

// Cria um item (nasce ativo). Só o administrador. 400 dados inválidos (inclui o nome reservado "Outro"),
// 409 nome repetido (incluindo inativos).
export default defineEventHandler(async (event): Promise<Cadastro> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);
  const lista = listaDaRota(event);

  const dados = validarNovoCadastro(lista, await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  try {
    return await criarCadastro(lista, dados.valor, nomeParaAuditoria(user));
  } catch (e) {
    return responderErroDeRegra(e);
  }
});
