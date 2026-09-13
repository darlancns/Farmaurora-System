import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { updatePatient } from "../../utils/patientsStore";
import { isValidPatientPayload } from "../../utils/patientValidation";
import type { Patient } from "../../../shared/types/Patient";

export default defineEventHandler(async (event): Promise<Patient> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = await readBody(event);

  if (!isValidPatientPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do paciente inválidos ou incompletos.",
    });
  }

  const updated = await updatePatient(id, { ...body, empresa: "FARMAURORA" });

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Lançamento não encontrado." });
  }

  return updated;
});
