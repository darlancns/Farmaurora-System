import { defineEventHandler, readBody, createError } from "h3";
import { createProcesso } from "../../utils/processosStore";
import {
  ciaAereaCanonica,
  erroCamposMedicamento,
  erroModalCiaNoPost,
  erroNumeroPo,
  erroNumeroRemessa,
  erroDatasIso,
  erroIdProcesso,
  erroStatusLegado,
  isValidProcessoPayload,
  medicamentosCanonicos,
  numeroPoCanonico,
  numeroRemessaCanonico,
  pastaCanonica,
} from "../../utils/processoValidation";
import { avisarConsultorDeItensNovos } from "../../utils/notificacoesProcesso";
import { NUMERO_REMESSA_PADRAO } from "../../../shared/utils/numeroRemessa";
import type { AuthUser } from "../../../shared/types/auth";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const body = await readBody(event);

  // Status que saiu do app (aguardando_inicio, liberado_parcial, outro): 400 com mensagem própria.
  const erroStatus = erroStatusLegado(body);
  if (erroStatus) {
    throw createError({ statusCode: 400, statusMessage: erroStatus });
  }

  // Laboratório longo demais ou Brand fora da lista em algum medicamento: 400 com mensagem própria.
  const erroMedicamento = erroCamposMedicamento(body);
  if (erroMedicamento) {
    throw createError({ statusCode: 400, statusMessage: erroMedicamento });
  }

  // MS Anexado em / Prazo da ANVISA (colunas `date`): só AAAA-MM-DD real; vazio = NULL. 400 aqui, nunca 500 do banco.
  const erroDatas = erroDatasIso(body);
  if (erroDatas) {
    throw createError({ statusCode: 400, statusMessage: erroDatas });
  }

  // `id` opcional (gerado pelo formulário ao abrir): só o formato proc_<uuid>; qualquer outro valor = 400.
  const erroId = erroIdProcesso(body);
  if (erroId) {
    throw createError({ statusCode: 400, statusMessage: erroId });
  }

  if (!isValidProcessoPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do processo inválidos ou incompletos.",
    });
  }

  // Cia. aérea preenchida exige modal preenchido e compatível com ela.
  const erroCia = erroModalCiaNoPost(body);
  if (erroCia) {
    throw createError({ statusCode: 400, statusMessage: erroCia });
  }

  // PO preenchido precisa ser o PO completo no formato da DIR, PO26-10-0471 (incompleto é recusado).
  const erroPo = erroNumeroPo(body);
  if (erroPo) {
    throw createError({ statusCode: 400, statusMessage: erroPo });
  }

  // Nº Remessa: inteiro >= 1; ausente, null ou vazio = 1.
  const erroRemessa = erroNumeroRemessa(body);
  if (erroRemessa) {
    throw createError({ statusCode: 400, statusMessage: erroRemessa });
  }

  // Pasta opcional: sempre gravada (sem espaços nas pontas; ausente ou vazia = ""), nunca null.
  const pasta = pastaCanonica(body.pasta) ?? "";

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = sem cia), do PO (normalizado;
  // vazio = sem PO, a coluna nem entra no insert) e do Nº Remessa (sempre presente). `ordem` (campo
  // antigo, coluna congelada) pode chegar de uma aba antiga: é descartado sem erro e nunca gravado.
  const cia = ciaAereaCanonica(body.companhiaAerea);
  const po = numeroPoCanonico(body.numeroPo);
  const numeroRemessa = numeroRemessaCanonico(body.numeroRemessa) ?? NUMERO_REMESSA_PADRAO;
  const {
    companhiaAerea: _bruta,
    numeroPo: _poBruto,
    numeroRemessa: _remessaBruta,
    ordem: _ordemLegada,
    ...resto
  } = body as typeof body & { ordem?: unknown };
  const criado = await createProcesso({
    ...resto,
    // Laboratório normalizado (cada palavra com maiúscula) e Brand ("" quando ausente) em todo item.
    medicamentos: medicamentosCanonicos(resto.medicamentos),
    pasta,
    numeroRemessa,
    ...(cia ? { companhiaAerea: cia } : {}),
    ...(po ? { numeroPo: po } : {}),
  });

  // Pendências e atualizações iniciais são todas novas (lista de antes vazia): avisa o consultor do processo,
  // exceto se foi ele mesmo quem criou. Falha do aviso não desfaz o processo criado. Só chega aqui depois do INSERT
  // bem-sucedido: um 2º POST com o mesmo id (409 em createProcesso) nunca avisa de novo.
  const user: AuthUser | null | undefined = event.context?.user;
  await avisarConsultorDeItensNovos({
    processo: criado,
    pendenciasAntes: [],
    atualizacoesAntes: [],
    atorId: user?.id ?? null,
  });

  return criado;
});
