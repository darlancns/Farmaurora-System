import type { TipoRecado } from "./recado";

/**
 * Lembrete pessoal (aba "Meus" de Recados) — sempre privado ao próprio
 * usuario_id, sem destinatário nem notificação (ver docs/recados-spec.md
 * seção 8). `fixado`/`concluido` são colunas próprias aqui (diferente de
 * Recado, que usa tabelas de junção) porque já são individuais por natureza.
 */
export interface LembretePessoal {
  id: string;
  usuarioId: string;
  titulo: string;
  mensagem: string;
  tipo: TipoRecado;
  fixado: boolean;
  concluido: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewLembreteDTO = Pick<LembretePessoal, "titulo" | "mensagem" | "tipo">;

export type LembreteUpdateDTO = Partial<
  Pick<LembretePessoal, "titulo" | "mensagem" | "tipo" | "fixado" | "concluido">
>;
