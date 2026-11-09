import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { patchDir } from "../../utils/dirStore";
import { nomeParaAuditoriaDir } from "../../utils/dirAuditoria";
import { DirRegraError, isValidDirPatch } from "../../utils/dirValidation";
import type { Dir } from "../../../shared/types/dir";
import type { AuthUser } from "#shared/types/auth";

export default defineEventHandler(async (event): Promise<Dir> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidDirPatch(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do PO inválidos.",
    });
  }

  const user: AuthUser | null = event.context.user;
  let updated: Dir | null;
  try {
    updated = await patchDir(id, body, nomeParaAuditoriaDir(user));
  } catch (e) {
    if (e instanceof DirRegraError) throw createError({ statusCode: e.statusCode, statusMessage: e.message });
    throw e;
  }

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "PO não encontrado." });
  }

  return updated;
});
