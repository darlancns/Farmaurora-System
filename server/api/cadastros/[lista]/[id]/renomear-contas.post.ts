import { defineEventHandler, getRouterParam, readBody, createError } from "h3";
import { exigirAdministradorNosCadastros, listaDaRota } from "../../../../utils/cadastroAcesso";
import { buscarConsultor, existeOutroConsultorComNome } from "../../../../utils/cadastrosStore";
import { sincronizarContasDoConsultor } from "../../../../utils/consultorContas";
import { esquecerConsultorEmCache } from "../../../../utils/consultoresCadastro";
import type { ResultadoContasConsultor } from "../../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../../shared/types/auth";

// "Tentar de novo" do renomear: atualiza `app_metadata.consultorNome` das contas que ainda têm o NOME ANTIGO para o nome atual do
// consultor `id`. IDEMPOTENTE (só mexe em quem ainda tem o nome antigo; rodar de novo não faz nada de mais). Só o administrador; só
// a lista de consultores. 409 se o nome antigo já é de OUTRO consultor (não se joga conta alheia para este).
export default defineEventHandler(async (event): Promise<ResultadoContasConsultor> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);
  if (listaDaRota(event) !== "consultores") {
    throw createError({ statusCode: 404, statusMessage: "Lista de cadastro não encontrada." });
  }

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  const corpo = (await readBody(event)) as { nomeAntigo?: unknown } | null;
  const nomeAntigo = typeof corpo?.nomeAntigo === "string" ? corpo.nomeAntigo.trim() : "";
  if (nomeAntigo === "") throw createError({ statusCode: 400, statusMessage: "Informe o nome antigo do consultor." });

  const consultor = await buscarConsultor(id);
  if (!consultor) throw createError({ statusCode: 404, statusMessage: "Item não encontrado." });
  if (await existeOutroConsultorComNome(nomeAntigo, id)) {
    throw createError({ statusCode: 409, statusMessage: "Esse nome antigo já pertence a outro consultor." });
  }

  esquecerConsultorEmCache(nomeAntigo);
  return await sincronizarContasDoConsultor(nomeAntigo, consultor.nome);
});
