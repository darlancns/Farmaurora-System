import { defineEventHandler, readBody, createError } from "h3";
import { createPatient } from "../../utils/patientsStore";
import { isValidPatientPayload } from "../../utils/patientValidation";
import type { Patient } from "../../../shared/types/Patient";

export default defineEventHandler(async (event): Promise<Patient> => {
  const body = await readBody(event);

  if (!isValidPatientPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do paciente inválidos ou incompletos.",
    });
  }

  return await createPatient({ ...body, empresa: "FARMAURORA" });
});
