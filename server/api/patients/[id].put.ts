import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { getPatient, updatePatient } from "../../utils/patientsStore";
import { isValidPatientPayload } from "../../utils/patientValidation";
import { erroDoConsultorEnviado } from "../../utils/consultoresCadastro";
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

  // Consultor (opcional: "" = sem consultor): só um consultor ATIVO do Cadastro; o valor IGUAL ao já gravado (consultor
  // desativado, valor antigo) é aceito para salvar os outros campos. A linha só é lida quando o enviado não é um ativo.
  const consultor = body.consultor.trim();
  if (consultor !== "") {
    const erroConsultor = await erroDoConsultorEnviado(consultor, async () => (await getPatient(id))?.consultor ?? null);
    if (erroConsultor) throw createError({ statusCode: 400, statusMessage: erroConsultor });
  }

  const updated = await updatePatient(id, { ...body, consultor, empresa: "FARMAURORA" });

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  return updated;
});
