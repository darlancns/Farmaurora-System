import type { NewProcessoDTO, Processo } from "../../shared/types/processo";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "./processoMappers";

/**
 * Persistência de Processo (Follow-Up) no Supabase — tabela ÚNICA `follow_up`.
 *
 * O contrato NÃO muda: as mesmas 5 funções, assinaturas e retornos que
 * `server/api/processos/*` consome. Só a origem dos dados deixa de ser
 * `data/processos.json`.
 *
 * Mapeamento (linha ↔ objeto) mora em `./processoMappers.ts` (Round 8b).
 *
 * Atomicidade: create/patch/delete são cada um UM comando numa única linha —
 * atômico por natureza. `patchProcesso` é seletivo por campo: só toca as
 * colunas cujas chaves estão presentes no `patch` (mesma semântica do antigo
 * merge raso `{ ...existing, ...patch }`).
 */

const TABELA = "follow_up";

// ── API pública (mesma interface de sempre) ────────────────────────────────

export async function listProcessos(): Promise<Processo[]> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from(TABELA)
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw erro("listar processos", error);

  return ((data ?? []) as FollowUpRow[]).map(montarProcesso);
}

export async function getProcesso(id: string): Promise<Processo | null> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).select("*").eq("id", id).maybeSingle();
  if (error) throw erro("buscar processo", error);

  return data ? montarProcesso(data as FollowUpRow) : null;
}

export async function createProcesso(input: NewProcessoDTO): Promise<Processo> {
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const id = randomId("proc_");

  const { error } = await db.from(TABELA).insert({
    id,
    ...colunasDeDTO(input),
    created_at: now,
    updated_at: now,
  });
  if (error) throw erro("criar processo", error);

  return { ...input, id, createdAt: now, updatedAt: now };
}

export async function patchProcesso(
  id: string,
  patch: Partial<NewProcessoDTO>,
): Promise<Processo | null> {
  const db = createSupabaseAdminClient();

  // Um único UPDATE das colunas presentes no patch (+ updated_at). Atômico.
  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeDTO(patch), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*");
  if (error) throw erro("atualizar processo", error);

  const row = (data ?? [])[0] as FollowUpRow | undefined;
  return row ? montarProcesso(row) : null;
}

export async function deleteProcesso(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir processo", error);

  return ((data ?? []) as unknown[]).length > 0;
}
