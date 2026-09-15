import { TIPOS_RECADO } from "#shared/constants/recados";
import type { LembreteUpdateDTO, NewLembreteDTO } from "#shared/types/lembretePessoal";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidNewLembretePayload(body: unknown): body is NewLembreteDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  return isNonEmptyString(b.titulo) && isNonEmptyString(b.mensagem) && TIPOS_RECADO.includes(b.tipo as never);
}

export function isValidLembretePatch(body: unknown): body is LembreteUpdateDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (b.titulo !== undefined && !isNonEmptyString(b.titulo)) return false;
  if (b.mensagem !== undefined && !isNonEmptyString(b.mensagem)) return false;
  if (b.tipo !== undefined && !TIPOS_RECADO.includes(b.tipo as never)) return false;
  if (b.fixado !== undefined && typeof b.fixado !== "boolean") return false;
  if (b.concluido !== undefined && typeof b.concluido !== "boolean") return false;

  return true;
}
