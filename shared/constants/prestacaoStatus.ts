import type { PatientStatus } from "../types/Patient";

// Status da prestação. Fonte única: o servidor valida o PATCH com isso, o mapeamento da linha usa o
// padrão e o selo do card usa os rótulos. Espelha o CHECK da coluna `status` (supabase/migrations/
// 20261027120000_prestacao_status.sql).
export const PATIENT_STATUS_VALUES: readonly PatientStatus[] = ["em_andamento", "concluida"];

// Padrão das prestações novas (DEFAULT da coluna) e de linhas sem status (anteriores à migration).
export const PATIENT_STATUS_PADRAO: PatientStatus = "em_andamento";

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export function isPatientStatus(value: unknown): value is PatientStatus {
  return PATIENT_STATUS_VALUES.includes(value as PatientStatus);
}

// Defesa de leitura: ausente, nulo ou fora do enum vira o padrão — o código nunca quebra por causa disso.
export function normalizarPatientStatus(value: unknown): PatientStatus {
  return isPatientStatus(value) ? value : PATIENT_STATUS_PADRAO;
}

export function proximoPatientStatus(atual: PatientStatus): PatientStatus {
  return atual === "concluida" ? "em_andamento" : "concluida";
}
