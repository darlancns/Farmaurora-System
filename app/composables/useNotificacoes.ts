import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { Notificacao } from "#shared/types/notificacao";
import { apiFetch } from "../utils/apiFetch";

// Só a fonte de notificações de Recados (tabela `notificacoes`). Agregar com
// os alertas de Fornecedor (calculados on-the-fly, sem tabela — ver
// app/utils/prazoFornecedor.ts) fica pra Fase C, no componente de sino
// global — não travar este composable numa decisão de layout ainda em aberto.
export function useNotificacoes() {
  const notificacoes = useState<Notificacao[]>("notificacoes", () => []);
  const loading = useState<boolean>("notificacoes-loading", () => false);
  const error = useState<string | null>("notificacoes-error", () => null);

  async function fetchNotificacoes(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      notificacoes.value = await apiFetch<Notificacao[]>(
        "/api/notificacoes",
        undefined,
        "Falha ao carregar notificações.",
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function marcarComoLida(id: string): Promise<void> {
    await apiFetch<{ lida: true }>(
      `/api/notificacoes/${id}/lida`,
      { method: "PATCH" },
      "Erro ao marcar notificação como lida.",
    );
    const i = notificacoes.value.findIndex((n) => n.id === id);
    const atual = notificacoes.value[i];
    if (atual) notificacoes.value[i] = { ...atual, lida: true };
  }

  // Pro badge do sino global (Fase C).
  const naoLidas: ComputedRef<number> = computed(() => notificacoes.value.filter((n) => !n.lida).length);

  return { notificacoes, loading, error, fetchNotificacoes, marcarComoLida, naoLidas };
}
