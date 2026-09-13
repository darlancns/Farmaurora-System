import { join } from "node:path";

export const SAFE_ATTACHMENT_KEY = /^[a-zA-Z0-9_-]+$/;

const UPLOADS_DIR = join(process.cwd(), "public", "uploads", "attachments");

export function getAttachmentDir(patientId: string): string {
  return join(UPLOADS_DIR, patientId);
}

export function getAttachmentFilePath(patientId: string, slotKey: string): string {
  return join(getAttachmentDir(patientId), `${slotKey}.png`);
}
