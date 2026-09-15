import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { listAllAuthUsers, toAdminUserSummary } from "./authUser";
import type { Notificacao, TipoNotificacao } from "#shared/types/notificacao";
import type { Recado } from "#shared/types/recado";

/**
 * Persistência de Notificacao — tabela `notificacoes` — + fan-out das
 * notificações de Recados (ver docs/recados-spec.md seção 7). Mesmo padrão de
 * server/utils/processosStore.ts: sem mapper à parte (tabela simples o
 * bastante pra não justificar um arquivo próprio).
 */

const TABELA = "notificacoes";

interface NotificacaoRow {
  id: string;
  destinatario_id: string;
  tipo: TipoNotificacao;
  recado_id: string | null;
  mensagem: string;
  lida: boolean;
  created_at: string;
}

function montarNotificacao(row: NotificacaoRow): Notificacao {
  const notificacao: Notificacao = {
    id: row.id,
    destinatarioId: row.destinatario_id,
    tipo: row.tipo,
    mensagem: row.mensagem,
    lida: row.lida,
    createdAt: row.created_at,
  };
  if (row.recado_id != null) notificacao.recadoId = row.recado_id;
  return notificacao;
}

interface NovaNotificacao {
  destinatarioId: string;
  tipo: TipoNotificacao;
  recadoId: string | null;
  mensagem: string;
}

// Um único INSERT multi-linha pro fan-out (cargo/público podem gerar dezenas
// de linhas) — evita N round-trips separados.
async function inserirNotificacoes(rows: NovaNotificacao[]): Promise<void> {
  if (!rows.length) return;
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await db.from(TABELA).insert(
    rows.map((r) => ({
      id: randomId("notif_"),
      destinatario_id: r.destinatarioId,
      tipo: r.tipo,
      recado_id: r.recadoId,
      mensagem: r.mensagem,
      lida: false,
      created_at: now,
    })),
  );
  if (error) throw erro("criar notificações", error);
}

export async function criarNotificacao(
  destinatarioId: string,
  tipo: TipoNotificacao,
  recadoId: string | null,
  mensagem: string,
): Promise<void> {
  await inserirNotificacoes([{ destinatarioId, tipo, recadoId, mensagem }]);
}

export async function listNotificacoes(usuarioId: string): Promise<Notificacao[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from(TABELA)
    .select("*")
    .eq("destinatario_id", usuarioId)
    .order("created_at", { ascending: false });
  if (error) throw erro("listar notificações", error);

  return ((data ?? []) as NotificacaoRow[]).map(montarNotificacao);
}

/** true se marcou agora; false se a notificação não existe (ou não é do usuário). */
export async function marcarComoLida(usuarioId: string, notificacaoId: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from(TABELA)
    .update({ lida: true })
    .eq("id", notificacaoId)
    .eq("destinatario_id", usuarioId)
    .select("id");
  if (error) throw erro("marcar notificação como lida", error);

  return ((data ?? []) as unknown[]).length > 0;
}

// ── Fan-out de notificações de Recados ─────────────────────────────────────

function templateRecadoNovo(recado: Recado, autorNome: string): string {
  if (recado.destinatarioTipo === "pessoa") return `${autorNome} te enviou um recado: "${recado.titulo}"`;
  if (recado.destinatarioTipo === "cargo") return `${autorNome} enviou um recado pro seu cargo: "${recado.titulo}"`;
  return `${autorNome} publicou um recado: "${recado.titulo}"`;
}

/**
 * Gera as notificações de um recado novo — ou reeditado, mesma lógica e
 * mesmo template, reenviando aos destinatários ATUAIS do recado (ver
 * docs/recados-spec.md seção 7, "Recado editado pelo autor"). Uma linha por
 * conta destinatária: pessoa → só ela; cargo → todas as contas daquele cargo;
 * público → todas as contas. O autor nunca notifica a si mesmo.
 */
export async function notificarDestinatariosRecado(recado: Recado, autorNome: string): Promise<void> {
  const mensagem = templateRecadoNovo(recado, autorNome);

  let destinatarios: string[];
  if (recado.destinatarioTipo === "pessoa") {
    destinatarios = recado.destinatarioPessoaId ? [recado.destinatarioPessoaId] : [];
  } else if (recado.destinatarioTipo === "cargo") {
    const admin = createSupabaseAdminClient();
    const contas = await listAllAuthUsers(admin);
    destinatarios = contas
      .filter((conta) => toAdminUserSummary(conta).role === recado.destinatarioCargo)
      .map((conta) => conta.id);
  } else {
    const admin = createSupabaseAdminClient();
    const contas = await listAllAuthUsers(admin);
    destinatarios = contas.map((conta) => conta.id);
  }

  const rows = destinatarios
    .filter((id) => id !== recado.autorId)
    .map((destinatarioId) => ({ destinatarioId, tipo: "recado_novo" as const, recadoId: recado.id, mensagem }));

  await inserirNotificacoes(rows);
}

/** Notifica o autor original de que alguém concluiu o recado dele. */
export async function notificarConclusaoRecado(
  autorId: string,
  tituloRecado: string,
  recadoId: string,
  quemConcluiuNome: string,
): Promise<void> {
  const mensagem = `${quemConcluiuNome} concluiu o recado "${tituloRecado}" que você enviou.`;
  await criarNotificacao(autorId, "recado_concluido", recadoId, mensagem);
}
