import type { Patient } from "#shared/types/Patient";
import { ATTACHMENTS_BUCKET } from "#shared/utils/attachments";
import { usePatients } from "./usePatients";
import { getSupabaseClient } from "../utils/supabaseClient";
import { ensurePngBlob } from "../utils/attachmentImage";
import { getErrorMessage, readApiError } from "../utils/errorMessages";
import { createFilaPorChave } from "../utils/filaPorChave";

const JSON_HEADERS = { "Content-Type": "application/json" };

// Fila por prestação: anexar/remover slot é leitura-modificação-escrita de `attached_slots` no
// servidor, então duas operações da MESMA prestação em paralelo se atropelam (a última grava a
// lista dela e o outro slot some, deixando o arquivo órfão). Aqui elas rodam uma de cada vez;
// prestações diferentes não esperam umas pelas outras.
const { enfileirar } = createFilaPorChave();

export function useAttachments() {
  const { patients } = usePatients();

  function syncPatient(updated: Patient): void {
    const index = patients.value.findIndex((p) => p.id === updated.id);
    if (index !== -1) {
      patients.value[index] = updated;
    }
  }

  /**
   * Envio em 3 passos — o arquivo vai DIRETO ao Storage (não passa pela função
   * da Vercel, então não há o limite de ~4,5MB de body):
   *  1. servidor gera a signed upload URL (service role, só no servidor);
   *  2. o browser sobe o PNG com esse token;
   *  3. o servidor confere que o arquivo chegou e SÓ ENTÃO marca o slot no banco.
   * Se qualquer passo falhar, o erro carrega a mensagem real e o banco não muda. Se só o
   * passo 3 falhar (arquivo no Storage, slot sem marcação), o arquivo órfão é descartado e a
   * mensagem diz isso. Roda na fila da prestação (ver `enfileirar`).
   */
  function uploadAttachment(patientId: string, slotKey: string, image: Blob): Promise<void> {
    return enfileirar(patientId, () => uploadAttachmentAgora(patientId, slotKey, image));
  }

  async function uploadAttachmentAgora(patientId: string, slotKey: string, image: Blob): Promise<void> {
    const png = await ensurePngBlob(image);

    const targetRes = await fetch("/api/attachments/upload-url", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ patientId, slotKey }),
    });
    if (!targetRes.ok) throw new Error(await readApiError(targetRes, "Não foi possível preparar o envio do anexo."));
    const { path, token } = (await targetRes.json()) as { path: string; token: string };

    const { error } = await getSupabaseClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .uploadToSignedUrl(path, token, png, { contentType: "image/png" });
    if (error) throw new Error(`Falha ao enviar o anexo ao armazenamento: ${error.message}`);

    try {
      const confirmRes = await fetch("/api/attachments", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ patientId, slotKey }),
      });
      if (!confirmRes.ok) throw new Error(await readApiError(confirmRes, "Erro ao registrar o anexo."));

      const { patient } = (await confirmRes.json()) as { patient: Patient };
      syncPatient(patient);
    } catch (e) {
      // O arquivo subiu mas o slot não ficou (ou não sabemos se ficou): desfaz pelo mesmo caminho do
      // "Remover" (banco primeiro, Storage depois), que também traz a prestação fresca pra tela.
      const descartou = await descartarAnexoOrfao(patientId, slotKey);
      const motivo = getErrorMessage(e, "Erro ao registrar o anexo.");
      throw new Error(
        descartou
          ? `${motivo} O arquivo enviado foi descartado; envie o print de novo.`
          : `${motivo} Não foi possível descartar o arquivo enviado; envie o print de novo (ele será sobrescrito).`
      );
    }
  }

  async function descartarAnexoOrfao(patientId: string, slotKey: string): Promise<boolean> {
    try {
      await deleteAttachmentAgora(patientId, slotKey);
      return true;
    } catch {
      return false;
    }
  }

  function deleteAttachment(patientId: string, slotKey: string): Promise<void> {
    return enfileirar(patientId, () => deleteAttachmentAgora(patientId, slotKey));
  }

  async function deleteAttachmentAgora(patientId: string, slotKey: string): Promise<void> {
    const res = await fetch("/api/attachments", {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ patientId, slotKey }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "Erro ao remover anexo."));

    const { patient } = (await res.json()) as { patient: Patient };
    syncPatient(patient);
  }

  /**
   * Signed URLs de leitura (curta duração) dos slots pedidos. Slot sem arquivo
   * no Storage não vem no mapa.
   */
  async function fetchSignedUrls(
    patientId: string,
    slotKeys: string[],
    ttlSeconds: number
  ): Promise<Record<string, string>> {
    if (slotKeys.length === 0) return {};

    const query = new URLSearchParams({ patientId, slots: slotKeys.join(","), ttl: String(ttlSeconds) });
    const res = await fetch(`/api/attachments/signed-urls?${query.toString()}`);
    if (!res.ok) throw new Error(await readApiError(res, "Não foi possível carregar os anexos."));

    const { urls } = (await res.json()) as { urls: Record<string, string> };
    return urls;
  }

  return { uploadAttachment, deleteAttachment, fetchSignedUrls };
}
