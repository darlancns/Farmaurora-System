import { nextTick, ref } from "vue";
import type { TipoGrupoPagamento } from "#shared/types/Pagamento";

// Confirmação antes de "Pago" (lote do Banco e grupos): UMA janela só pra tela, aberta pelo botão "Pago" de qualquer
// lote/grupo. Só decide se o handler EXISTENTE (fechar lote / pagar grupo) é chamado — nenhuma regra de pagamento
// mora aqui.
export type AlvoPagamento = "LOTE" | TipoGrupoPagamento;

// O que os componentes emitem ao clicar em "Pago": id do lote/grupo e os textos montados com valores da tela.
export interface PedidoPagamento {
  id: string;
  titulo: string;
  mensagem: string;
}

export interface PagamentoPendente extends PedidoPagamento {
  alvo: AlvoPagamento;
}

interface Opcoes {
  // Chama o handler existente (handleFecharLote / handlePagarGrupo). Ele engole o erro e mostra o toast.
  executar: (pendente: PagamentoPendente) => Promise<void>;
  // O lote/grupo continua em aberto depois de executar? (handleX não relança o erro: é assim que se sabe se deu certo.)
  continuaAberto: (pendente: PagamentoPendente) => boolean;
}

function idBotaoPago(p: PagamentoPendente): string {
  return p.alvo === "LOTE" ? `btn-pagar-lote-${p.id}` : `btn-pagar-grupo-${p.id}`;
}

export function usePagamentoConfirmacao({ executar, continuaAberto }: Opcoes) {
  const pendente = ref<PagamentoPendente | null>(null);
  const confirmando = ref(false);

  function pedir(alvo: AlvoPagamento, pedido: PedidoPagamento): void {
    if (confirmando.value) return;
    pendente.value = { alvo, ...pedido };
  }

  // Cancelar, Esc e toque fora: fecha sem chamar nada e devolve o foco ao botão "Pago" de origem.
  function cancelar(): void {
    if (confirmando.value) return;
    const p = pendente.value;
    pendente.value = null;
    if (p) void nextTick(() => document.getElementById(idBotaoPago(p))?.focus());
  }

  async function confirmar(): Promise<void> {
    const p = pendente.value;
    // `confirmando` sobe antes de qualquer await: dois cliques rápidos não disparam duas chamadas.
    if (!p || confirmando.value) return;
    confirmando.value = true;
    try {
      await executar(p);
    } finally {
      confirmando.value = false;
    }
    // Sucesso: o item foi pra "realizados" e a janela fecha. Erro: o toast de erro já apareceu e a janela fica
    // aberta, com o botão liberado pra tentar de novo.
    if (!continuaAberto(p)) pendente.value = null;
  }

  return { pendente, confirmando, pedir, cancelar, confirmar };
}
