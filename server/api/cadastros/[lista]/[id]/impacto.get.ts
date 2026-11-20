import { defineEventHandler, getRouterParam, createError } from "h3";
import { exigirAdministradorNosCadastros, listaDaRota } from "../../../../utils/cadastroAcesso";
import { contarImpactoConsultor } from "../../../../utils/cadastrosStore";
import { contarContasDoConsultor } from "../../../../utils/consultorContas";
import type { ImpactoRenomearConsultor } from "../../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../../shared/types/auth";

// SÓ LEITURA. Quantos registros o renomear do consultor vai atualizar: processos (Follow-Up), prestações, POs da DIR, compras e contas de
// login com o nome atual. A tela mostra isto na confirmação ANTES de salvar. Só o administrador; só a lista de consultores.
// Nunca devolve nem registra dados de pacientes: só números e o nome do consultor.
export default defineEventHandler(async (event): Promise<ImpactoRenomearConsultor> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);
  if (listaDaRota(event) !== "consultores") {
    throw createError({ statusCode: 404, statusMessage: "Lista de cadastro não encontrada." });
  }

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  const impacto = await contarImpactoConsultor(id);
  if (!impacto) throw createError({ statusCode: 404, statusMessage: "Item não encontrado." });

  return { ...impacto, contas: await contarContasDoConsultor(impacto.nome) };
});
