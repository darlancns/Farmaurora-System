import { defineEventHandler, readBody, createError } from "h3";
import { patientExists } from "../../utils/patientsStore";
import { createUploadTarget } from "../../utils/attachmentStorage";
import { SAFE_ATTACHMENT_KEY } from "../../../shared/utils/attachments";

interface UploadUrlBody {
  patientId: string;
  slotKey: string;
}

function isValidBody(body: unknown): body is UploadUrlBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.patientId === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.patientId) &&
    typeof b.slotKey === "string" &&
    SAFE_ATTACHMENT_KEY.test(b.slotKey)
  );
}

// Passo 1 do envio de anexo: o servidor (única parte com a service role) gera um
// token de upload assinado e o browser manda o arquivo direto ao Storage — o
// arquivo nunca passa por esta função (sem o limite de ~4,5MB de body da Vercel).
// O slot só é marcado no banco no passo 2 (POST /api/attachments).
export default defineEventHandler(async (event): Promise<{ path: string; token: string }> => {
  const body = await readBody(event);

  if (!isValidBody(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do anexo inválidos ou incompletos.",
    });
  }

  if (!(await patientExists(body.patientId))) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  return createUploadTarget(body.patientId, body.slotKey);
});
