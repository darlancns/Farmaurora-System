import { useState } from "#app";
import { withComputedFields } from "../utils/calculations";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { NewPatientDTO, Patient, PatientComputed, PatientStatus } from "#shared/types/Patient";

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
      patients.value = await apiFetch<Patient[]>("/api/patients", undefined, "Falha ao carregar prestações.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  // Relê UMA prestação do servidor e troca a cópia local pela fresca (se estiver na lista).
  async function fetchPatient(id: string): Promise<Patient> {
    const fresh = await apiFetch<Patient>(`/api/patients/${id}`, undefined, "Falha ao carregar a prestação.");
    const index = patients.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      patients.value[index] = fresh;
    }
    return fresh;
  }

  async function addPatient(input: NewPatientDTO): Promise<Patient> {
    const created = await apiFetch<Patient>(
      "/api/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao salvar prestação."
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
      "Erro ao atualizar prestação."
    );
    const index = patients.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      patients.value[index] = updated;
    }
    return updated;
  }

  // Alterna o status com atualização otimista: o selo muda na hora; se o servidor recusar (ou a rede
  // falhar) volta ao valor anterior e o erro sobe para a página avisar. Só o campo `status` é trocado,
  // nunca o objeto inteiro, para não atropelar outra alteração local (ex.: anexo recém-enviado).
  async function updatePatientStatus(id: string, status: PatientStatus): Promise<void> {
    const current = patients.value.find((p) => p.id === id);
    if (!current) return;
    const previous = current.status;
    current.status = status;
    try {
      const updated = await apiFetch<Patient>(
        `/api/patients/${id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
        "Erro ao atualizar o status da prestação."
      );
      const index = patients.value.findIndex((p) => p.id === id);
      if (index !== -1) patients.value[index]!.status = updated.status;
    } catch (e) {
      const index = patients.value.findIndex((p) => p.id === id);
      if (index !== -1) patients.value[index]!.status = previous;
      throw e;
    }
  }

  async function removePatient(id: string): Promise<void> {
    await deleteTolerant(`/api/patients/${id}`, "Erro ao remover prestação.");
    // 404 significa que a prestação já não existe no servidor — trata como
    // sucesso e limpa do estado local, em vez de deixar o card preso na tela.
    patients.value = patients.value.filter((p) => p.id !== id);
  }

  return {
    patients,
    loading,
    error,
    computedPatients,
    fetchPatients,
    fetchPatient,
    addPatient,
    updatePatient,
    updatePatientStatus,
    removePatient,
  };
}
