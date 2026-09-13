import { ref, type ComputedRef } from "vue";
import type { NovoGrupoPagamentoDTO, StatusItemGrupo, TipoGrupoPagamento } from "#shared/types/Pagamento";
import { usePagamentos } from "./usePagamentos";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/errorMessages";

// Handlers de Grupo (Despachante/Transportadora) da página de Pagamentos
// (Round 9a, Passo 2) — extraídos de app/pages/pagamentos.vue sem mudar
// nenhuma linha de lógica.
export function useGrupoActions(readonly: ComputedRef<boolean>) {
  const {
    gruposDespachante,
    gruposTransportadora,
    criarGrupo,
    atualizarStatusItem,
    editarItemGrupo,
    excluirItemGrupo,
    pagarGrupo,
    salvarGrupoPix,
  } = usePagamentos();
  const { showToast } = useToast();

  // Padrão repetido: roda a ação, toast de sucesso; em erro, toast de erro. Não
  // relança. Handlers com sucesso silencioso ou com limpeza em `finally` (fecham
  // um ConfirmDialog dê certo ou não) não usam este helper.
  async function withToast(fn: () => Promise<void>, okMsg: string, errMsg: string): Promise<void> {
    try {
      await fn();
      showToast(okMsg);
    } catch (e) {
      showToast(getErrorMessage(e, errMsg));
    }
  }

  const showGrupoModal = ref(false);
  const grupoModalTipo = ref<TipoGrupoPagamento>("DESPACHANTE");

  function abrirGrupoModal(tipo: TipoGrupoPagamento): void {
    if (readonly.value) return;
    grupoModalTipo.value = tipo;
    showGrupoModal.value = true;
  }

  async function handleNovoGrupo(payload: Omit<NovoGrupoPagamentoDTO, "tipo">): Promise<void> {
    await withToast(
      async () => {
        await criarGrupo(grupoModalTipo.value, payload);
        showGrupoModal.value = false;
      },
      "Pagamento adicionado",
      "Erro ao adicionar pagamento",
    );
  }

  async function handleSalvarPix(nome: string, chavePix: string): Promise<void> {
    await withToast(
      () => salvarGrupoPix(grupoModalTipo.value, nome, chavePix),
      `Chave PIX salva para ${nome}`,
      "Erro ao salvar a chave PIX",
    );
  }

  async function handleCicloStatus(
    tipo: TipoGrupoPagamento,
    grupoId: string,
    index: number,
    status: StatusItemGrupo
  ): Promise<void> {
    try {
      await atualizarStatusItem(tipo, grupoId, index, status);
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao atualizar status"));
    }
  }

  async function handlePagarGrupo(tipo: TipoGrupoPagamento, grupoId: string): Promise<void> {
    await withToast(
      () => pagarGrupo(tipo, grupoId),
      "Grupo pago e movido para realizados",
      "Erro ao marcar o grupo como pago",
    );
  }

  // ── Editar / excluir item (paciente) de um grupo ──────────────────────────
  interface ItemEmEdicao {
    tipo: TipoGrupoPagamento;
    grupoId: string;
    index: number;
    paciente: string;
    valor: number;
  }
  const editandoItem = ref<ItemEmEdicao | null>(null);
  const excluindoItem = ref<{ tipo: TipoGrupoPagamento; grupoId: string; index: number; paciente: string } | null>(
    null,
  );

  function itemDe(tipo: TipoGrupoPagamento, grupoId: string, index: number) {
    const grupos = tipo === "DESPACHANTE" ? gruposDespachante.value : gruposTransportadora.value;
    return grupos.find((g) => g.id === grupoId)?.itens[index] ?? null;
  }

  function handleEditarItem(tipo: TipoGrupoPagamento, grupoId: string, index: number): void {
    if (readonly.value) return;
    const item = itemDe(tipo, grupoId, index);
    if (!item) return;
    editandoItem.value = { tipo, grupoId, index, paciente: item.paciente, valor: item.valor };
  }

  async function handleSalvarItem(payload: { paciente: string; valor: number }): Promise<void> {
    const alvo = editandoItem.value;
    if (!alvo) return;
    await withToast(
      async () => {
        await editarItemGrupo(alvo.tipo, alvo.grupoId, alvo.index, payload.paciente, payload.valor);
        editandoItem.value = null;
      },
      "Pagamento atualizado",
      "Erro ao editar o pagamento",
    );
  }

  function handleExcluirItem(tipo: TipoGrupoPagamento, grupoId: string, index: number): void {
    if (readonly.value) return;
    const item = itemDe(tipo, grupoId, index);
    if (!item) return;
    excluindoItem.value = { tipo, grupoId, index, paciente: item.paciente };
  }

  async function handleConfirmExcluirItem(): Promise<void> {
    const alvo = excluindoItem.value;
    if (!alvo) return;
    try {
      await excluirItemGrupo(alvo.tipo, alvo.grupoId, alvo.index);
      showToast("Pagamento excluído");
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao excluir o pagamento"));
    } finally {
      excluindoItem.value = null;
    }
  }

  return {
    showGrupoModal,
    grupoModalTipo,
    editandoItem,
    excluindoItem,
    abrirGrupoModal,
    handleNovoGrupo,
    handleSalvarPix,
    handleCicloStatus,
    handlePagarGrupo,
    handleEditarItem,
    handleSalvarItem,
    handleExcluirItem,
    handleConfirmExcluirItem,
  };
}
