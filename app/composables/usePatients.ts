import { useState } from "#app";
import { withComputedFields } from "../utils/calculations";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { NewPatientDTO, Patient, PatientComputed } from "#shared/types/Patient";

export function usePatients() {
  const patients = useState<Patient[]>("patients", () => []);
  const loading = useState<boolean>("patients-loading", () => false);
  const error = useState<string | null>("patients-error", () => null);

  function computedPatients(): PatientComputed[] {
    return patients.value
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(withComputedFields);
  }

  async function fetchPatients(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      patients.value = await apiFetch<Patient[]>("/api/patients", undefined, "Falha ao carregar lançamentos.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function addPatient(input: NewPatientDTO): Promise<Patient> {
    const created = await apiFetch<Patient>(
      "/api/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao salvar lançamento."
    );
    patients.value = [created, ...patients.value];
    return created;
  }

  async function updatePatient(id: string, input: NewPatientDTO): Promise<Patient> {
    const updated = await apiFetch<Patient>(
      `/api/patients/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao atualizar lançamento."
    );
    const index = patients.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      patients.value[index] = updated;
    }
    return updated;
  }

  async function removePatient(id: string): Promise<void> {
    await deleteTolerant(`/api/patients/${id}`, "Erro ao remover lançamento.");
    // 404 significa que o lançamento já não existe no servidor — trata como
    // sucesso e limpa do estado local, em vez de deixar o card preso na tela.
    patients.value = patients.value.filter((p) => p.id !== id);
  }

  return {
    patients,
    loading,
    error,
    computedPatients,
    fetchPatients,
    addPatient,
    updatePatient,
    removePatient,
  };
}
