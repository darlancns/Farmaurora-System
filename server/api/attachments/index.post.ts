import { defineEventHandler, readBody, createError } from "h3";
import { addAttachedSlot } from "../../utils/patientsStore";
import { attachmentExists } from "../../utils/attachmentStorage";
import { SAFE_ATTACHMENT_KEY } from "../../../shared/utils/attachments";
import type { Patient } from "../../../shared/types/Patient";

interface AttachmentConfirmBody {
  patientId: string;
  slotKey: string;
}

function isValidBody(body: unknown): body is AttachmentConfirmBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.patientId === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.patientId) &&
    typeof b.slotKey === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.slotKey)
  );
}

// Passo 2 do envio de anexo (depois do upload direto ao Storage): confirma que o
// arquivo existe LÁ e só então marca o slot no banco. Se o upload falhou, nada é
// marcado — o banco nunca diz "anexado" sem arquivo.
export default defineEventHandler(async (event): Promise<{ patient: Patient }> => {
  const body = await readBody(event);

  if (!isValidBody(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do anexo inválidos ou incompletos.",
    });
  }

  const { patientId, slotKey } = body;

  if (!(await attachmentExists(patientId, slotKey))) {
    throw createError({
      statusCode: 409,
      statusMessage: "O arquivo do anexo não chegou ao armazenamento. Envie o print novamente.",
    });
  }

  const patient = await addAttachedSlot(patientId, slotKey);
  if (!patient) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  return { patient };
});
