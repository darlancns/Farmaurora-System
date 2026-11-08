import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getProcesso, patchProcesso, patchProcessoVersionado } from "../../utils/processosStore";
import {
  ciaAereaCanonica,
  erroModalCiaNoPatch,
  erroNumeroPo,
  erroNumeroRemessa,
  isValidProcessoPatch,
  isVersaoValida,
  MENSAGEM_VERSAO_AUSENTE,
  numeroPoCanonico,
  numeroRemessaCanonico,
  patchExigeVersao,
  patchTocaModalOuCia,
} from "../../utils/processoValidation";
import { normalizarNumeroOrdem } from "../../../shared/utils/numeroOrdem";
import { assertPodeResolverMandado, patchTocaAlertaMandado } from "../../utils/processoMandadoAuth";
import { avisarConsultorDeItensNovos } from "../../utils/notificacoesProcesso";
import type { AuthUser } from "../../../shared/types/auth";
import type { Processo, ProcessoPatchDTO } from "../../../shared/types/processo";

export default defineEventHandler(async (event): Promise<Processo> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidProcessoPatch(body)) {
    // Listas (atualizações, pendências, medicamentos) sem a versão: mensagem própria (o cliente sempre a envia;
    // faltar = aba antiga, aberta antes desta conferência existir).
    const semVersao = patchExigeVersao(body) && !isVersaoValida((body as Record<string, unknown>).versao);
    throw createError({
      statusCode: 400,
      statusMessage: semVersao ? MENSAGEM_VERSAO_AUSENTE : "Dados do processo inválidos.",
    });
  }

  // Resolver o alerta de Mandado de Segurança só vale pro administrador e pro operacional
  // responsável DAQUELA linha — por isso lê a linha antes de gravar. Os demais campos do PATCH
  // não passam por esta checagem (o middleware já controlou a seção/método).
  // A linha armazenada só é lida quando alguma checagem abaixo precisa dela (uma leitura, reaproveitada).
  let armazenado: Processo | null | undefined;
  async function linhaArmazenada(): Promise<Processo> {
    if (armazenado === undefined) armazenado = await getProcesso(id!);
    if (!armazenado) {
      throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
    }
    return armazenado;
  }

  // Nº Ordem no patch (preenchido) precisa estar no formato PO-00-0000 (+ / e números; incompleto vale). Vazio/null
  // limpa; sem a chave, nada é conferido. Só valida se o valor MUDOU: um valor já gravado fora da regra (de antes
  // dela) reenviado igual não impede salvar os outros campos. A linha só é lida quando o formato falha.
  const erroPo = erroNumeroPo(body);
  if (erroPo) {
    const atual = await linhaArmazenada();
    const enviado = (body as Record<string, unknown>).numeroPo;
    const igualAoGravado =
      typeof enviado === "string" && numeroPoCanonico(enviado) === (normalizarNumeroOrdem(atual.numeroPo) ?? null);
    if (!igualAoGravado) {
      throw createError({ statusCode: 400, statusMessage: erroPo });
    }
  }

  // Nº Remessa inválido (não inteiro, negativo, texto, acima de 2147483647) = 400. Ausente não confere; null/"" = 1.
  const erroRemessa = erroNumeroRemessa(body);
  if (erroRemessa) {
    throw createError({ statusCode: 400, statusMessage: erroRemessa });
  }

  if (patchTocaAlertaMandado(body as Record<string, unknown>)) {
    const atual = await linhaArmazenada();
    const user: AuthUser | null = event.context.user;
    assertPodeResolverMandado(user, atual.responsavelOperacional);
  }

  // Cia. aérea × modal: só confere se o patch toca modal ou cia (ver erroModalCiaNoPatch). Um patch que
  // não mexe nos dois nunca valida a cia — dado antigo inconsistente não impede editar outros campos.
  if (patchTocaModalOuCia(body)) {
    const atual = await linhaArmazenada();
    const erroCia = erroModalCiaNoPatch(body, { modalEnvio: atual.modalEnvio, companhiaAerea: atual.companhiaAerea });
    if (erroCia) {
      throw createError({ statusCode: 400, statusMessage: erroCia });
    }
  }

  // `versao` e `parcial` não são colunas: saem do patch antes de gravar.
  const { versao, parcial, ...patch } = body as ProcessoPatchDTO & { versao?: string };

  // Grava o valor canônico da cia (sem espaços nas pontas; vazia = null).
  if ("companhiaAerea" in patch) patch.companhiaAerea = ciaAereaCanonica(patch.companhiaAerea);

  // Grava o Nº Ordem normalizado (maiúsculas, sem "/" final sem dígitos; vazio = null).
  if ("numeroPo" in patch) patch.numeroPo = numeroPoCanonico(patch.numeroPo);

  // Nº Remessa: inteiro >= 1 (null ou "" = 1). Sem a chave, a coluna não é tocada.
  if ("numeroRemessa" in patch) {
    const remessa = numeroRemessaCanonico(patch.numeroRemessa);
    if (remessa === undefined) delete patch.numeroRemessa;
    else patch.numeroRemessa = remessa;
  }

  // `ordem` (campo antigo; a coluna está congelada) pode chegar de uma aba antiga: ignorado, sem erro e sem gravar.
  delete (patch as Record<string, unknown>).ordem;

  // Aviso ao consultor: só quando o patch mexe em pendências/atualizações. Lê a linha ANTES de gravar (a de
  // depois vem da gravação) para saber o que é novo. Se essa leitura falhar, a gravação segue sem aviso.
  const mexeEmItens = patch.pendencias !== undefined || patch.atualizacoes !== undefined;
  let antes: Processo | null = null;
  if (mexeEmItens) {
    try {
      if (armazenado === undefined) armazenado = await getProcesso(id);
      antes = armazenado;
    } catch (e) {
      console.error(`[notificacoes] não foi possível ler o processo ${id} antes de gravar:`, e);
    }
  }
  const user: AuthUser | null | undefined = event.context?.user;
  async function avisarConsultor(depois: Processo): Promise<void> {
    if (!antes) return;
    await avisarConsultorDeItensNovos({
      processo: depois,
      pendenciasAntes: patch.pendencias !== undefined ? antes.pendencias : undefined,
      atualizacoesAntes: patch.atualizacoes !== undefined ? antes.atualizacoes : undefined,
      atorId: user?.id ?? null,
    });
  }

  // Com `atualizacoes`, `pendencias` ou `medicamentos`: grava só se o updated_at da linha ainda for a versão que
  // o cliente viu. `parcial` segue junto (senão datas/transportadora ausentes virariam NULL).
  if (patchExigeVersao(body) && versao !== undefined) {
    const resultado = await patchProcessoVersionado(id, patch, versao, { parcial: parcial === true });
    if (resultado.tipo === "nao_encontrado") {
      throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
    }
    if (resultado.tipo === "versao_desatualizada") {
      throw createError({
        statusCode: 409,
        statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo.",
      });
    }
    await avisarConsultor(resultado.processo);
    return resultado.processo;
  }

  // Formato antigo (sem `parcial`): a chamada é exatamente a de sempre.
  const updated = parcial === true ? await patchProcesso(id, patch, { parcial: true }) : await patchProcesso(id, patch);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  await avisarConsultor(updated);
  return updated;
});
