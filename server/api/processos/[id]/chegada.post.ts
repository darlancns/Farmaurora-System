import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, gravarChegadaProcesso } from "../../../utils/processosStore";
import { lerPedidoChegada } from "../../../utils/chegadaValidation";
import { avisarConsultorDeItensNovos } from "../../../utils/notificacoesProcesso";
import { LIMITE_ATUALIZACOES_POR_PROCESSO } from "../../../../shared/constants/processos";
import {
  dataDaAtualizacaoChegada,
  interpretarDataChegadaPrevista,
  podeResponderAvisoChegada,
  textoChegadaAdiada,
  textoChegadaConfirmada,
} from "../../../../shared/utils/avisoChegada";
import { formatarDataCurta, hojeBrasilia } from "../../../../shared/utils/dataBrasilia";
import type { AuthUser } from "../../../../shared/types/auth";
import type { AtualizacaoProcesso, Processo, ProcessoPatchDTO } from "../../../../shared/types/processo";

/**
 * Resposta ao aviso "chegou?" do sino: SÓ o operacional responsável pelo processo (primeiro nome da conta =
 * responsavel_operacional da linha) responde — administrador, sócio, consultor e outros operacionais recebem 403.
 * O administrador só visualiza o aviso (olhinho, ver /api/chegada-avisos/visto).
 *
 *  - { acao: "confirmar" }: status em_transito -> desembaraco + UMA atualização "Chegada confirmada em DD/MM.".
 *  - { acao: "adiar", novaData }: data_chegada_brasil = novaData + UMA atualização
 *    "Chegada adiada de {antiga} para {nova}.". A atualização não leva nome de ninguém (o formato da
 *    timeline, { data, texto }, nem tem campo de autor).
 *
 * Pré-condição: status = em_transito (senão 409). Mudança e atualização vão num ÚNICO UPDATE condicional
 * (ver gravarChegadaProcesso).
 */
export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const user: AuthUser | null | undefined = event.context.user;
  const naoPode = () =>
    createError({
      statusCode: 403,
      statusMessage: "Apenas o operacional responsável por este processo pode responder ao aviso de chegada.",
    });
  // Cargo errado: nem lê o processo.
  if (!user || user.role !== "operacional") throw naoPode();

  const atual = await getProcesso(id);
  if (!atual) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }
  if (!podeResponderAvisoChegada({ role: user.role, nome: user.nome }, atual.responsavelOperacional)) throw naoPode();

  const agora = new Date();
  const pedido = lerPedidoChegada(await readBody(event), agora);

  // Lista de atualizações como estava na leitura da tentativa que gravou (a última chamada de `montar`).
  let atualizacoesAntes: AtualizacaoProcesso[] = atual.atualizacoes;
  const resultado = await gravarChegadaProcesso(id, (lido): ProcessoPatchDTO => {
    atualizacoesAntes = lido.atualizacoes;
    if (lido.atualizacoes.length >= LIMITE_ATUALIZACOES_POR_PROCESSO) {
      throw createError({
        statusCode: 409,
        statusMessage: "Este processo atingiu o limite de atualizações. Remova alguma antes de responder.",
      });
    }
    const hojeISO = hojeBrasilia(agora);
    const data = dataDaAtualizacaoChegada(agora);
    const comAtualizacao = (texto: string): AtualizacaoProcesso[] => [...lido.atualizacoes, { data, texto }];

    if (pedido.acao === "confirmar") {
      return { status: "desembaraco", atualizacoes: comAtualizacao(textoChegadaConfirmada(agora)) };
    }

    const novaData = formatarDataCurta(pedido.novaDataISO, hojeISO); // DD/MM no ano corrente, DD/MM/AAAA em outro
    const antigaISO = interpretarDataChegadaPrevista(lido.datas.dataChegadaBrasil, agora);
    const antiga = antigaISO ? formatarDataCurta(antigaISO, hojeISO) : null;
    return { datas: { dataChegadaBrasil: novaData }, atualizacoes: comAtualizacao(textoChegadaAdiada(antiga, novaData)) };
  });

  if (resultado.tipo === "nao_encontrado") {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }
  if (resultado.tipo === "status_mudou") {
    throw createError({ statusCode: 409, statusMessage: "Este processo já foi atualizado." });
  }
  if (resultado.tipo === "conflito") {
    throw createError({
      statusCode: 409,
      statusMessage: "Este processo foi alterado por outra pessoa. Tente de novo.",
    });
  }

  // "Chegada confirmada…" / "Chegada adiada…" é uma atualização nova: avisa o consultor do processo. Falha do
  // aviso não desfaz a resposta já gravada.
  await avisarConsultorDeItensNovos({
    processo: resultado.processo,
    atualizacoesAntes,
    atorId: user.id,
  });
  return resultado.processo;
});
