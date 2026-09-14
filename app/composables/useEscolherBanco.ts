import { ref } from "vue";
import type {
  AtualizarCotacaoDTO,
  BancoCambio,
  LancamentoBanco,
  LoteBanco,
  TaxaLancamentoRendimento,
} from "#shared/types/Pagamento";
import { parseBrCurrency } from "../utils/formatters";
import type { CotacaoDraft } from "../types/cotacao";

// Extraído de CotacaoTab.vue (Round 9) — regra de "usar este banco": XP/Intex
// direto; Rendimento com 1 pendente aplica direto (sem variação possível);
// Rendimento com 2+ pendentes abre o modal de fechamento por ordem.
// Comportamento preservado exatamente como estava; nada foi corrigido aqui,
// mesmo onde algo pareça estranho (ver achados no relatório da extração).

export interface UseEscolherBancoOptions {
  // Mesmo conjunto filtrado que o template usa (empresa + ainda não pago) —
  // não recalcula o filtro aqui pra não duplicar a regra de lotesAbertos.
  lotesAbertos: () => LoteBanco[];
  lancamentosDoLote: (loteId: string) => LancamentoBanco[];
  drafts: Record<string, CotacaoDraft[]>;
  draftDo: (loteId: string, banco: BancoCambio) => CotacaoDraft;
  draftToOpcoes: (loteId: string) => NonNullable<AtualizarCotacaoDTO["opcoes"]>;
  parseTaxa: (str: string) => number | null;
  readonly: () => boolean;
  // Cancela (sem disparar) o autosave debounced pendente do lote — mesmo
  // efeito do bloco original no início de escolher().
  cancelarAutoSave: (loteId: string) => void;
  salvarTaxas: (loteId: string, opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>) => void;
  escolherBanco: (
    loteId: string,
    banco: BancoCambio,
    opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>,
  ) => Promise<boolean>;
  escolherBancoRendimento: (
    loteId: string,
    opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>,
    taxas: TaxaLancamentoRendimento[],
  ) => Promise<boolean>;
}

export interface ModalRendimentoState {
  loteId: string;
  moeda: LoteBanco["moeda"];
  lancamentos: LancamentoBanco[];
  corretagem: number;
}

export function useEscolherBanco(options: UseEscolherBancoOptions) {
  // Fechamento por ordem (Rendimento): o modal fica aberto com os pendentes do lote.
  const modalRendimento = ref<ModalRendimentoState | null>(null);
  const rendimentoSalvando = ref(false);
  const rendimentoErro = ref<string | null>(null);

  // Banco/lote com uma escolha em voo (fora do modal — XP/Intex, e Rendimento
  // direto de 1 pendente). Desabilita o botão e troca o texto pra "Salvando..."
  // até a Promise resolver, evitando duplo clique e a falsa sensação de "nada
  // aconteceu" enquanto a requisição está em andamento.
  const salvando = ref<{ loteId: string; banco: BancoCambio } | null>(null);

  function fecharModalRendimento(): void {
    modalRendimento.value = null;
    rendimentoErro.value = null;
  }

  // "Usar este banco" grava o rascunho e escolhe o banco numa tacada só.
  // Rendimento fecha por ordem e abre o modal — MENOS quando há um só pendente:
  // aí não há variação possível, aplica a taxa do card direto (igual XP/Intex).
  async function escolher(loteId: string, banco: BancoCambio): Promise<void> {
    options.cancelarAutoSave(loteId);

    if (banco === "RENDIMENTO") {
      const lote = options.lotesAbertos().find((l) => l.id === loteId);
      if (!lote) return;
      // Persiste taxa de referência/corretagem digitadas antes de abrir o modal
      // (paridade com XP/Intex, que salvam ao clicar "Usar este banco").
      options.salvarTaxas(loteId, options.draftToOpcoes(loteId));
      const pendentes = options.lancamentosDoLote(loteId).filter((l) => l.valorReais === null);

      if (pendentes.length === 1) {
        const taxa = options.parseTaxa(options.draftDo(loteId, "RENDIMENTO").taxaStr);
        if (taxa === null) return; // botão só habilita com a taxa preenchida
        salvando.value = { loteId, banco };
        try {
          await options.escolherBancoRendimento(loteId, options.draftToOpcoes(loteId), [
            { lancamentoId: pendentes[0]!.id, taxa },
          ]);
        } finally {
          salvando.value = null;
        }
        return;
      }

      const corretagem = parseBrCurrency(options.draftDo(loteId, "RENDIMENTO").corretagemStr) || 0;
      rendimentoErro.value = null;
      modalRendimento.value = {
        loteId,
        moeda: lote.moeda,
        lancamentos: pendentes,
        corretagem,
      };
      return;
    }

    salvando.value = { loteId, banco };
    try {
      await options.escolherBanco(loteId, banco, options.draftToOpcoes(loteId));
    } finally {
      salvando.value = null;
    }
  }

  // Só fecha o modal DEPOIS que a escolha for confirmada pelo servidor (o
  // `await` aqui é o ponto central do fix — antes o modal fechava assim que o
  // evento era emitido, sem esperar a resposta). Em caso de erro, mantém o
  // modal aberto com uma mensagem inline (o toast de erro do pai já dispara
  // também) e libera o botão pra nova tentativa.
  async function confirmarRendimento(taxas: TaxaLancamentoRendimento[]): Promise<void> {
    const alvo = modalRendimento.value;
    if (!alvo) return;
    rendimentoSalvando.value = true;
    rendimentoErro.value = null;
    const ok = await options.escolherBancoRendimento(alvo.loteId, options.draftToOpcoes(alvo.loteId), taxas);
    rendimentoSalvando.value = false;
    if (ok) {
      modalRendimento.value = null;
    } else {
      rendimentoErro.value = "Não foi possível confirmar o fechamento. Tente novamente.";
    }
  }

  function podeEscolher(lote: LoteBanco, banco: BancoCambio): boolean {
    if (options.readonly()) return false;
    if (salvando.value?.loteId === lote.id) return false;
    const d = options.drafts[lote.id]?.find((x) => x.banco === banco);
    return !!d && options.parseTaxa(d.taxaStr) !== null;
  }

  return {
    modalRendimento,
    rendimentoSalvando,
    rendimentoErro,
    salvando,
    escolher,
    confirmarRendimento,
    fecharModalRendimento,
    podeEscolher,
  };
}
