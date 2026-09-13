import { useState } from "#app";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { NewProcessoDTO, Processo } from "#shared/types/processo";

export function useProcessos() {
  const processos = useState<Processo[]>("processos", () => []);
  const loading = useState<boolean>("processos-loading", () => false);
  const error = useState<string | null>("processos-error", () => null);

  async function fetchProcessos(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      processos.value = await apiFetch<Processo[]>("/api/processos", undefined, "Falha ao carregar processos.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function addProcesso(input: NewProcessoDTO): Promise<Processo> {
    const created = await apiFetch<Processo>(
      "/api/processos",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao criar processo."
    );
    processos.value = [created, ...processos.value];
    return created;
  }

  async function patchProcesso(id: string, patch: Partial<NewProcessoDTO>): Promise<Processo> {
    const updated = await apiFetch<Processo>(
      `/api/processos/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
      "Erro ao atualizar processo."
    );
    const index = processos.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      processos.value[index] = updated;
    }
    return updated;
  }

  async function removeProcesso(id: string): Promise<void> {
    await deleteTolerant(`/api/processos/${id}`, "Erro ao remover processo.");
    // 404 significa que o processo já não existe no servidor — trata como
    // sucesso e limpa do estado local, em vez de deixar a linha presa na tela.
    processos.value = processos.value.filter((p) => p.id !== id);
  }

  return {
    processos,
    loading,
    error,
    fetchProcessos,
    addProcesso,
    patchProcesso,
    removeProcesso,
  };
}
