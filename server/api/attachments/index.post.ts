import { writeFile, mkdir } from "node:fs/promises";
import { defineEventHandler, readBody, createError } from "h3";
import { addAttachedSlot } from "../../utils/patientsStore";
import { SAFE_ATTACHMENT_KEY, getAttachmentDir, getAttachmentFilePath } from "../../utils/attachmentPaths";
import { getAttachmentPublicUrl } from "../../../shared/utils/attachments";
import type { Patient } from "../../../shared/types/Patient";

interface AttachmentUploadBody {
  patientId: string;
  slotKey: string;
  imageBase64: string;
}

function isValidBody(body: unknown): body is AttachmentUploadBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.patientId === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.patientId) &&
    typeof b.slotKey === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.slotKey) &&
    typeof b.imageBase64 === "string" &&
    b.imageBase64.trim().length > 0
  );
}

function extractBase64Data(imageBase64: string): string {
  const match = imageBase64.match(/^data:.*;base64,(.*)$/s);
  return match ? (match[1] ?? imageBase64) : imageBase64;
}

export default defineEventHandler(async (event): Promise<{ url: string; patient: Patient }> => {
  const body = await readBody(event);

  if (!isValidBody(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do anexo inválidos ou incompletos.",
    });
  }

  const { patientId, slotKey, imageBase64 } = body;

  const patient = await addAttachedSlot(patientId, slotKey);
  if (!patient) {
    throw createError({ statusCode: 404, statusMessage: "Lançamento não encontrado." });
  }

  await mkdir(getAttachmentDir(patientId), { recursive: true });
  const buffer = Buffer.from(extractBase64Data(imageBase64), "base64");
  await writeFile(getAttachmentFilePath(patientId, slotKey), buffer);

  return { url: getAttachmentPublicUrl(patientId, slotKey), patient };
});
