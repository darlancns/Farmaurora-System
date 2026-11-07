import { useState } from "#app";
import { ApiError, apiFetch, deleteTolerant } from "../utils/apiFetch";
import {
  ConflitoVersaoError,
  criarGravadorAtualizacoes,
  type AlteracaoAtualizacoes,
} from "../utils/gravadorAtualizacoes";
import type { AtualizacaoProcesso, NewProcessoDTO, Processo, ProcessoPatchDTO } from "#shared/types/processo";

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
// Fila de gravações das atualizações, por processo — uma só por app (módulo), mesmo que vários
// componentes chamem useProcessos().
const filasAtualizacoes = new Map<string, Promise<unknown>>();

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

  async function patchProcesso(id: string, patch: ProcessoPatchDTO): Promise<Processo> {
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

  // Recarrega UM processo do servidor (usado após um 409). Se ele sumiu (404), tira da lista local.
  async function recarregarProcesso(id: string): Promise<void> {
    try {
      const atual = await apiFetch<Processo>(`/api/processos/${id}`, undefined, "Erro ao recarregar processo.");
      const index = processos.value.findIndex((p) => p.id === id);
      if (index !== -1) processos.value[index] = atual;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        processos.value = processos.value.filter((p) => p.id !== id);
        return;
      }
      throw e;
    }
  }

  const gravarAtualizacoes = criarGravadorAtualizacoes({
    obter: (id) => processos.value.find((p) => p.id === id),
    enviar: async (id, atualizacoes: AtualizacaoProcesso[], versao) => {
      try {
        return await apiFetch<Processo>(
          `/api/processos/${id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // `versao` é o updatedAt como veio do servidor — string opaca, sem passar por Date.
            body: JSON.stringify({ atualizacoes, versao }),
          },
          "Erro ao atualizar processo."
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) throw new ConflitoVersaoError();
        throw e;
      }
    },
    aplicar: (atualizado) => {
      const index = processos.value.findIndex((p) => p.id === atualizado.id);
      if (index !== -1) processos.value[index] = atualizado;
    },
    recarregar: recarregarProcesso,
  }, filasAtualizacoes);

  // ÚNICO caminho de gravação das atualizações (adicionar/editar/excluir): fila por processo +
  // conferência de versão. `alterar` recebe a lista mais recente e devolve a nova (ou null).
  function alterarAtualizacoes(id: string, alterar: AlteracaoAtualizacoes): Promise<Processo> {
    return gravarAtualizacoes(id, alterar);
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
    alterarAtualizacoes,
    recarregarProcesso,
    removeProcesso,
  };
}
