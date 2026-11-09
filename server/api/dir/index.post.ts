import { defineEventHandler, readBody, createError } from "h3";
import { createDir } from "../../utils/dirStore";
import { nomeParaAuditoriaDir } from "../../utils/dirAuditoria";
import { DirRegraError, isValidDirPayload } from "../../utils/dirValidation";
import type { Dir } from "../../../shared/types/dir";
import type { AuthUser } from "#shared/types/auth";

export default defineEventHandler(async (event): Promise<Dir> => {
  const body = await readBody(event);

  if (!isValidDirPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do PO inválidos ou incompletos.",
    });
  }

  const user: AuthUser | null = event.context.user;
  try {
    return await createDir(body, nomeParaAuditoriaDir(user));
  } catch (e) {
    if (e instanceof DirRegraError) throw createError({ statusCode: e.statusCode, statusMessage: e.message });
    throw e;
  }
});
