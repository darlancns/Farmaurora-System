import { defineEventHandler, readBody, createError } from "h3";
import { createPatient } from "../../utils/patientsStore";
import { isValidPatientPayload } from "../../utils/patientValidation";
import { erroDoConsultorEnviado } from "../../utils/consultoresCadastro";
import type { Patient } from "../../../shared/types/Patient";

export default defineEventHandler(async (event): Promise<Patient> => {
  const body = await readBody(event);

  if (!isValidPatientPayload(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Dados do paciente inválidos ou incompletos.",
    });
  }

  // Consultor (opcional: "" = sem consultor): só um consultor ATIVO do Cadastro. Na criação não há valor antigo a tolerar.
  const consultor = body.consultor.trim();
  if (consultor !== "") {
    const erroConsultor = await erroDoConsultorEnviado(consultor, async () => null);
    if (erroConsultor) throw createError({ statusCode: 400, statusMessage: erroConsultor });
  }

  return await createPatient({ ...body, consultor, empresa: "FARMAURORA" });
});
