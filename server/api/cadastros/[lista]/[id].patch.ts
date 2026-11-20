import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { exigirAdministradorNosCadastros, listaDaRota } from "../../../utils/cadastroAcesso";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../../utils/dirAuditoria";
import { alterarCadastro, alterarConsultor, responderErroDeRegra } from "../../../utils/cadastrosStore";
import { sincronizarContasDoConsultor } from "../../../utils/consultorContas";
import { esquecerConsultorEmCache } from "../../../utils/consultoresCadastro";
import { validarPatchCadastro } from "../../../../shared/utils/cadastroValidacao";
import type { Cadastro, ConsultorAtualizado, ConsultorPatchDTO } from "../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../shared/types/auth";

// Altera um item (país, prazo/sem alerta, contato, telefone, e-mail, chave PIX, ativo). Só o administrador. Desativar e reativar
// são `{ ativo: false | true }` — NÃO existe rota de exclusão. O NOME não muda depois de criado: 422 — EXCETO nos consultores, que
// podem ser renomeados: a função SQL renomear_consultor propaga o texto (follow_up, prestacao_pacientes e dir) numa transação e
// depois as contas de login são atualizadas (as que falharem voltam em `renomeacao.contas.falhas`; a tela permite tentar de novo).
export default defineEventHandler(async (event): Promise<Cadastro | ConsultorAtualizado> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirAdministradorNosCadastros(user);
  const lista = listaDaRota(event);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "ID não informado." });

  const dados = validarPatchCadastro(lista, await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  if (lista === "consultores") {
    try {
      const { consultor, renomeacao } = await alterarConsultor(id, dados.valor as ConsultorPatchDTO, nomeParaAuditoria(user));
      if (!consultor) throw createError({ statusCode: 404, statusMessage: "Item não encontrado." });
      if (!renomeacao) return consultor;

      // O nome antigo deixa de existir: este processo para de aceitá-lo na hora (o cache de acertos vale 30 s).
      esquecerConsultorEmCache(renomeacao.nomeAntigo);
      const contas = await sincronizarContasDoConsultor(renomeacao.nomeAntigo, consultor.nome);
      return {
        ...consultor,
        renomeacao: {
          nomeAntigo: renomeacao.nomeAntigo,
          processos: renomeacao.followUp,
          pacientes: renomeacao.prestacao,
          dir: renomeacao.dir,
          compras: renomeacao.compras,
          contas,
        },
      };
    } catch (e) {
      return responderErroDeRegra(e);
    }
  }

  let atualizado: Cadastro | null;
  try {
    // Só o administrador chega aqui, e ele recebe a chave PIX de volta (incluirPix).
    atualizado = await alterarCadastro(lista, id, dados.valor, nomeParaAuditoria(user), { incluirPix: true });
  } catch (e) {
    return responderErroDeRegra(e);
  }

  if (!atualizado) throw createError({ statusCode: 404, statusMessage: "Item não encontrado." });
  return atualizado;
});
