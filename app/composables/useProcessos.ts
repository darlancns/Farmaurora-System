import { useState } from "#app";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { NewProcessoDTO, Processo } from "#shared/types/processo";

// Módulo é singleton no bundle client — mesmo efeito de um useState, mas não
// precisa ser serializado no payload SSR. Só é populado a partir de
// onMounted() (client-only), então não há risco de vazar entre requests SSR
// distintos: nada aqui roda durante a renderização de servidor.
let fetchPromise: Promise<void> | null = null;
let lastFetchedAt = 0;
// Janela de reaproveitamento: se processos.vue e o NotificacaoBell (global,
// em toda página) chamarem fetchProcessos() quase ao mesmo tempo — ou em
// sequência rápida — a 2ª chamada reaproveita o resultado recém-buscado em
// vez de repetir a requisição de rede.
const RECENT_FETCH_WINDOW_MS = 5000;

export function useProcessos() {
  const processos = useState<Processo[]>("processos", () => []);
  const loading = useState<boolean>("processos-loading", () => false);
  const error = useState<string | null>("processos-error", () => null);

  function fetchProcessos(): Promise<void> {
    // 1) Já tem uma busca em voo? Reaproveita a mesma promise (o chamador
    //    pode até dar await nela, ao contrário do "return" mudo de antes).
    if (fetchPromise) return fetchPromise;

    // 2) Buscou há poucos segundos? Não vale a pena repetir — o estado
    //    compartilhado já está fresco o suficiente pro 2º chamador.
    if (Date.now() - lastFetchedAt < RECENT_FETCH_WINDOW_MS) return Promise.resolve();

    loading.value = true;
    error.value = null;
    fetchPromise = (async () => {
      try {
        processos.value = await apiFetch<Processo[]>("/api/processos", undefined, "Falha ao carregar processos.");
        lastFetchedAt = Date.now();
      } catch (e) {
        error.value = e instanceof Error ? e.message : "Erro desconhecido.";
      } finally {
        loading.value = false;
        fetchPromise = null;
      }
    })();
    return fetchPromise;
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
