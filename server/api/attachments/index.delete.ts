import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { defineEventHandler, readBody, createError } from "h3";
import { removeAttachedSlot } from "../../utils/patientsStore";
import { SAFE_ATTACHMENT_KEY, getAttachmentFilePath } from "../../utils/attachmentPaths";
import type { Patient } from "../../../shared/types/Patient";

interface AttachmentDeleteBody {
  patientId: string;
  slotKey: string;
}

function isValidBody(body: unknown): body is AttachmentDeleteBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.patientId === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.patientId) &&
    typeof b.slotKey === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.slotKey)
  );
}

export default defineEventHandler(async (event): Promise<{ deleted: true; patient: Patient }> => {
  const body = await readBody(event);

  if (!isValidBody(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do anexo inválidos ou incompletos.",
    });
  }

  const { patientId, slotKey } = body;

  const patient = await removeAttachedSlot(patientId, slotKey);
  if (!patient) {
    throw createError({ statusCode: 404, statusMessage: "Lançamento não encontrado." });
  }

  const filePath = getAttachmentFilePath(patientId, slotKey);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }

  return { deleted: true, patient };
});
