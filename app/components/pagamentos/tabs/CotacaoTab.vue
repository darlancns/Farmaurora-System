<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type {
  AtualizarCotacaoDTO,
  BancoCambio,
  EmpresaPagamento,
  LancamentoBanco,
  LoteBanco,
  TaxaLancamentoRendimento,
} from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL } from "#shared/constants/pagamentos";
import { montarCotacao } from "../../../utils/pagamentoCalculations";
import { useCotacaoDrafts } from "../../../composables/useCotacaoDrafts";
import { useEscolherBanco } from "../../../composables/useEscolherBanco";
import CotacaoBancoCard from "../cards/CotacaoBancoCard.vue";
import FechamentoRendimentoModal from "../modals/FechamentoRendimentoModal.vue";

const props = withDefaults(
  defineProps<{
    empresa: EmpresaPagamento;
    lotes: LoteBanco[];
    lancamentos: LancamentoBanco[];
    readonly?: boolean;
    // Funções (não eventos) porque o componente precisa AGUARDAR o resultado
    // antes de fechar o modal/reabilitar o botão — um `emit` puro não devolve
    // o resultado da Promise do handler assíncrono do pai. Cada uma já mostra
    // o toast de sucesso/erro (pagamentos.vue) e devolve `true`/`false`.
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
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  "salvar-taxas": [loteId: string, opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>];
}>();

// Rascunho editável por lote (com merge de 3 vias contra o snapshot anterior
// e o dado novo do servidor) — ver useCotacaoDrafts.ts. É salvo
// automaticamente (debounce ao digitar + imediato ao sair do campo) — não há
// botão "Salvar taxas".
const { drafts, draftDo, draftToOpcoes, parseTaxa } = useCotacaoDrafts({
  lotes: () => props.lotes,
});

// ── Auto-save ──────────────────────────────────────────────────────────────
const AUTOSAVE_MS = 700;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function salvarAgora(loteId: string): void {
  const t = timers.get(loteId);
  if (t) {
    clearTimeout(t);
    timers.delete(loteId);
  }
  emit("salvar-taxas", loteId, draftToOpcoes(loteId));
}

function agendarSalvar(loteId: string): void {
  const t = timers.get(loteId);
  if (t) clearTimeout(t);
  timers.set(
    loteId,
    setTimeout(() => salvarAgora(loteId), AUTOSAVE_MS)
  );
}

// Cancela (sem disparar) o autosave debounced pendente do lote — usado por
// useEscolherBanco no início de escolher(), mesmo efeito do bloco que existia
// ali antes da extração.
function cancelarAutoSave(loteId: string): void {
  const t = timers.get(loteId);
  if (t) {
    clearTimeout(t);
    timers.delete(loteId);
  }
}

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

// Só as cotações "vivas": lote da empresa ainda não pago. Depois que o lote é
// marcado como Pago no Banco, a cotação sai daqui (não fica salva).
const lotesAbertos = computed(() =>
  props.lotes
    .filter((l) => l.empresa === props.empresa && !l.realizado)
    .sort((a, b) => a.moeda.localeCompare(b.moeda) || a.numeroLote - b.numeroLote)
);

function lancamentosDoLote(loteId: string): LancamentoBanco[] {
  return props.lancamentos.filter((l) => l.loteId === loteId);
}

// A cotação é calculada a partir do rascunho (o que está digitado agora), não do
// que foi salvo — assim o total em R$ e a diferença atualizam na hora, sem
// precisar clicar em "Salvar taxas".
// Depois que um banco é escolhido os lançamentos deixam de ser "pendentes"; para
// a tela não zerar, exibimos a cotação sobre todos os lançamentos do lote.
function viewsDoLote(lote: LoteBanco) {
  const lancs = lancamentosDoLote(lote.id);
  const base =
    lote.bancoEscolhido !== null ? lancs.map((l) => ({ ...l, valorReais: null })) : lancs;
  return montarCotacao(draftToOpcoes(lote.id), base);
}

// Regra de "usar este banco" (XP/Intex direto; Rendimento 1 pendente direto,
// 2+ abre o modal de fechamento por ordem) — ver useEscolherBanco.ts.
const {
  modalRendimento,
  rendimentoSalvando,
  rendimentoErro,
  salvando,
  escolher,
  confirmarRendimento,
  fecharModalRendimento,
  podeEscolher,
} = useEscolherBanco({
  lotesAbertos: () => lotesAbertos.value,
  lancamentosDoLote,
  drafts,
  draftDo,
  draftToOpcoes,
  parseTaxa,
  readonly: () => props.readonly,
  cancelarAutoSave,
  salvarTaxas: (loteId, opcoes) => emit("salvar-taxas", loteId, opcoes),
  // Wrapper (não a referência direta) pra ler props.escolherBanco* no momento
  // da chamada, igual o código original fazia — não captura a função uma vez
  // só no setup.
  escolherBanco: (loteId, banco, opcoes) => props.escolherBanco(loteId, banco, opcoes),
  escolherBancoRendimento: (loteId, opcoes, taxas) =>
    props.escolherBancoRendimento(loteId, opcoes, taxas),
});
</script>

<template>
  <div id="cotacao-tab" class="flex flex-col gap-4">
    <p
      v-if="!lotesAbertos.length"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Nenhum lote de {{ empresa }} em aberto. A cotação aparece quando há lançamentos no Banco.
    </p>

    <div
      v-for="lote in lotesAbertos"
      :id="`cotacao-lote-${lote.id}`"
      :key="lote.id"
      class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
    >
      <div class="flex items-center justify-between border-b border-hairline bg-paper px-3.5 py-2.5">
        <span class="font-display text-[14.5px] font-semibold text-ink">
          Lote {{ lote.numeroLote }} · Cotação {{ lote.moeda }}
        </span>
        <span
          v-if="lote.bancoEscolhido"
          class="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800"
        >
          Banco escolhido: {{ BANCO_CAMBIO_LABEL[lote.bancoEscolhido] }}
          {{
            lote.bancoEscolhido === "RENDIMENTO" && lote.taxaEscolhida === null
              ? "· taxa por ordem"
              : `@ ${lote.taxaEscolhida?.toFixed(4)}`
          }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-3">
        <CotacaoBancoCard
          v-for="view in viewsDoLote(lote)"
          :key="view.banco"
          :lote-id="lote.id"
          :view="view"
          :draft="draftDo(lote.id, view.banco)"
          :moeda="lote.moeda"
          :readonly="readonly"
          :em-uso="lote.bancoEscolhido === view.banco"
          :pode-escolher="podeEscolher(lote, view.banco)"
          :salvando="salvando?.loteId === lote.id && salvando?.banco === view.banco"
          @escolher="(banco) => escolher(lote.id, banco)"
          @editar="agendarSalvar(lote.id)"
          @confirmar="salvarAgora(lote.id)"
        />
      </div>

      <p v-if="!readonly" class="border-t border-hairline bg-paper px-3.5 py-2 text-[11.5px] text-ink-soft">
        As taxas são salvas sozinhas conforme você digita — pode fechar a página e voltar depois.
        Clique em "Usar este banco" quando decidir.
      </p>
    </div>

    <FechamentoRendimentoModal
      v-if="modalRendimento"
      :lote-id="modalRendimento.loteId"
      :moeda="modalRendimento.moeda"
      :lancamentos="modalRendimento.lancamentos"
      :corretagem="modalRendimento.corretagem"
      :salvando="rendimentoSalvando"
      :erro="rendimentoErro"
      @confirmar="confirmarRendimento"
      @close="fecharModalRendimento"
    />
  </div>
</template>
