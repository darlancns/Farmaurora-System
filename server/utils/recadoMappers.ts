import type { DestinatarioTipo, NewRecadoDTO, Recado, RecadoUpdateDTO, TipoRecado } from "#shared/types/recado";
import type { Role } from "#shared/utils/rbac";

// Mapeador puro linha (Supabase, tabela `recados`) ↔ modelo Recado — sem
// Supabase/rede, mesmo padrão de server/utils/processoMappers.ts.

export interface RecadoRow {
  id: string;
  autor_id: string;
  titulo: string;
  mensagem: string;
  tipo: TipoRecado;
  destinatario_tipo: DestinatarioTipo;
  destinatario_cargo: Role | null;
  destinatario_pessoa_id: string | null;
  created_at: string;
  updated_at: string;
}

// Colunas do INSERT/UPDATE a partir do DTO. `destinatario_cargo` e
// `destinatario_pessoa_id` só vão preenchidos quando `destinatarioTipo` bate
// com cada um — o outro sempre grava `null` (nunca fica valor órfão de uma
// edição anterior, mesmo padrão de roleAppMetadata pra consultorNome).
export function colunasDeRecadoDTO(input: NewRecadoDTO | RecadoUpdateDTO): Record<string, unknown> {
  return {
    titulo: input.titulo,
    mensagem: input.mensagem,
    tipo: input.tipo,
    destinatario_tipo: input.destinatarioTipo,
    destinatario_cargo: input.destinatarioTipo === "cargo" ? input.destinatarioCargo : null,
    destinatario_pessoa_id: input.destinatarioTipo === "pessoa" ? input.destinatarioPessoaId : null,
  };
}

// Linha do banco → objeto Recado. `fixadoPorMim`/`concluidoPorMim` não vêm da
// própria linha (são join com recados_fixados/recados_concluidos, calculados
// em recadosStore.ts) — aqui só recebem o valor já resolvido pelo chamador,
// default `false` quando o chamador não precisa desses campos (ex.: getRecado
// usado só pra checagem de dono, nunca exibido pro usuário).
export function montarRecado(row: RecadoRow, fixadoPorMim = false, concluidoPorMim = false): Recado {
  const recado: Recado = {
    id: row.id,
    autorId: row.autor_id,
    titulo: row.titulo,
    mensagem: row.mensagem,
    tipo: row.tipo,
    destinatarioTipo: row.destinatario_tipo,
    fixadoPorMim,
    concluidoPorMim,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.destinatario_cargo != null) recado.destinatarioCargo = row.destinatario_cargo;
  if (row.destinatario_pessoa_id != null) recado.destinatarioPessoaId = row.destinatario_pessoa_id;
  return recado;
}
