import type { Notificacao, TipoNotificacao } from "#shared/types/notificacao";

// Quais notificações da tabela `notificacoes` entram em cada seção do sino global. Os conjuntos são
// DISJUNTOS: cada tipo pertence a exatamente uma seção, então o badge nunca conta nada duas vezes.
// (Fornecedor e Mandado não vêm daqui — são calculados a partir de Processo[].)
export const TIPOS_DE_RECADO: readonly TipoNotificacao[] = ["recado_novo", "recado_concluido"];
export const TIPOS_DE_CONTA: readonly TipoNotificacao[] = ["conta_editada"];
export const TIPOS_DE_PROCESSO: readonly TipoNotificacao[] = ["pendencia_nova", "atualizacao_nova"];

function naoLidasDoTipo(notificacoes: readonly Notificacao[], tipos: readonly TipoNotificacao[]): Notificacao[] {
  return notificacoes.filter((n) => !n.lida && tipos.includes(n.tipo));
}

/** Seção "Recados": só recado_novo e recado_concluido, não lidas. */
export function naoLidasDeRecados(notificacoes: readonly Notificacao[]): Notificacao[] {
  return naoLidasDoTipo(notificacoes, TIPOS_DE_RECADO);
}

/** Seção "Contas": só conta_editada, não lidas. */
export function naoLidasDeContas(notificacoes: readonly Notificacao[]): Notificacao[] {
  return naoLidasDoTipo(notificacoes, TIPOS_DE_CONTA);
}

/** Seção "Processos": pendencia_nova e atualizacao_nova (avisos ao consultor), não lidas. */
export function naoLidasDeProcessos(notificacoes: readonly Notificacao[]): Notificacao[] {
  return naoLidasDoTipo(notificacoes, TIPOS_DE_PROCESSO);
}

export interface ContagensDoSino {
  fornecedor: number;
  mandado: number;
  // Aviso "chegou?" (derivado de Processo[], como Fornecedor e Mandado). Operacional: a pergunta; administrador: o olhinho.
  chegada: number;
  recados: number;
  contas: number;
  // Nova pendência / nova atualização num processo do consultor (tabela `notificacoes`).
  processos: number;
}

/** Badge do sino: soma das 6 seções, cada item contado uma única vez. */
export function totalDoBadgeSino(c: ContagensDoSino): number {
  return c.fornecedor + c.mandado + c.chegada + c.recados + c.contas + c.processos;
}
