import type { NewProcessoDTO, Processo, ProcessoPatchDTO } from "../../shared/types/processo";
import { NUMERO_REMESSA_PADRAO, normalizarNumeroRemessa } from "../../shared/utils/numeroRemessa";
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

  // `statusOutro` (campo removido: o status "Outro" saiu), `codigoRastreio` (campo removido) e `ordem` (campo antigo,
  // coluna congelada) podem chegar de uma aba antiga: nenhum é gravado (colunasDeDTO os ignora) nem volta no retorno.
  const {
    statusOutro: _statusOutroLegado,
    codigoRastreio: _rastreioLegado,
    ordem: _ordemLegada,
    ...resto
  } = input as NewProcessoDTO & { statusOutro?: unknown; codigoRastreio?: unknown; ordem?: unknown };
  const numeroRemessa = normalizarNumeroRemessa(input.numeroRemessa) ?? NUMERO_REMESSA_PADRAO;
  return { ...resto, numeroRemessa, id, createdAt: now, updatedAt: now };
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
//
// `opcoes.parcial` precisa chegar aqui igual a como chegaria em `patchProcesso`: sem ele, `datas` e
// `transportadoraNacional` viram "substitui tudo" e as chaves ausentes gravam NULL (apaga datas e transportadora).
export async function patchProcessoVersionado(
  id: string,
  patch: ProcessoPatchDTO,
  versao: string,
  opcoes: { parcial?: boolean } = {},
): Promise<ResultadoPatchVersionado> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeDTO(patch, opcoes), updated_at: proximoUpdatedAt(versao) })
    .eq("id", id)
    .eq("updated_at", versao)
    .select("*");
  if (error) throw erro("atualizar processo", error);

  const row = (data ?? [])[0] as FollowUpRow | undefined;
  if (row) return { tipo: "ok", processo: montarProcesso(row) };

  return (await getProcesso(id)) ? { tipo: "versao_desatualizada" } : { tipo: "nao_encontrado" };
}

export type ResultadoChegada =
  | { tipo: "ok"; processo: Processo }
  | { tipo: "nao_encontrado" }
  | { tipo: "status_mudou" } // já não está em_transito (alguém respondeu/alterou antes)
  | { tipo: "conflito" }; // o processo mudou de outro jeito a cada tentativa (improvável)

// Quantas vezes relê e tenta de novo quando só o updated_at mudou entre a leitura e a gravação.
const TENTATIVAS_CHEGADA = 3;

// Resposta ao aviso "chegou?": a mudança (status ou data) e a atualização da timeline vão num ÚNICO UPDATE
// ... WHERE id = ? AND status = 'em_transito' AND updated_at = <versão lida> — sem janela de corrida:
//  - `status = 'em_transito'` impede responder duas vezes (ou depois de alguém já ter atualizado o processo);
//  - `updated_at` impede perder uma atualização da timeline gravada entre a leitura e esta escrita (a lista
//    `atualizacoes` é reescrita inteira). Se só a versão mudou, relê e tenta de novo (até TENTATIVAS_CHEGADA).
// `montar` recebe o processo recém-lido (ainda em_transito) e devolve o patch a gravar.
export async function gravarChegadaProcesso(
  id: string,
  montar: (atual: Processo) => ProcessoPatchDTO,
): Promise<ResultadoChegada> {
  const db = createSupabaseAdminClient();

  for (let tentativa = 0; tentativa < TENTATIVAS_CHEGADA; tentativa++) {
    const atual = await getProcesso(id);
    if (!atual) return { tipo: "nao_encontrado" };
    if (atual.status !== "em_transito") return { tipo: "status_mudou" };

    const { data, error } = await db
      .from(TABELA)
      .update({
        ...colunasDeDTO(montar(atual), { parcial: true }),
        updated_at: proximoUpdatedAt(atual.updatedAt),
      })
      .eq("id", id)
      .eq("status", "em_transito")
      .eq("updated_at", atual.updatedAt)
      .select("*");
    if (error) throw erro("registrar resposta de chegada", error);

    const row = (data ?? [])[0] as FollowUpRow | undefined;
    if (row) return { tipo: "ok", processo: montarProcesso(row) };
  }

  return { tipo: "conflito" };
}

export async function deleteProcesso(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir processo", error);

  return ((data ?? []) as unknown[]).length > 0;
}
