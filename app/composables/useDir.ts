import { useState } from "#app";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { Dir, DirPatchDTO, NewDirDTO } from "#shared/types/dir";

// Mesmo molde de useProcessos.ts: módulo singleton só populado a partir de onMounted()
// (client-only), então nada vaza entre requests de SSR.
let fetchPromise: Promise<void> | null = null;
let lastFetchedAt = 0;
const RECENT_FETCH_WINDOW_MS = 5000;
// Cada leitura leva um número: depois de `invalidarDir` só a mais nova grava no estado (uma leitura que já estava voando, e é anterior a
// uma criação feita por outra tela, não pode devolver a lista velha por cima).
let leitura = 0;

/**
 * Esquece o cache de 5 s: a PRÓXIMA `fetchDir` lê de novo, mesmo que a última leitura seja recente ou ainda esteja em curso. Quem cria linhas
 * na DIR por fora da página (o Encaminhar da Compra) chama isto, para a linha aparecer ao abrir /dir.
 */
export function invalidarCacheDir(): void {
  lastFetchedAt = 0;
  fetchPromise = null;
}

export function useDir() {
  const registros = useState<Dir[]>("dir", () => []);
  const loading = useState<boolean>("dir-loading", () => false);
  const error = useState<string | null>("dir-error", () => null);

  function fetchDir(): Promise<void> {
    if (fetchPromise) return fetchPromise;
    if (Date.now() - lastFetchedAt < RECENT_FETCH_WINDOW_MS) return Promise.resolve();

    loading.value = true;
    error.value = null;
    const minha = ++leitura;
    const promessa: Promise<void> = (async () => {
      try {
        const lidas = await apiFetch<Dir[]>("/api/dir", undefined, "Falha ao carregar a DIR.");
        if (minha !== leitura) return;
        registros.value = lidas;
        lastFetchedAt = Date.now();
      } catch (e) {
        if (minha === leitura) error.value = e instanceof Error ? e.message : "Erro desconhecido.";
      } finally {
        if (minha === leitura) {
          loading.value = false;
          fetchPromise = null;
        }
      }
    })();
    fetchPromise = promessa;
    return promessa;
  }

  async function addDir(input: NewDirDTO): Promise<Dir> {
    const created = await apiFetch<Dir>(
      "/api/dir",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao criar o PO.",
    );
    registros.value = [created, ...registros.value];
    return created;
  }

  async function patchDir(id: string, patch: DirPatchDTO): Promise<Dir> {
    const updated = await apiFetch<Dir>(
      `/api/dir/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
      "Erro ao atualizar o PO.",
    );
    const index = registros.value.findIndex((d) => d.id === id);
    if (index !== -1) registros.value[index] = updated;
    return updated;
  }

  async function removeDir(id: string): Promise<void> {
    await deleteTolerant(`/api/dir/${id}`, "Erro ao remover o PO.");
    // 404 = já não existe no servidor: trata como sucesso e limpa do estado local.
    registros.value = registros.value.filter((d) => d.id !== id);
  }

  return { registros, loading, error, fetchDir, invalidarDir: invalidarCacheDir, addDir, patchDir, removeDir };
}
