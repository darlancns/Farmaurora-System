import type { NewPatientDTO, Patient } from "../../shared/types/Patient";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasComuns, montarPatient, type PacienteRow } from "./patientMappers";

/**
 * Persistência de Pacientes no Supabase — tabela ÚNICA `prestacao_pacientes`.
 *
 * O contrato deste módulo NÃO muda: as mesmas 6 funções, assinaturas e retornos
 * que `server/api/patients/*` e `server/api/attachments/*` consomem. Só a
 * implementação interna muda.
 *
 * Schema (1 tabela, sem tabelas filhas):
 *  - colunas escalares (id, data, paciente, empresa, consultor, valores…);
 *  - `medicamentos`     jsonb: array de { qtd, medicamento } na ordem original;
 *  - `remessas_itens`   jsonb: array de { despachante, transporte } na ordem
 *                       original — `despachante` = despesasPorRemessa[i],
 *                       `transporte` = transportesPorRemessa[i]; na leitura,
 *                       volta a virar dois arrays paralelos.
 *
 * `consultor === ""` ↔ coluna `consultor = NULL`. `attachedSlots` ↔
 * `attached_slots` (text[]) direto. `id` e `createdAt` são gerados/gravados
 * pelo store, como antes.
 *
 * Atomicidade: create/update/delete são cada um UM único comando numa única
 * linha — o Postgres garante atomicidade por linha. Não existe mais o padrão
 * "update pai + delete/insert filhos", então a antiga ressalva de atomicidade
 * não se aplica a este store.
 */

const TABELA = "prestacao_pacientes";

// ── API pública (mesma interface de sempre) ────────────────────────────────

export async function listPatients(): Promise<Patient[]> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from(TABELA)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw erro("listar pacientes", error);

  return ((data ?? []) as PacienteRow[]).map(montarPatient);
}

export async function createPatient(input: NewPatientDTO): Promise<Patient> {
  const db = createSupabaseAdminClient();
  const id = randomId("p_");
  const createdAt = new Date().toISOString();

  const { error } = await db.from(TABELA).insert({
    id,
    ...colunasComuns(input),
    attached_slots: [],
    created_at: createdAt,
  });
  if (error) throw erro("criar paciente", error);

  return { ...input, id, attachedSlots: [], createdAt };
}

export async function updatePatient(id: string, data: NewPatientDTO): Promise<Patient | null> {
  const db = createSupabaseAdminClient();

  // Um único UPDATE de todos os campos da linha (escalares + medicamentos +
  // remessas_itens). Atômico por natureza — é uma linha só.
  const { data: rows, error } = await db
    .from(TABELA)
    .update(colunasComuns(data))
    .eq("id", id)
    .select("*");
  if (error) throw erro("atualizar paciente", error);

  const row = (rows ?? [])[0] as PacienteRow | undefined;
  return row ? montarPatient(row) : null;
}

export async function deletePatient(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir paciente", error);

  return ((data ?? []) as unknown[]).length > 0;
}

export async function addAttachedSlot(patientId: string, slotKey: string): Promise<Patient | null> {
  const db = createSupabaseAdminClient();

  const { data: row, error } = await db.from(TABELA).select("*").eq("id", patientId).maybeSingle();
  if (error) throw erro("buscar paciente", error);
  if (!row) return null;

  const atuais = (row as PacienteRow).attached_slots ?? [];
  if (atuais.includes(slotKey)) return montarPatient(row as PacienteRow);

  const { data: rows, error: updErr } = await db
    .from(TABELA)
    .update({ attached_slots: [...atuais, slotKey] })
    .eq("id", patientId)
    .select("*");
  if (updErr) throw erro("adicionar anexo", updErr);

  const atualizado = (rows ?? [])[0] as PacienteRow | undefined;
  return atualizado ? montarPatient(atualizado) : null;
}

export async function removeAttachedSlot(patientId: string, slotKey: string): Promise<Patient | null> {
  const db = createSupabaseAdminClient();

  const { data: row, error } = await db
    .from(TABELA)
    .select("attached_slots")
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw erro("buscar paciente", error);
  if (!row) return null;

  const atuais = (row as Pick<PacienteRow, "attached_slots">).attached_slots ?? [];
  const { data: rows, error: updErr } = await db
    .from(TABELA)
    .update({ attached_slots: atuais.filter((key) => key !== slotKey) })
    .eq("id", patientId)
    .select("*");
  if (updErr) throw erro("remover anexo", updErr);

  const atualizado = (rows ?? [])[0] as PacienteRow | undefined;
  return atualizado ? montarPatient(atualizado) : null;
}
