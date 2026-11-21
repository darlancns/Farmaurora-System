import { useState } from "#app";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import type { Dir, DirPatchDTO, NewDirDTO } from "#shared/types/dir";

// Mesmo molde de useProcessos.ts: módulo singleton só populado a partir de onMounted()
// (client-only), então nada vaza entre requests de SSR.
let fetchPromise: Promise<void> | null = null;
let lastFetchedAt = 0;
const RECENT_FETCH_WINDOW_MS = 5000;

export function useDir() {
  const registros = useState<Dir[]>("dir", () => []);
  const loading = useState<boolean>("dir-loading", () => false);
  const error = useState<string | null>("dir-error", () => null);

  function fetchDir(): Promise<void> {
    if (fetchPromise) return fetchPromise;
    if (Date.now() - lastFetchedAt < RECENT_FETCH_WINDOW_MS) return Promise.resolve();

    loading.value = true;
    error.value = null;
    fetchPromise = (async () => {
      try {
        registros.value = await apiFetch<Dir[]>("/api/dir", undefined, "Falha ao carregar a DIR.");
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

  return { registros, loading, error, fetchDir, addDir, patchDir, removeDir };
}
