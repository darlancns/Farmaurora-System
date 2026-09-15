import { useState } from "#app";
import type { LembretePessoal, LembreteUpdateDTO, NewLembreteDTO } from "#shared/types/lembretePessoal";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";

// Aba "Meus" — CRUD simples, sempre escopado ao próprio usuário no server
// (ver server/utils/lembretesPessoaisStore.ts). `fixado`/`concluido` são
// colunas diretas na própria linha (não uma tabela de junção como em
// Recado), então fixar/concluir aqui é só um atualizarLembrete(id, {fixado})
// ou (id, {concluido}) normal — sem endpoints/ações separadas.
export function useLembretesPessoais() {
  const lembretes = useState<LembretePessoal[]>("lembretes-pessoais", () => []);
  const loading = useState<boolean>("lembretes-pessoais-loading", () => false);
  const error = useState<string | null>("lembretes-pessoais-error", () => null);

  async function fetchLembretes(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      lembretes.value = await apiFetch<LembretePessoal[]>("/api/lembretes", undefined, "Falha ao carregar lembretes.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function criarLembrete(input: NewLembreteDTO): Promise<LembretePessoal> {
    const created = await apiFetch<LembretePessoal>(
      "/api/lembretes",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      "Erro ao criar lembrete.",
    );
    lembretes.value = [created, ...lembretes.value];
    return created;
  }

  async function atualizarLembrete(id: string, patch: LembreteUpdateDTO): Promise<LembretePessoal> {
    const updated = await apiFetch<LembretePessoal>(
      `/api/lembretes/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
      "Erro ao atualizar lembrete.",
    );
    const i = lembretes.value.findIndex((l) => l.id === id);
    if (i !== -1) lembretes.value[i] = updated;
    return updated;
  }

  async function excluirLembrete(id: string): Promise<void> {
    await deleteTolerant(`/api/lembretes/${id}`, "Erro ao excluir lembrete.");
    lembretes.value = lembretes.value.filter((l) => l.id !== id);
  }

  return {
    lembretes,
    loading,
    error,
    fetchLembretes,
    criarLembrete,
    atualizarLembrete,
    excluirLembrete,
  };
}
