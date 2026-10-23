// Anexos de prestação vivem no Supabase Storage (bucket privado), um arquivo por
// slot: `<patientId>/<slotKey>.png`. A migration que cria o bucket e as policies
// está em supabase/migrations/ — o nome do bucket e o formato do caminho
// precisam bater com a regex das policies de lá.

export const ATTACHMENTS_BUCKET = "attachments";

// Vale pro patientId e pro slotKey: só letras, dígitos, "_" e "-" (sem "/" nem
// "..", então o caminho nunca sai da pasta do paciente).
export const SAFE_ATTACHMENT_KEY = /^[a-zA-Z0-9_-]+$/;

export function attachmentObjectPath(patientId: string, slotKey: string): string {
  return `${patientId}/${slotKey}.png`;
}
