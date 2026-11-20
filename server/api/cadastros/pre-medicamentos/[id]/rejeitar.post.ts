import { defineEventHandler, getRouterParam, createError } from "h3";
import type { AuthUser } from "../../../../../shared/types/auth";
import type { RespostaDecisaoPreCadastro } from "../../../../../shared/types/PreCadastro";
import { exigirAdministradorNosCadastros } from "../../../../utils/cadastroAcesso";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../../utils/dirAuditoria";
import { responderErroDeCompra } from "../../../../utils/comprasStore";
import { rejeitarPreCadastro } from "../../../../utils/preCadastroDecisao";

// Rejeita um pré-cadastro de medicamento (sem corpo). NUNCA apaga a linha: marca `rejeitado` com quem decidiu e quando; os itens das compras
// seguem com o nome digitado. Só o administrador. 404 não existe; 409 `pre_cadastro_ja_decidido` (data.status).
export default defineEventHandler(async (event): Promise<RespostaDecisaoPreCadastro> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  try {
    return await rejeitarPreCadastro(id, nomeParaAuditoria(user));
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
