import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import type { LembretePessoal, LembreteUpdateDTO, NewLembreteDTO } from "#shared/types/lembretePessoal";
import type { TipoRecado } from "#shared/types/recado";

/**
 * Persistência de LembretePessoal — tabela `lembretes_pessoais`, sempre
 * escopada a `usuario_id` (nunca aparece pra mais ninguém — ver
 * docs/recados-spec.md seção 8). Update/delete filtram por `usuario_id` na
 * própria query: mexer no lembrete de outra conta dá 404 igual a "não
 * existe", nunca 403 — diferente de Recado (visível a outros, só não
 * editável), aqui o registro é opaco pra qualquer um que não seja o dono.
 */

const TABELA = "lembretes_pessoais";

interface LembreteRow {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string;
  tipo: TipoRecado;
  fixado: boolean;
  concluido: boolean;
  created_at: string;
  updated_at: string;
}

function montarLembrete(row: LembreteRow): LembretePessoal {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    titulo: row.titulo,
    mensagem: row.mensagem,
    tipo: row.tipo,
    fixado: row.fixado,
    concluido: row.concluido,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLembretes(usuarioId: string): Promise<LembretePessoal[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from(TABELA)
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });
  if (error) throw erro("listar lembretes", error);

  return ((data ?? []) as LembreteRow[]).map(montarLembrete);
}

export async function createLembrete(usuarioId: string, input: NewLembreteDTO): Promise<LembretePessoal> {
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const id = randomId("lembrete_");

  const { error } = await db.from(TABELA).insert({
    id,
    usuario_id: usuarioId,
    titulo: input.titulo,
    mensagem: input.mensagem,
    tipo: input.tipo,
    fixado: false,
    concluido: false,
    created_at: now,
    updated_at: now,
  });
  if (error) throw erro("criar lembrete", error);

  return {
    id,
    usuarioId,
    titulo: input.titulo,
    mensagem: input.mensagem,
    tipo: input.tipo,
    fixado: false,
    concluido: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateLembrete(
  id: string,
  usuarioId: string,
  patch: LembreteUpdateDTO,
): Promise<LembretePessoal | null> {
  const db = createSupabaseAdminClient();
  const col: Record<string, unknown> = {};
  if (patch.titulo !== undefined) col.titulo = patch.titulo;
  if (patch.mensagem !== undefined) col.mensagem = patch.mensagem;
  if (patch.tipo !== undefined) col.tipo = patch.tipo;
  if (patch.fixado !== undefined) col.fixado = patch.fixado;
  if (patch.concluido !== undefined) col.concluido = patch.concluido;

  const { data, error } = await db
    .from(TABELA)
    .update({ ...col, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .select("*")
    .maybeSingle();
  if (error) throw erro("atualizar lembrete", error);

  return data ? montarLembrete(data as LembreteRow) : null;
}

export async function deleteLembrete(id: string, usuarioId: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA).delete().eq("id", id).eq("usuario_id", usuarioId).select("id");
  if (error) throw erro("excluir lembrete", error);

  return ((data ?? []) as unknown[]).length > 0;
}
