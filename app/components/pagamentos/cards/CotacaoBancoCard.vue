<script setup lang="ts">
import type { BancoCambio, CotacaoOpcaoView, Moeda } from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL, MOEDA_SIMBOLO } from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import type { CotacaoDraft } from "../../../types/cotacao";

const props = withDefaults(
  defineProps<{
    loteId: string;
    view: CotacaoOpcaoView;
    draft: CotacaoDraft;
    moeda: Moeda;
    readonly: boolean;
    emUso: boolean;
    podeEscolher: boolean;
    salvando?: boolean; // true enquanto aguarda a confirmação do servidor
  }>(),
  { salvando: false },
);

const emit = defineEmits<{
  escolher: [banco: BancoCambio];
  editar: []; // digitou algo (dispara auto-save com debounce)
  confirmar: []; // saiu do campo (auto-save imediato)
}>();
</script>

<template>
  <div
    :id="`cotacao-banco-${loteId}-${view.banco}`"
    class="flex flex-col gap-2 rounded-lg border p-3 transition-colors"
    :class="view.maisBarato ? 'border-accent-dark bg-farm-blue-soft' : 'border-hairline bg-paper'"
  >
    <div class="flex items-center justify-between">
      <span class="font-display text-[14px] font-semibold text-ink">{{ BANCO_CAMBIO_LABEL[view.banco] }}</span>
      <span
        v-if="view.maisBarato"
        class="rounded-full bg-accent-dark px-2 py-0.5 text-[10px] font-semibold text-white"
      >
        mais barato
      </span>
    </div>

    <div class="flex items-center justify-between gap-2 text-[12px] text-ink-soft">
      <span>Ordens</span>
      <strong class="font-mono text-[13px] text-ink">{{ view.quantidadeOrdens }}</strong>
    </div>

    <label class="flex items-center justify-between gap-2 text-[12px] text-ink-soft">
      <span>Corretagem R$</span>
      <input
        v-if="!readonly"
        :id="`input-corretagem-${loteId}-${view.banco}`"
        v-model="draft.corretagemStr"
        type="text"
        inputmode="decimal"
        placeholder="0,00"
        class="w-[92px] rounded-md border border-hairline bg-paper-raised px-2 py-1 text-right font-mono text-[12.5px] focus:outline-2 focus:outline-accent-dark"
        @input="emit('editar')"
        @blur="emit('confirmar')"
      />
      <strong v-else class="font-mono text-[13px] text-ink">{{ formatCurrency(view.taxaCorretagem) }}</strong>
    </label>

    <label class="flex items-center justify-between gap-2 text-[12px] text-ink-soft">
      <span>Taxa</span>
      <input
        v-if="!readonly"
        :id="`input-taxa-${loteId}-${view.banco}`"
        v-model="draft.taxaStr"
        type="text"
        inputmode="decimal"
        placeholder="ex: 5,4231"
        class="w-[92px] rounded-md border border-hairline bg-paper-raised px-2 py-1 text-right font-mono text-[12.5px] focus:outline-2 focus:outline-accent-dark"
        @input="emit('editar')"
        @blur="emit('confirmar')"
      />
      <strong v-else class="font-mono text-[13px] text-ink">{{ view.taxa?.toFixed(4) ?? "—" }}</strong>
    </label>

    <div class="mt-1 border-t border-hairline pt-2 text-[12px]">
      <div class="flex items-center justify-between text-ink-soft">
        <span>Total {{ moeda }}</span>
        <span class="font-mono text-ink">{{ MOEDA_SIMBOLO[moeda] }} {{ formatCurrency(view.totalMoeda) }}</span>
      </div>
      <div class="flex items-center justify-between text-ink-soft">
        <span>Total R$</span>
        <span class="font-mono font-semibold text-ink">
          {{ view.totalReais === null ? "—" : `R$ ${formatCurrency(view.totalReais)}` }}
        </span>
      </div>
      <div class="flex items-center justify-between text-ink-soft">
        <span>Diferença</span>
        <span
          class="font-mono"
          :class="view.diferenca === null ? 'text-ink-soft' : view.diferenca === 0 ? 'text-green-700' : 'text-danger'"
        >
          {{ view.diferenca === null ? "—" : view.diferenca === 0 ? "menor" : `+R$ ${formatCurrency(view.diferenca)}` }}
        </span>
      </div>
    </div>

    <button
      v-if="!readonly"
      :id="`btn-usar-banco-${loteId}-${view.banco}`"
      type="button"
      :disabled="!podeEscolher"
      class="mt-1 rounded-md border border-accent-dark px-2.5 py-1.5 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      @click="emit('escolher', view.banco)"
    >
      {{ salvando ? "Salvando..." : emUso ? "Banco em uso" : "Usar este banco" }}
    </button>
  </div>
</template>
