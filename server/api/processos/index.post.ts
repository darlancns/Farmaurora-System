import { defineEventHandler, readBody, createError } from "h3";
import { createProcesso } from "../../utils/processosStore";
import {
  ciaAereaCanonica,
  erroModalCiaNoPost,
  erroNumeroPo,
  erroNumeroRemessa,
  isValidProcessoPayload,
  numeroPoCanonico,
  numeroRemessaCanonico,
} from "../../utils/processoValidation";
import { avisarConsultorDeItensNovos } from "../../utils/notificacoesProcesso";
import { NUMERO_REMESSA_PADRAO } from "../../../shared/utils/numeroRemessa";
import type { AuthUser } from "../../../shared/types/auth";
import type { Processo } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const body = await readBody(event);

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

  // Nº Ordem preenchido precisa estar no formato PO-00-0000 (+ / e números; incompleto vale).
  const erroPo = erroNumeroPo(body);
  if (erroPo) {
    throw createError({ statusCode: 400, statusMessage: erroPo });
  }

  // Nº Remessa: inteiro >= 1; ausente, null ou vazio = 1.
  const erroRemessa = erroNumeroRemessa(body);
  if (erroRemessa) {
    throw createError({ statusCode: 400, statusMessage: erroRemessa });
  }

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = sem cia), do Nº Ordem (normalizado;
  // vazio = sem Nº Ordem, a coluna nem entra no insert) e do Nº Remessa (sempre presente). `ordem` (campo
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
    numeroRemessa,
    ...(cia ? { companhiaAerea: cia } : {}),
    ...(po ? { numeroPo: po } : {}),
  });

  // Pendências e atualizações iniciais são todas novas (lista de antes vazia): avisa o consultor do processo,
  // exceto se foi ele mesmo quem criou. Falha do aviso não desfaz o processo criado.
  const user: AuthUser | null | undefined = event.context?.user;
  await avisarConsultorDeItensNovos({
    processo: criado,
    pendenciasAntes: [],
    atualizacoesAntes: [],
    atorId: user?.id ?? null,
  });

  return criado;
});
