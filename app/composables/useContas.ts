import { useState } from "#app";
import type { AdminUserSummary, UpdateUserRoleDTO } from "#shared/types/auth";
import type { Role } from "#shared/utils/rbac";
import type { ConsultorNome } from "#shared/types/Patient";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";

export interface NovaContaDTO {
  email: string;
  password: string;
  role: Role;
  consultorNome?: ConsultorNome;
  nome: string;
}

export function useContas() {
  const contas = useState<AdminUserSummary[]>("contas", () => []);
  const loading = useState<boolean>("contas-loading", () => false);
  const error = useState<string | null>("contas-error", () => null);

  async function fetchContas(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      contas.value = await apiFetch<AdminUserSummary[]>("/api/admin/users", undefined, "Falha ao carregar contas.");
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function criarConta(input: NovaContaDTO): Promise<AdminUserSummary> {
    const created = await apiFetch<AdminUserSummary>(
      "/api/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao criar conta."
    );
    // O POST devolve só {id, email, role, consultorNome} — sem createdAt/lastSignInAt
    // que a tabela precisa. Por isso refetch completo, não inserção in-place.
    await fetchContas();
    return created;
  }

  async function atualizarConta(id: string, input: UpdateUserRoleDTO): Promise<void> {
    const updated = await apiFetch<AdminUserSummary>(
      `/api/admin/users/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao atualizar conta."
    );
    const i = contas.value.findIndex((c) => c.id === id);
    if (i !== -1) contas.value[i] = updated;
  }

  async function excluirConta(id: string): Promise<void> {
    await deleteTolerant(`/api/admin/users/${id}`, "Erro ao excluir conta.");
    contas.value = contas.value.filter((c) => c.id !== id);
  }

  async function redefinirSenha(id: string, password: string): Promise<void> {
    await apiFetch<void>(
      `/api/admin/users/${id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      "Erro ao redefinir senha."
    );
  }

  return {
    contas,
    loading,
    error,
    fetchContas,
    criarConta,
    atualizarConta,
    excluirConta,
    redefinirSenha,
  };
}
