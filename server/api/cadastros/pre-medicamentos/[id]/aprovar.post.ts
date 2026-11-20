import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import type { AuthUser } from "../../../../../shared/types/auth";
import type { RespostaDecisaoPreCadastro } from "../../../../../shared/types/PreCadastro";
import { exigirAdministradorNosCadastros } from "../../../../utils/cadastroAcesso";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../../utils/dirAuditoria";
import { responderErroDeCompra } from "../../../../utils/comprasStore";
import { aprovarPreCadastro } from "../../../../utils/preCadastroDecisao";

// Aprova um pré-cadastro de medicamento: `{ nome?, temperatura?, vincularExistente? }` (tudo opcional). Cria o medicamento no Cadastro, liga os itens
// das compras e marca aprovado; com `vincularExistente: true` usa o medicamento que já existe (sem criar linha). Só o administrador.
// 404 não existe; 409 `medicamento_ja_cadastrado` (data.existente) ou `medicamento_inativo`; 409 `pre_cadastro_ja_decidido` (data.status);
// 422 dados inválidos (mesmas regras do cadastro de medicamento). Sucesso: `{ preCadastro, itens, compras, medicamentoCriado }`.
export default defineEventHandler(async (event): Promise<RespostaDecisaoPreCadastro> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  try {
    return await aprovarPreCadastro(id, await readBody(event), nomeParaAuditoria(user));
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
