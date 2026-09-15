import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { NewRecadoDTO, Recado, RecadoUpdateDTO } from "#shared/types/recado";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import { dividirRecados } from "../utils/recadosFiltros";
import { useAuth } from "./useAuth";

export function useRecados() {
  const recados = useState<Recado[]>("recados", () => []);
  const loading = useState<boolean>("recados-loading", () => false);
  const error = useState<string | null>("recados-error", () => null);
  const { user } = useAuth();

  async function fetchRecados(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      recados.value = await apiFetch<Recado[]>("/api/recados", undefined, "Falha ao carregar recados.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function criarRecado(input: NewRecadoDTO): Promise<Recado> {
    const created = await apiFetch<Recado>(
      "/api/recados",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      "Erro ao criar recado.",
    );
    recados.value = [created, ...recados.value];
    return created;
  }

  async function atualizarRecado(id: string, input: RecadoUpdateDTO): Promise<Recado> {
    const updated = await apiFetch<Recado>(
      `/api/recados/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      "Erro ao atualizar recado.",
    );
    const i = recados.value.findIndex((r) => r.id === id);
    if (i !== -1) recados.value[i] = updated;
    return updated;
  }

  async function excluirRecado(id: string): Promise<void> {
    await deleteTolerant(`/api/recados/${id}`, "Erro ao excluir recado.");
    recados.value = recados.value.filter((r) => r.id !== id);
  }

  // Atualiza só o campo calculado no item local — evita refetch completo da
  // lista pra uma ação de 1 linha (mesmo espírito de patchProcesso, mas sem
  // round-trip: a resposta do endpoint já é só {fixado}/{concluido}).
  async function toggleFixar(id: string): Promise<void> {
    const { fixado } = await apiFetch<{ fixado: boolean }>(
      `/api/recados/${id}/fixar`,
      { method: "POST" },
      "Erro ao fixar recado.",
    );
    const i = recados.value.findIndex((r) => r.id === id);
    const atual = recados.value[i];
    if (atual) recados.value[i] = { ...atual, fixadoPorMim: fixado };
  }

  // Concluir é individual e definitivo (sem "desconcluir") — depois desta
  // chamada o item some de `todos`/`recebidos`/`enviados` (ver dividirRecados).
  async function concluirRecado(id: string): Promise<void> {
    await apiFetch<{ concluido: true }>(`/api/recados/${id}/concluir`, { method: "POST" }, "Erro ao concluir recado.");
    const i = recados.value.findIndex((r) => r.id === id);
    const atual = recados.value[i];
    if (atual) recados.value[i] = { ...atual, concluidoPorMim: true };
  }

  // Divisão em abas (Todos/Recebidos/Enviados) fica aqui, não na página —
  // lógica pura extraída em app/utils/recadosFiltros.ts (testável sem Nuxt).
  const divididos = computed(() => dividirRecados(recados.value, user.value?.id ?? null));
  const todos: ComputedRef<Recado[]> = computed(() => divididos.value.todos);
  const recebidos: ComputedRef<Recado[]> = computed(() => divididos.value.recebidos);
  const enviados: ComputedRef<Recado[]> = computed(() => divididos.value.enviados);

  return {
    recados,
    loading,
    error,
    fetchRecados,
    criarRecado,
    atualizarRecado,
    excluirRecado,
    toggleFixar,
    concluirRecado,
    todos,
    recebidos,
    enviados,
  };
}
