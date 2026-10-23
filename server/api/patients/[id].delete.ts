import { defineEventHandler, getRouterParam, createError } from "h3";
import { deletePatient } from "../../utils/patientsStore";
import { removePatientFolder } from "../../utils/attachmentStorage";
import { SAFE_ATTACHMENT_KEY } from "../../../shared/utils/attachments";

export default defineEventHandler(async (event): Promise<{ deleted: true }> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const deleted = await deletePatient(id);

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  // Linha já apagada; a pasta de anexos é limpeza best-effort (nunca falha a exclusão).
  if (SAFE_ATTACHMENT_KEY.test(id)) {
    await removePatientFolder(id);
  }

  return { deleted: true };
});
