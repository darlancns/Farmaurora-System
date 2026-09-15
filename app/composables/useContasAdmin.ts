import { computed, ref } from "vue";
import type { AdminUserSummary } from "#shared/types/auth";
import type { Role } from "#shared/utils/rbac";
import type { ConsultorNome } from "#shared/types/Patient";
import { useContas, type NovaContaDTO } from "./useContas";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/errorMessages";

export function useContasAdmin() {
  const { contas, loading, error, fetchContas, criarConta, atualizarConta, excluirConta, redefinirSenha } =
    useContas();
  const { showToast } = useToast();

  // nome do consultor -> e-mail da conta que já o usa (aviso, não bloqueio)
  const consultoresEmUso = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const conta of contas.value) {
      if (conta.role === "consultor" && conta.consultorNome) {
        map[conta.consultorNome] = conta.email;
      }
    }
    return map;
  });

  // ---- Modal criar/editar --------------------------------------------------
  const showFormModal = ref(false);
  const editingConta = ref<AdminUserSummary | null>(null);
  const formBusy = ref(false);

  function abrirNovaConta(): void {
    editingConta.value = null;
    showFormModal.value = true;
  }
  function abrirEdicao(conta: AdminUserSummary): void {
    editingConta.value = conta;
    showFormModal.value = true;
  }
  function fecharFormModal(): void {
    showFormModal.value = false;
    editingConta.value = null;
    formBusy.value = false;
  }

  // Senha exibida UMA vez após criar/redefinir — para o admin copiar e repassar.
  const revelacao = ref<{ email: string; password: string } | null>(null);

  async function handleCreate(payload: NovaContaDTO): Promise<void> {
    formBusy.value = true;
    try {
      const criada = await criarConta(payload);
      revelacao.value = { email: criada.email, password: payload.password };
      showToast("Conta criada");
      fecharFormModal();
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao criar conta"));
      formBusy.value = false;
    }
  }

  async function handleUpdate(
    id: string,
    payload: { role: Role; consultorNome?: ConsultorNome; nome?: string },
  ): Promise<void> {
    formBusy.value = true;
    try {
      await atualizarConta(id, payload);
      showToast("Conta atualizada");
      fecharFormModal();
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao atualizar conta"));
      formBusy.value = false;
    }
  }

  // ---- Excluir -----------------------------------------------------------
  const contaParaExcluir = ref<AdminUserSummary | null>(null);

  async function confirmarExclusao(): Promise<void> {
    const conta = contaParaExcluir.value;
    contaParaExcluir.value = null;
    if (!conta) return;
    try {
      await excluirConta(conta.id);
      showToast("Conta excluída");
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao excluir conta"));
    }
  }

  // ---- Redefinir senha -------------------------------------------------
  const resetConta = ref<AdminUserSummary | null>(null);
  const resetBusy = ref(false);

  function abrirReset(conta: AdminUserSummary): void {
    resetConta.value = conta;
  }
  function fecharReset(): void {
    resetConta.value = null;
    resetBusy.value = false;
  }
  async function confirmarReset(password: string): Promise<void> {
    const conta = resetConta.value;
    if (!conta) return;
    resetBusy.value = true;
    try {
      await redefinirSenha(conta.id, password);
      revelacao.value = { email: conta.email, password };
      showToast("Senha redefinida");
      fecharReset();
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao redefinir senha"));
      resetBusy.value = false;
    }
  }

  async function copiarSenha(): Promise<void> {
    if (!revelacao.value) return;
    try {
      await navigator.clipboard.writeText(revelacao.value.password);
      showToast("Senha copiada");
    } catch {
      showToast("Não foi possível copiar automaticamente");
    }
  }

  return {
    contas,
    loading,
    error,
    fetchContas,
    consultoresEmUso,
    showFormModal,
    editingConta,
    formBusy,
    abrirNovaConta,
    abrirEdicao,
    fecharFormModal,
    handleCreate,
    handleUpdate,
    contaParaExcluir,
    confirmarExclusao,
    resetConta,
    resetBusy,
    abrirReset,
    fecharReset,
    confirmarReset,
    revelacao,
    copiarSenha,
  };
}
