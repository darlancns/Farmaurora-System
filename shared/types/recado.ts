import type { Role } from "../utils/rbac";

export type TipoRecado = "urgente" | "atencao" | "informacao" | "geral";

export type DestinatarioTipo = "publico" | "cargo" | "pessoa";

/**
 * Recado do mural compartilhado (ver docs/recados-spec.md). `fixadoPorMim` e
 * `concluidoPorMim` são calculados por usuário (joins com `recados_fixados` /
 * `recados_concluidos`), não colunas da própria linha — ver
 * `server/utils/recadosStore.ts`.
 */
export interface Recado {
  id: string;
  autorId: string;
  titulo: string;
  mensagem: string;
  tipo: TipoRecado;
  destinatarioTipo: DestinatarioTipo;
  /** Presente só quando `destinatarioTipo === "cargo"`. */
  destinatarioCargo?: Role;
  /** Presente só quando `destinatarioTipo === "pessoa"`. */
  destinatarioPessoaId?: string;
  fixadoPorMim: boolean;
  concluidoPorMim: boolean;
  createdAt: string;
  updatedAt: string;
}

// autorId vem do usuário autenticado (event.context.user), nunca do body —
// mesmo shape usado pra criar e pra editar (edição substitui o recado
// inteiro, não faz merge parcial — ver server/utils/recadoValidation.ts).
export type NewRecadoDTO = Pick<
  Recado,
  "titulo" | "mensagem" | "tipo" | "destinatarioTipo" | "destinatarioCargo" | "destinatarioPessoaId"
>;

export type RecadoUpdateDTO = NewRecadoDTO;
