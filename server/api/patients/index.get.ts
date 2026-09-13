import { defineEventHandler } from "h3";
import { listPatients } from "../../utils/patientsStore";
import type { Patient } from "../../../shared/types/Patient";

export default defineEventHandler(async (): Promise<Patient[]> => {
  return await listPatients();
});
