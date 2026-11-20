import { defineEventHandler, getQuery, createError } from "h3";
import type { AuthUser } from "../../../../shared/types/auth";
import type { ListaPreCadastros } from "../../../../shared/types/PreCadastro";
import { validarStatusDaLista } from "../../../../shared/utils/preCadastroAprovacao";
import { exigirAdministradorNosCadastros } from "../../../utils/cadastroAcesso";
import { listarPreCadastros } from "../../../utils/preCadastroDecisao";

// Lista os pré-cadastros de medicamento (`?status=pendente|aprovado|rejeitado`, padrão pendente), do pedido mais antigo para o mais novo, com a
// contagem. O middleware deixa TODOS os cargos lerem /api/cadastros (config, leitura aberta), mas esta lista é de quem decide: só o
// administrador (a mesma regra de escrever nos Cadastros). 400 se o status for desconhecido.
export default defineEventHandler(async (event): Promise<ListaPreCadastros> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);

  const status = validarStatusDaLista(getQuery(event).status);
  if (!status.ok) throw createError({ statusCode: 400, statusMessage: status.erro });
  return await listarPreCadastros(status.valor);
});
