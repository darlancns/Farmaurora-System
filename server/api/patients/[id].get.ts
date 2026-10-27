import { defineEventHandler, getRouterParam, createError } from "h3";
import { getPatient } from "../../utils/patientsStore";
import type { Patient } from "../../../shared/types/Patient";

// Uma prestação do banco (estado fresco) — usada, por exemplo, antes de gerar o Word,
// pra não depender do que a tela carregou há minutos.
export default defineEventHandler(async (event): Promise<Patient> => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const patient = await getPatient(id);
  if (!patient) {
    throw createError({ statusCode: 404, statusMessage: "Prestação não encontrada." });
  }

  return patient;
});
