import type { NewProcessoDTO, Processo, ProcessoPatchDTO } from "../../shared/types/processo";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasDeDTO, montarProcesso, statusOutroDe, type FollowUpRow } from "./processoMappers";

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

  // statusOutro só vale com status "outro" (mesma regra gravada em colunasDeDTO).
  // `codigoRastreio` (campo removido) pode chegar de uma aba antiga: nem grava (colunasDeDTO o ignora) nem volta no retorno.
  const { statusOutro: _bruto, codigoRastreio: _rastreioLegado, ...resto } = input as NewProcessoDTO & { codigoRastreio?: unknown };
  const statusOutro = statusOutroDe(input.status, input.statusOutro);
  return { ...resto, ...(statusOutro ? { statusOutro } : {}), id, createdAt: now, updatedAt: now };
}

export async function patchProcesso(
  id: string,
  patch: ProcessoPatchDTO,
  opcoes: { parcial?: boolean } = {},
): Promise<Processo | null> {
  const db = createSupabaseAdminClient();

  // Um único UPDATE das colunas presentes no patch (+ updated_at). Atômico. `parcial`: formato novo do
  // formulário (datas e transportadora por chave) — ver colunasDeDTO.
  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeDTO(patch, opcoes), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*");
  if (error) throw erro("atualizar processo", error);

  const row = (data ?? [])[0] as FollowUpRow | undefined;
  return row ? montarProcesso(row) : null;
}

export type ResultadoPatchVersionado =
  | { tipo: "ok"; processo: Processo }
  | { tipo: "nao_encontrado" }
  | { tipo: "versao_desatualizada" };

// Garante que o novo updated_at é sempre MAIOR que a versão anterior (o relógio do servidor pode cair
// no mesmo milissegundo da gravação anterior, e a versão guardada pelo banco tem microssegundos).
export function proximoUpdatedAt(versaoAnterior: string, agoraMs: number = Date.now()): string {
  const anterior = Date.parse(versaoAnterior);
  const ms = Number.isFinite(anterior) && agoraMs <= anterior ? anterior + 1 : agoraMs;
  return new Date(ms).toISOString();
}

// PATCH com conferência de versão (optimistic locking): UM UPDATE ... WHERE id = ? AND updated_at = ?,
// atômico — sem ler e depois gravar. `versao` é o updated_at que o cliente viu, usado como veio (string
// opaca; não passa por Date, senão perderia os microssegundos da coluna timestamptz(6)). Nenhuma linha
// gravada = ou o processo não existe (404) ou a versão está desatualizada (409): uma leitura
// posterior, só para escolher a resposta, desempata.
export async function patchProcessoVersionado(
  id: string,
  patch: ProcessoPatchDTO,
  versao: string,
): Promise<ResultadoPatchVersionado> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeDTO(patch), updated_at: proximoUpdatedAt(versao) })
    .eq("id", id)
    .eq("updated_at", versao)
    .select("*");
  if (error) throw erro("atualizar processo", error);

  const row = (data ?? [])[0] as FollowUpRow | undefined;
  if (row) return { tipo: "ok", processo: montarProcesso(row) };

  return (await getProcesso(id)) ? { tipo: "versao_desatualizada" } : { tipo: "nao_encontrado" };
}

export async function deleteProcesso(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir processo", error);

  return ((data ?? []) as unknown[]).length > 0;
}
