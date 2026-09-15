import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasDeRecadoDTO, montarRecado, type RecadoRow } from "./recadoMappers";
import { notificarConclusaoRecado, notificarDestinatariosRecado } from "./notificacoesStore";
import type { NewRecadoDTO, Recado, RecadoUpdateDTO } from "#shared/types/recado";
import type { Role } from "#shared/utils/rbac";

/**
 * Persistência de Recado — tabela `recados` + as duas tabelas de junção
 * individuais por conta (`recados_fixados`, `recados_concluidos`). Mesmo
 * padrão de server/utils/processosStore.ts (funções puras, um comando por
 * escrita — atômico por natureza).
 *
 * `createRecado`/`updateRecado` disparam o fan-out de notificações (ver
 * notificacoesStore.ts) depois de escrever a linha — não há transação
 * client-side (supabase-js não tem), mesmo risco aceito já documentado em
 * pagamentos/bancoStore.ts: se a notificação falhar depois do INSERT/UPDATE
 * ter sucesso, o recado fica gravado sem notificação; refazer a ação corrige.
 */

const TABELA = "recados";

export async function listRecadosVisiveis(usuarioId: string, cargo: Role): Promise<Recado[]> {
  const db = createSupabaseAdminClient();

  // Público + do meu cargo + direcionados a mim + os que eu autorei. Não
  // filtra por aba (Todos/Recebidos/Enviados) nem por concluído/fixado — isso
  // fica pro client (Fase B/D), usando os campos calculados abaixo.
  const orFiltro = [
    "destinatario_tipo.eq.publico",
    `and(destinatario_tipo.eq.cargo,destinatario_cargo.eq.${cargo})`,
    `and(destinatario_tipo.eq.pessoa,destinatario_pessoa_id.eq.${usuarioId})`,
    `autor_id.eq.${usuarioId}`,
  ].join(",");

  const { data, error } = await db
    .from(TABELA)
    .select("*")
    .or(orFiltro)
    .order("created_at", { ascending: false });
  if (error) throw erro("listar recados", error);

  const rows = (data ?? []) as RecadoRow[];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);

  const [fixadosRes, concluidosRes] = await Promise.all([
    db.from("recados_fixados").select("recado_id").eq("usuario_id", usuarioId).in("recado_id", ids),
    db.from("recados_concluidos").select("recado_id").eq("usuario_id", usuarioId).in("recado_id", ids),
  ]);
  if (fixadosRes.error) throw erro("consultar recados fixados", fixadosRes.error);
  if (concluidosRes.error) throw erro("consultar recados concluídos", concluidosRes.error);

  const fixadosSet = new Set((fixadosRes.data ?? []).map((r) => r.recado_id as string));
  const concluidosSet = new Set((concluidosRes.data ?? []).map((r) => r.recado_id as string));

  return rows.map((row) => montarRecado(row, fixadosSet.has(row.id), concluidosSet.has(row.id)));
}

/**
 * Busca um recado por id, sem calcular `fixadoPorMim`/`concluidoPorMim`
 * (ficam `false`) — uso interno pra checagem de dono em editar/excluir, nunca
 * pra exibição (ver server/api/recados/[id].patch.ts e [id].delete.ts).
 */
export async function getRecado(id: string): Promise<Recado | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA).select("*").eq("id", id).maybeSingle();
  if (error) throw erro("buscar recado", error);

  return data ? montarRecado(data as RecadoRow) : null;
}

export async function createRecado(autorId: string, autorNome: string, input: NewRecadoDTO): Promise<Recado> {
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const id = randomId("recado_");

  const { error } = await db.from(TABELA).insert({
    id,
    autor_id: autorId,
    ...colunasDeRecadoDTO(input),
    created_at: now,
    updated_at: now,
  });
  if (error) throw erro("criar recado", error);

  const recado = montarRecado({
    id,
    autor_id: autorId,
    titulo: input.titulo,
    mensagem: input.mensagem,
    tipo: input.tipo,
    destinatario_tipo: input.destinatarioTipo,
    destinatario_cargo: input.destinatarioTipo === "cargo" ? (input.destinatarioCargo ?? null) : null,
    destinatario_pessoa_id: input.destinatarioTipo === "pessoa" ? (input.destinatarioPessoaId ?? null) : null,
    created_at: now,
    updated_at: now,
  });

  await notificarDestinatariosRecado(recado, autorNome);
  return recado;
}

// Substitui o recado inteiro (não faz merge parcial — ver recadoValidation.ts)
// e reenvia notificação aos destinatários atuais (mesmo se não mudaram).
export async function updateRecado(id: string, autorNome: string, input: RecadoUpdateDTO): Promise<Recado | null> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeRecadoDTO(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw erro("atualizar recado", error);
  if (!data) return null;

  const recado = montarRecado(data as RecadoRow);
  await notificarDestinatariosRecado(recado, autorNome);
  return recado;
}

export async function deleteRecado(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  // recados_fixados/recados_concluidos somem junto via ON DELETE CASCADE.
  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir recado", error);

  return ((data ?? []) as unknown[]).length > 0;
}

/** Insere ou remove a fixação. Devolve o novo estado (`true` = fixado agora). */
export async function toggleFixar(usuarioId: string, recadoId: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data: existente, error: selectError } = await db
    .from("recados_fixados")
    .select("recado_id")
    .eq("usuario_id", usuarioId)
    .eq("recado_id", recadoId)
    .maybeSingle();
  if (selectError) throw erro("consultar fixação de recado", selectError);

  if (existente) {
    const { error } = await db
      .from("recados_fixados")
      .delete()
      .eq("usuario_id", usuarioId)
      .eq("recado_id", recadoId);
    if (error) throw erro("desfixar recado", error);
    return false;
  }

  const { error } = await db
    .from("recados_fixados")
    .insert({ usuario_id: usuarioId, recado_id: recadoId, created_at: new Date().toISOString() });
  if (error) throw erro("fixar recado", error);
  return true;
}

/**
 * Marca como concluído pro usuário (idempotente: já concluído não duplica
 * linha nem reenvia notificação — ver docs/recados-spec.md seção 6, ação
 * final e irreversível, sem endpoint de "desconcluir"). Devolve `true` só
 * quando esta chamada foi a que concluiu de fato.
 */
export async function concluirRecado(usuarioId: string, usuarioNome: string, recadoId: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  // ON CONFLICT DO NOTHING: `select()` só devolve linha quando o INSERT
  // realmente aconteceu, nunca quando já existia.
  const { data, error } = await db
    .from("recados_concluidos")
    .upsert(
      { usuario_id: usuarioId, recado_id: recadoId, concluido_em: new Date().toISOString() },
      { onConflict: "usuario_id,recado_id", ignoreDuplicates: true },
    )
    .select("recado_id");
  if (error) throw erro("concluir recado", error);

  const inseriuAgora = ((data ?? []) as unknown[]).length > 0;
  if (!inseriuAgora) return false;

  const { data: recadoRow, error: recadoError } = await db
    .from(TABELA)
    .select("titulo, autor_id")
    .eq("id", recadoId)
    .maybeSingle();
  if (recadoError) throw erro("buscar recado pra notificação de conclusão", recadoError);

  if (recadoRow) {
    await notificarConclusaoRecado(recadoRow.autor_id as string, recadoRow.titulo as string, recadoId, usuarioNome);
  }

  return true;
}
