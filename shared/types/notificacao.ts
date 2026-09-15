// Tipos de notificação de Recados (ver docs/recados-spec.md seção 7). O sino
// de Fornecedor (Fase C) continua calculado on-the-fly, sem linha gravada
// aqui — "recado_editado" não existe como tipo à parte: edição reusa
// "recado_novo" porque as 3 mensagens (pessoa/cargo/público) são idênticas
// nos dois casos, só muda o evento que dispara.
export type TipoNotificacao = "recado_novo" | "recado_concluido";

export interface Notificacao {
  id: string;
  destinatarioId: string;
  tipo: TipoNotificacao;
  /** Ausente se o recado de origem já foi apagado (FK ON DELETE SET NULL). */
  recadoId?: string;
  mensagem: string;
  lida: boolean;
  createdAt: string;
}
