import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { setPatientStatus } from "../../../utils/patientsStore";
import { isValidPatientStatusPayload } from "../../../utils/patientValidation";
import type { Patient } from "../../../../shared/types/Patient";

// Alterna o andamento da prestação (em_andamento ↔ concluida). Caminho dedicado: o PUT de edição não
// grava status. Cai nas regras de /api/patients (escrita só de sócio e administrador, em
// server/middleware/auth.ts) — nenhuma regra nova de RBAC.
export default defineEventHandler(async (event): Promise<Patient> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidPatientStatusPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status inválido. Use "em_andamento" ou "concluida".',
    });
  }

  const updated = await setPatientStatus(id, body.status);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  return updated;
});
