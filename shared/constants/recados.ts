import type { DestinatarioTipo, TipoRecado } from "../types/recado";

export const TIPOS_RECADO: readonly TipoRecado[] = ["urgente", "atencao", "informacao", "geral"];

export const DESTINATARIO_TIPOS: readonly DestinatarioTipo[] = ["publico", "cargo", "pessoa"];

export const TIPO_RECADO_LABEL: Record<TipoRecado, string> = {
  urgente: "Urgente",
  atencao: "Atenção",
  informacao: "Informação",
  geral: "Geral",
};

export const DESTINATARIO_TIPO_LABEL: Record<DestinatarioTipo, string> = {
  publico: "Público",
  cargo: "Cargo",
  pessoa: "Pessoa específica",
};
