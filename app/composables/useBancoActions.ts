import { computed, ref, type ComputedRef } from "vue";
import type {
  AtualizarCotacaoDTO,
  AtualizarLancamentoBancoDTO,
  BancoCambio,
  LancamentoBanco,
  LoteBanco,
  Moeda,
  NovoLancamentoBancoDTO,
  TaxaLancamentoRendimento,
} from "#shared/types/Pagamento";
import { usePagamentos } from "./usePagamentos";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/errorMessages";

// Handlers de Banco/Lote da página de Pagamentos (Round 9a, Passo 1) — extraídos
// de app/pages/pagamentos.vue sem mudar nenhuma linha de lógica.
export function useBancoActions(readonly: ComputedRef<boolean>) {
  const {
    criarLancamentoBanco,
    editarLancamentoBanco,
    excluirLancamentoBanco,
    salvarTaxasCotacao,
    escolherBanco,
    escolherBancoRendimento,
    fecharLoteBanco,
    editarLancamentoRealizado,
  } = usePagamentos();
  const { showToast, withToast } = useToast();

  const showLancamentoModal = ref(false);
  const editingLancamento = ref<LancamentoBanco | null>(null);
  const deletingLancamento = ref<LancamentoBanco | null>(null);
  // Destino de um novo lançamento: "+ Novo lote" (força lote novo, moeda livre) ou
  // "+ Lançamento" de um card (loteId fixo, moeda travada). null quando o modal
  // está fechado ou em modo edição.
  const novoLancamentoAlvo = ref<{ forcarLoteNovo: true } | { loteId: string; moeda: Moeda } | null>(
    null,
  );

  const moedaFixaLancamento = computed<Moeda | null>(() =>
    novoLancamentoAlvo.value && "loteId" in novoLancamentoAlvo.value
      ? novoLancamentoAlvo.value.moeda
      : null,
  );

  function abrirNovoLote(): void {
    if (readonly.value) return;
    editingLancamento.value = null;
    novoLancamentoAlvo.value = { forcarLoteNovo: true };
    showLancamentoModal.value = true;
  }

  function abrirLancamentoEmLote(loteId: string, moeda: Moeda): void {
    if (readonly.value) return;
    editingLancamento.value = null;
    novoLancamentoAlvo.value = { loteId, moeda };
    showLancamentoModal.value = true;
  }

  function fecharLancamentoModal(): void {
    showLancamentoModal.value = false;
    editingLancamento.value = null;
    novoLancamentoAlvo.value = null;
  }

  function handleEditarLancamento(lancamento: LancamentoBanco): void {
    if (readonly.value) return;
    editingLancamento.value = lancamento;
    novoLancamentoAlvo.value = null;
    showLancamentoModal.value = true;
  }

  async function handleUpdateLancamento(id: string, payload: AtualizarLancamentoBancoDTO): Promise<void> {
    await withToast(
      async () => {
        await editarLancamentoBanco(id, payload);
        fecharLancamentoModal();
      },
      "Lançamento atualizado",
      "Erro ao editar lançamento",
    );
  }

  async function handleConfirmExcluirLancamento(): Promise<void> {
    const alvo = deletingLancamento.value;
    if (!alvo) return;
    try {
      await excluirLancamentoBanco(alvo.id);
      showToast("Lançamento excluído");
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao excluir lançamento"));
    } finally {
      deletingLancamento.value = null;
    }
  }

  async function handleNovoLancamento(payload: NovoLancamentoBancoDTO): Promise<void> {
    const alvo = novoLancamentoAlvo.value;
    const dto: NovoLancamentoBancoDTO =
      alvo && "loteId" in alvo
        ? { ...payload, loteId: alvo.loteId }
        : { ...payload, forcarLoteNovo: true };
    await withToast(
      async () => {
        await criarLancamentoBanco(dto);
        fecharLancamentoModal();
      },
      alvo && "loteId" in alvo ? "Lançamento adicionado" : "Lote criado com o lançamento",
      "Erro ao adicionar lançamento",
    );
  }

  async function handleSalvarTaxas(
    loteId: string,
    opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>
  ): Promise<void> {
    try {
      // Auto-save silencioso — o feedback é o total/diferença atualizando na tela.
      await salvarTaxasCotacao(loteId, opcoes);
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao salvar taxas"));
    }
  }

  // Retornam Promise<boolean> (não void, como o restante dos handlers com toast)
  // porque CotacaoTab.vue precisa AGUARDAR o resultado antes de fechar o modal
  // de fechamento por ordem / reabilitar o botão "Usar este banco" — por isso
  // são passados como prop (função), não como listener de evento.
  async function handleEscolherBanco(
    loteId: string,
    banco: BancoCambio,
    opcoes?: AtualizarCotacaoDTO["opcoes"]
  ): Promise<boolean> {
    try {
      await escolherBanco(loteId, banco, opcoes);
      showToast("Banco escolhido — lançamentos convertidos para reais");
      return true;
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao escolher banco"));
      return false;
    }
  }

  async function handleEscolherBancoRendimento(
    loteId: string,
    opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>,
    taxas: TaxaLancamentoRendimento[]
  ): Promise<boolean> {
    try {
      await escolherBancoRendimento(loteId, opcoes, taxas);
      showToast("Rendimento escolhido — cada ordem convertida pela sua taxa");
      return true;
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao escolher banco"));
      return false;
    }
  }

  async function handleFecharLote(loteId: string): Promise<void> {
    await withToast(
      () => fecharLoteBanco(loteId),
      "Lote pago e movido para realizados",
      "Erro ao marcar o lote como pago",
    );
  }

  // ── Editar cliente + data de pagamento de um lançamento já realizado ─────
  // cliente é escopo do LANÇAMENTO clicado; pagoEm é escopo do LOTE inteiro
  // (mesmo comportamento que pagoEm sempre teve — afeta todas as linhas do lote).
  const editingLancamentoRealizado = ref<{ lancamentoId: string; cliente: string; pagoEm: string } | null>(
    null,
  );

  function handleEditarLancamentoRealizado(lancamento: LancamentoBanco, lote: LoteBanco): void {
    if (readonly.value) return;
    if (!lote.pagoEm) return;
    editingLancamentoRealizado.value = {
      lancamentoId: lancamento.id,
      cliente: lancamento.cliente,
      pagoEm: lote.pagoEm,
    };
  }

  async function handleSalvarLancamentoRealizado(payload: { nome: string; pagoEm: string }): Promise<void> {
    const alvo = editingLancamentoRealizado.value;
    if (!alvo) return;
    await withToast(
      async () => {
        await editarLancamentoRealizado(alvo.lancamentoId, payload.nome, payload.pagoEm);
        editingLancamentoRealizado.value = null;
      },
      "Pagamento atualizado",
      "Erro ao editar o pagamento",
    );
  }

  return {
    showLancamentoModal,
    editingLancamento,
    deletingLancamento,
    novoLancamentoAlvo,
    moedaFixaLancamento,
    editingLancamentoRealizado,
    abrirNovoLote,
    abrirLancamentoEmLote,
    fecharLancamentoModal,
    handleEditarLancamento,
    handleUpdateLancamento,
    handleConfirmExcluirLancamento,
    handleNovoLancamento,
    handleSalvarTaxas,
    handleEscolherBanco,
    handleEscolherBancoRendimento,
    handleFecharLote,
    handleEditarLancamentoRealizado,
    handleSalvarLancamentoRealizado,
  };
}
