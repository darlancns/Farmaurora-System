import { defineEventHandler, getQuery, createError } from "h3";
import { createSignedReadUrls } from "../../utils/attachmentStorage";
import { SAFE_ATTACHMENT_KEY } from "../../../shared/utils/attachments";

const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 600;
const MAX_SLOTS = 40;

function parseTtl(raw: unknown): number {
  const ttl = Number(raw);
  if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(Math.round(ttl), MIN_TTL_SECONDS), MAX_TTL_SECONDS);
}

// Links de leitura de curta duração (preview no formulário e geração do Word).
// `slots` é a lista de slots marcados como anexados; os que não têm arquivo no
// Storage ficam fora do mapa de resposta.
export default defineEventHandler(async (event): Promise<{ urls: Record<string, string>; expiresIn: number }> => {
  const query = getQuery(event);
  const patientId = typeof query.patientId === "string" ? query.patientId : "";
  const slotKeys = (typeof query.slots === "string" ? query.slots.split(",") : []).filter(Boolean);

  const valid =
    SAFE_ATTACHMENT_KEY.test(patientId) &&
    slotKeys.length <= MAX_SLOTS &&
    slotKeys.every((slotKey) => SAFE_ATTACHMENT_KEY.test(slotKey));
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: "Parâmetros de anexo inválidos." });
  }

  const expiresIn = parseTtl(query.ttl);
  const urls = await createSignedReadUrls(patientId, [...new Set(slotKeys)], expiresIn);
  return { urls, expiresIn };
});
