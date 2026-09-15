<script setup lang="ts">
import { computed } from "vue";
import type { BancoCambio, LancamentoBanco } from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL, MOEDA_SIMBOLO } from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";

const props = withDefaults(
  defineProps<{
    lancamento: LancamentoBanco;
    editavel?: boolean; // mostra o lápis de editar lançamento (só "em aberto")
    excluivel?: boolean; // mostra a lixeira (em aberto e nos realizados)
    realizadoEditavel?: boolean; // mostra o lápis de corrigir cliente+data (só nos realizados)
    banco?: BancoCambio | null; // mostra o banco do lote (usado na lista de realizados)
    dataPagamento?: string; // data já formatada (usado na lista de realizados)
  }>(),
  { editavel: false, excluivel: false, realizadoEditavel: false, banco: null, dataPagamento: "" },
);

const emit = defineEmits<{
  editar: [lancamento: LancamentoBanco];
  excluir: [lancamento: LancamentoBanco];
  "editar-realizado": [];
}>();

const simbolo = computed(() => MOEDA_SIMBOLO[props.lancamento.moeda]);
const valorReaisLabel = computed(() =>
  props.lancamento.valorReais === null ? null : `R$ ${formatCurrency(props.lancamento.valorReais)}`
);
</script>

<template>
  <div
    :id="`lancamento-banco-${lancamento.id}`"
    class="flex items-center gap-3 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
  >
    <div class="min-w-0 flex-1">
      <span class="block truncate text-[13.5px] font-medium text-ink">{{ lancamento.cliente }}</span>
      <span class="block truncate text-[11.5px] text-ink-soft">
        {{ lancamento.fornecedor }} · Invoice {{ lancamento.invoice
        }}<template v-if="banco"> · {{ BANCO_CAMBIO_LABEL[banco] }}</template>
      </span>
    </div>

    <span
      v-if="dataPagamento"
      class="w-[86px] shrink-0 text-right font-mono text-[11.5px] text-ink-soft"
      title="Data do pagamento"
    >
      {{ dataPagamento }}
    </span>

    <span class="w-[130px] shrink-0 text-right font-mono text-[12.5px] text-ink">
      {{ simbolo }} {{ formatCurrency(lancamento.valorMoeda) }}
    </span>

    <span
      class="w-[150px] shrink-0 text-right font-mono text-[12.5px]"
      :class="valorReaisLabel ? 'text-ink' : 'text-ink-soft italic'"
    >
      {{ valorReaisLabel ?? "aguardando cotação" }}
    </span>

    <div v-if="editavel || excluivel || realizadoEditavel" class="flex shrink-0 items-center gap-1">
      <button
        v-if="editavel"
        :id="`btn-editar-lancamento-${lancamento.id}`"
        type="button"
        title="Editar lançamento"
        aria-label="Editar lançamento"
        class="rounded-md p-1.5 text-ink-soft transition-colors hover:text-accent-dark"
        @click="emit('editar', lancamento)"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
        </svg>
      </button>
      <button
        v-if="realizadoEditavel"
        :id="`btn-editar-realizado-${lancamento.id}`"
        type="button"
        title="Editar pagamento realizado"
        aria-label="Editar pagamento realizado"
        class="rounded-md p-1.5 text-ink-soft transition-colors hover:text-accent-dark"
        @click="emit('editar-realizado')"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
        </svg>
      </button>
      <button
        v-if="excluivel"
        :id="`btn-excluir-lancamento-${lancamento.id}`"
        type="button"
        title="Excluir lançamento"
        aria-label="Excluir lançamento"
        class="rounded-md p-1.5 text-ink-soft transition-colors hover:text-danger"
        @click="emit('excluir', lancamento)"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  </div>
</template>
