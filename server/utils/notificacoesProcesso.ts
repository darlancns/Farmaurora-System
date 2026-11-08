import { createSupabaseAdminClient } from "./supabaseServerClient";
import { listAllAuthUsers, toAdminUserSummary } from "./authUser";
import { inserirNotificacoes, type NovaNotificacao } from "./notificacoesStore";
import { novasAtualizacoes, novasPendencias } from "#shared/utils/novosItensProcesso";
import type { AtualizacaoProcesso, Processo } from "#shared/types/processo";

/**
 * Aviso ao CONSULTOR (sino) quando entra uma pendência ou uma atualização NOVA num processo dele.
 *
 * Só dispara pelo que ENTRA (ver shared/utils/novosItensProcesso.ts): editar ou apagar um item não avisa.
 * Destinatário = contas de cargo consultor cujo `app_metadata.consultorNome` é IGUAL a `processo.consultor`
 * — a mesma comparação exata de server/utils/processoEscopo.ts (os dois valores vêm da lista fechada
 * CONSULTORES_PROCESSO; não existe outra normalização). Quem gravou nunca é avisado. Sem conta, não grava nada.
 */

export const LIMITE_AVISOS_POR_TIPO = 5;
export const LIMITE_TEXTO_AVISO = 140;

type TipoAvisoProcesso = "pendencia_nova" | "atualizacao_nova";

export interface AvisoProcesso {
  tipo: TipoAvisoProcesso;
  mensagem: string;
}

/** Uma linha só (quebras viram espaço) e no máximo 140 caracteres; passou disso, corta e põe reticências. */
export function cortarTextoAviso(texto: string): string {
  const linha = texto.replace(/\s+/g, " ").trim();
  return linha.length > LIMITE_TEXTO_AVISO ? `${linha.slice(0, LIMITE_TEXTO_AVISO)}…` : linha;
}

function avisosDoTipo(
  tipo: TipoAvisoProcesso,
  textos: readonly string[],
  rotuloUnico: string,
  rotuloPlural: string,
  quando: string,
): AvisoProcesso[] {
  if (textos.length === 0) return [];
  // Mais de 5 do mesmo tipo numa gravação: UM aviso agrupado em vez de uma enxurrada.
  if (textos.length > LIMITE_AVISOS_POR_TIPO) {
    return [{ tipo, mensagem: `${textos.length} ${rotuloPlural} · ${quando}` }];
  }
  return textos.map((texto) => ({ tipo, mensagem: `${rotuloUnico} · ${quando}: ${cortarTextoAviso(texto)}` }));
}

/**
 * Textos prontos dos avisos de uma gravação. Pendência: "Nova pendência · {paciente} ({pasta}): {texto}";
 * atualização: "Nova atualização · {paciente} ({pasta}): {texto}"; agrupado (mais de 5 do mesmo tipo):
 * "{n} novas pendências · {paciente} ({pasta})" / "{n} novas atualizações · ...".
 */
export function montarAvisosItensNovos(
  processo: Pick<Processo, "paciente" | "pasta">,
  pendencias: readonly string[],
  atualizacoes: readonly AtualizacaoProcesso[],
): AvisoProcesso[] {
  const quando = `${processo.paciente} (${processo.pasta})`;
  return [
    ...avisosDoTipo("pendencia_nova", pendencias, "Nova pendência", "novas pendências", quando),
    ...avisosDoTipo(
      "atualizacao_nova",
      atualizacoes.map((a) => a.texto),
      "Nova atualização",
      "novas atualizações",
      quando,
    ),
  ];
}

export interface ItensNovosGravacao {
  /** O processo JÁ gravado (consultor, paciente e pasta do aviso saem dele). */
  processo: Processo;
  /** Lista de ANTES da gravação; `undefined` = a gravação não mexeu nesse campo (nada a comparar). */
  pendenciasAntes?: readonly string[];
  atualizacoesAntes?: readonly AtualizacaoProcesso[];
  /** Quem gravou (nunca é avisado). `null` = sem usuário. */
  atorId?: string | null;
}

/**
 * Cria os avisos de uma gravação. Devolve quantas linhas gravou. LANÇA se a leitura das contas ou o INSERT
 * falharem — quem chama pelo caminho de gravação do processo usa `avisarConsultorDeItensNovos`.
 */
export async function notificarConsultorDeItensNovos(entrada: ItensNovosGravacao): Promise<number> {
  const { processo, pendenciasAntes, atualizacoesAntes, atorId } = entrada;

  const pendencias = pendenciasAntes ? novasPendencias(pendenciasAntes, processo.pendencias) : [];
  const atualizacoes = atualizacoesAntes ? novasAtualizacoes(atualizacoesAntes, processo.atualizacoes) : [];
  const avisos = montarAvisosItensNovos(processo, pendencias, atualizacoes);
  if (avisos.length === 0) return 0;

  const contas = await listAllAuthUsers(createSupabaseAdminClient());
  const destinatarios = contas
    .map(toAdminUserSummary)
    .filter(
      (conta) =>
        conta.role === "consultor" &&
        conta.consultorNome !== undefined &&
        conta.consultorNome === processo.consultor &&
        conta.id !== atorId,
    )
    .map((conta) => conta.id);
  if (destinatarios.length === 0) return 0;

  const linhas: NovaNotificacao[] = destinatarios.flatMap((destinatarioId) =>
    avisos.map((aviso) => ({
      destinatarioId,
      tipo: aviso.tipo,
      recadoId: null,
      processoId: processo.id,
      mensagem: aviso.mensagem,
    })),
  );
  await inserirNotificacoes(linhas);
  return linhas.length;
}

/**
 * Versão para os handlers de gravação de processo: a falha do aviso NUNCA quebra nem desfaz a gravação —
 * o erro vai pro log do servidor e o fluxo segue com a resposta de sucesso.
 */
export async function avisarConsultorDeItensNovos(entrada: ItensNovosGravacao): Promise<void> {
  try {
    await notificarConsultorDeItensNovos(entrada);
  } catch (e) {
    console.error(`[notificacoes] falha ao avisar o consultor do processo ${entrada.processo.id}:`, e);
  }
}
