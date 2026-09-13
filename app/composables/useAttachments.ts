import type { Patient } from "#shared/types/Patient";
import { usePatients } from "./usePatients";

export function useAttachments() {
  const { patients } = usePatients();

  function syncPatient(updated: Patient): void {
    const index = patients.value.findIndex((p) => p.id === updated.id);
    if (index !== -1) {
      patients.value[index] = updated;
    }
  }

  async function uploadAttachment(patientId: string, slotKey: string, imageBase64: string): Promise<string> {
    const res = await fetch("/api/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, slotKey, imageBase64 }),
    });
    if (!res.ok) throw new Error("Erro ao enviar anexo.");

    const { url, patient } = (await res.json()) as { url: string; patient: Patient };
    syncPatient(patient);
    return url;
  }

  async function deleteAttachment(patientId: string, slotKey: string): Promise<void> {
    const res = await fetch("/api/attachments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, slotKey }),
    });
    if (!res.ok) throw new Error("Erro ao remover anexo.");

    const { patient } = (await res.json()) as { patient: Patient };
    syncPatient(patient);
  }

  return { uploadAttachment, deleteAttachment };
}
