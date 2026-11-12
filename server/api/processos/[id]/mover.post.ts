import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, patchProcessoVersionado } from "../../../utils/processosStore";
import { lerPedidoMover } from "../../../utils/processoMover";
import { avisarConsultorDeItensNovos } from "../../../utils/notificacoesProcesso";
import { LIMITE_ATUALIZACOES_POR_PROCESSO, STATUS_PROCESSO_LABELS } from "../../../../shared/constants/processos";
import { podeEscrever } from "../../../../shared/utils/permissoesPagina";
import { dataDaAtualizacaoStatus, textoStatusAlterado } from "../../../../shared/utils/moverStatus";
import type { AuthUser } from "../../../../shared/types/auth";
import type { Processo } from "../../../../shared/types/processo";

/**
 * Muda o status do processo (mudança de coluna no Kanban). Mesma autorização do PATCH: o middleware já exige escrita
 * em "processos" (POST em /api/processos/**); a checagem abaixo repete a regra como defesa (consultor e conta
 * só-leitura recebem 403).
 *
 * Corpo: { status, versao }.
 *  - status: um dos 5 e DIFERENTE do atual (senão 400; status legado tem mensagem própria);
 *  - versao: o updatedAt que o cliente viu, obrigatória. Linha alterada desde então = 409 e NADA é gravado.
 *
 * UM único UPDATE condicional (WHERE id = ? AND updated_at = versao) grava o status novo E acrescenta à timeline
 * "Status alterado de {antigo} para {novo} em DD/MM." (Brasília, sem nome de ninguém). Não toca em status_outro.
 * Em trânsito → Desembaraço por aqui NÃO é o "Chegou?": não usa o texto "Chegada confirmada" nem mexe no aviso.
 * A atualização nova avisa o consultor do processo (falha do aviso só é registrada no log).
 * Responde com o processo atualizado.
 */
export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const user: AuthUser | null | undefined = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Não autenticado." });
  }
  if (!podeEscrever(user, "processos")) {
    throw createError({ statusCode: 403, statusMessage: "Sem permissão para esta operação." });
  }

  const pedido = lerPedidoMover(await readBody(event));

  const atual = await getProcesso(id);
  if (!atual) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }
  if (atual.updatedAt !== pedido.versao) {
    throw createError({
      statusCode: 409,
      statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo.",
    });
  }
  if (atual.status === pedido.status) {
    throw createError({
      statusCode: 400,
      statusMessage: `O processo já está em ${STATUS_PROCESSO_LABELS[pedido.status]}.`,
    });
  }
  if (atual.atualizacoes.length >= LIMITE_ATUALIZACOES_POR_PROCESSO) {
    throw createError({
      statusCode: 409,
      statusMessage: "Este processo atingiu o limite de atualizações. Remova alguma antes de mudar o status.",
    });
  }

  const agora = new Date();
  const atualizacoesAntes = atual.atualizacoes;
  const atualizacoes = [
    ...atualizacoesAntes,
    { data: dataDaAtualizacaoStatus(agora), texto: textoStatusAlterado(atual.status, pedido.status, agora) },
  ];

  // A lista de atualizações foi lida na MESMA versão que o cliente mandou: o UPDATE condicional por essa versão
  // garante que nada gravado entre a leitura e esta escrita se perde (senão 409).
  const resultado = await patchProcessoVersionado(id, { status: pedido.status, atualizacoes }, pedido.versao, {
    parcial: true,
  });
  if (resultado.tipo === "nao_encontrado") {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }
  if (resultado.tipo === "versao_desatualizada") {
    throw createError({
      statusCode: 409,
      statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo.",
    });
  }

  // Aviso ao consultor (item 10): a atualização nova é um item novo. avisarConsultorDeItensNovos já registra a falha
  // no log; o try/catch aqui é a garantia de que nenhuma falha de aviso desfaz a resposta já gravada.
  try {
    await avisarConsultorDeItensNovos({ processo: resultado.processo, atualizacoesAntes, atorId: user.id });
  } catch (e) {
    console.error(`[notificacoes] falha ao avisar o consultor do processo ${id} (mover):`, e);
  }
  return resultado.processo;
});
