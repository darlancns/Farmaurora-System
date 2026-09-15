import { useState } from "#app";
import type { ContaSummary } from "#shared/types/auth";
import { apiFetch } from "../utils/apiFetch";

// Só leitura — alimenta o seletor de destinatário "Pessoa específica" de
// Recados (GET /api/contas, aberto a qualquer cargo autenticado). Nome
// diferente de useContas.ts (admin, criar/editar/excluir conta) de propósito,
// pra não colidir: são fontes/escopos diferentes, mesmo que os dados se
// sobreponham.
export function useContasSelecao() {
  const contas = useState<ContaSummary[]>("contas-selecao", () => []);
  const loading = useState<boolean>("contas-selecao-loading", () => false);
  const error = useState<string | null>("contas-selecao-error", () => null);

  async function fetchContas(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      contas.value = await apiFetch<ContaSummary[]>("/api/contas", undefined, "Falha ao carregar contas.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  return { contas, loading, error, fetchContas };
}
