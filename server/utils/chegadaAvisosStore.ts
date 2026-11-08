import type { ChegadaAvisoVisto } from "../../shared/types/chegadaAviso";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * Persistência das dispensas ("olhinho") do aviso "chegou?" — tabela `chegada_avisos_vistos`
 * (supabase/migrations/20261108180000_chegada_avisos_vistos.sql). Mesmo padrão de notificacoesStore.ts: cliente
 * admin do servidor, RLS ligado e sem policies. A chave primária (usuario_id, processo_id, data_prevista) torna
 * a gravação idempotente.
 */

const TABELA = "chegada_avisos_vistos";

interface VistoRow {
  processo_id: string;
  data_prevista: string;
}

export async function listarAvisosChegadaVistos(usuarioId: string): Promise<ChegadaAvisoVisto[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA).select("processo_id, data_prevista").eq("usuario_id", usuarioId);
  if (error) throw erro("listar avisos de chegada vistos", error);

  return ((data ?? []) as VistoRow[]).map((r) => ({ processoId: r.processo_id, dataPrevista: r.data_prevista }));
}

/** Idempotente: marcar de novo o mesmo (usuário, processo, data prevista) não falha nem duplica. */
export async function marcarAvisoChegadaVisto(
  usuarioId: string,
  processoId: string,
  dataPrevista: string,
): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from(TABELA)
    .upsert(
      { usuario_id: usuarioId, processo_id: processoId, data_prevista: dataPrevista },
      { onConflict: "usuario_id,processo_id,data_prevista", ignoreDuplicates: true },
    );
  if (error) throw erro("marcar aviso de chegada como visto", error);
}
