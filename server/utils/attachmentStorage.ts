import { createError } from "h3";
import { ATTACHMENTS_BUCKET, attachmentObjectPath } from "../../shared/utils/attachments";
import { createSupabaseAdminClient } from "./supabaseServerClient";

/**
 * Acesso ao bucket privado de anexos (Supabase Storage), sempre com a service
 * role (bypassa RLS; a chave só existe no servidor). O RBAC já foi aplicado
 * por server/middleware/auth.ts (`/api/attachments/*` → seção "patients").
 */

function bucket() {
  return createSupabaseAdminClient().storage.from(ATTACHMENTS_BUCKET);
}

function storageError(acao: string, message: string | undefined) {
  return createError({
    statusCode: 502,
    statusMessage: `Falha no armazenamento de anexos (${acao}): ${message ?? "sem resposta do Storage"}.`,
  });
}

/** Signed upload URL (token) pro browser enviar o arquivo direto ao Storage. */
export async function createUploadTarget(
  patientId: string,
  slotKey: string,
): Promise<{ path: string; token: string }> {
  const path = attachmentObjectPath(patientId, slotKey);
  // `upsert` precisa ser pedido aqui (e não no upload): trocar um anexo reaproveita o caminho.
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw storageError("preparar envio", error?.message);
  return { path, token: data.token };
}

export async function attachmentExists(patientId: string, slotKey: string): Promise<boolean> {
  const fileName = `${slotKey}.png`;
  const { data, error } = await bucket().list(patientId, { search: fileName, limit: 100 });
  if (error) throw storageError("conferir arquivo", error.message);
  return (data ?? []).some((object) => object.name === fileName);
}

/**
 * Signed URLs de leitura (curta duração) dos slots pedidos. Slot cujo arquivo
 * não existe no Storage simplesmente não entra no mapa — quem consome decide
 * o que fazer (o Word, por exemplo, aborta citando o slot).
 */
export async function createSignedReadUrls(
  patientId: string,
  slotKeys: string[],
  ttlSeconds: number,
): Promise<Record<string, string>> {
  if (slotKeys.length === 0) return {};

  const slotByPath = new Map(slotKeys.map((slotKey) => [attachmentObjectPath(patientId, slotKey), slotKey]));
  const { data, error } = await bucket().createSignedUrls([...slotByPath.keys()], ttlSeconds);
  if (error) throw storageError("gerar links de leitura", error.message);

  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    const slotKey = item.path ? slotByPath.get(item.path) : undefined;
    if (slotKey && item.signedUrl && !item.error) urls[slotKey] = item.signedUrl;
  }
  return urls;
}

/**
 * Remove o arquivo de um slot. Chamado DEPOIS de o banco já ter desmarcado o
 * slot: se o Storage falhar, sobra no máximo um arquivo órfão (inofensivo, o
 * próximo envio sobrescreve) — por isso só registra o erro, nunca lança.
 */
export async function removeAttachmentObject(patientId: string, slotKey: string): Promise<void> {
  try {
    const { error } = await bucket().remove([attachmentObjectPath(patientId, slotKey)]);
    if (error) console.error(`[anexos] falha ao remover ${patientId}/${slotKey}.png:`, error.message);
  } catch (e) {
    console.error(`[anexos] falha ao remover ${patientId}/${slotKey}.png:`, e);
  }
}

/**
 * Remove a pasta inteira de uma prestação excluída. Best-effort: a linha do
 * banco já foi apagada, então pasta inexistente (prestações antigas nunca
 * tiveram arquivo no Storage) ou erro do Storage só vai pro log do servidor —
 * nunca derruba nem trava a exclusão.
 */
export async function removePatientFolder(patientId: string): Promise<void> {
  try {
    const bucketApi = bucket();
    const { data, error } = await bucketApi.list(patientId, { limit: 1000 });
    if (error) {
      console.error(`[anexos] falha ao listar a pasta de ${patientId}:`, error.message);
      return;
    }
    const paths = (data ?? []).filter((object) => object.name).map((object) => `${patientId}/${object.name}`);
    if (paths.length === 0) return;

    const { error: removeError } = await bucketApi.remove(paths);
    if (removeError) console.error(`[anexos] falha ao remover a pasta de ${patientId}:`, removeError.message);
  } catch (e) {
    console.error(`[anexos] falha ao remover a pasta de ${patientId}:`, e);
  }
}
