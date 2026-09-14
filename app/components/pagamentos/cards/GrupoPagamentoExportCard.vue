<script setup lang="ts">
import { computed } from "vue";
import type { GrupoPagamento } from "#shared/types/Pagamento";
import { EMPRESA_PAGAMENTO_LABEL } from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import { EMPRESA_EXPORT_HEADER_CLASS } from "../../../utils/pagamentoExport";

const props = defineProps<{
  grupo: GrupoPagamento;
  // Momento do clique no botão de exportar — o grupo ainda está aberto aqui
  // (pagoEm é sempre null), então "hoje" é a melhor representação da
  // intenção real (gerar o recibo pra pagar agora).
  dataExibicao: Date;
}>();

const total = computed<number>(() => props.grupo.itens.reduce((soma, i) => soma + i.valor, 0));

const dataLabel = computed<string>(() =>
  props.dataExibicao.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
);

const nOrdensLabel = computed<string>(() =>
  props.grupo.itens.length === 1 ? "1 pagamento" : `${props.grupo.itens.length} pagamentos`
);
</script>

<template>
  <div id="grupo-export-card" class="w-[460px] bg-white font-sans text-ink">
    <div :class="EMPRESA_EXPORT_HEADER_CLASS[grupo.empresa]" class="px-5 py-4 text-white">
      <div class="flex items-baseline justify-between gap-4">
        <p class="text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ EMPRESA_PAGAMENTO_LABEL[grupo.empresa] }} · Pagamentos
        </p>
        <p class="shrink-0 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ dataLabel }}
        </p>
      </div>
      <div class="mt-1 flex items-baseline justify-between gap-4">
        <p class="whitespace-nowrap font-display text-[22px] font-semibold leading-tight">{{ grupo.nomeGrupo }}</p>
        <p class="shrink-0 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ nOrdensLabel }}
        </p>
      </div>
    </div>

    <ul class="px-5 py-1">
      <li
        v-for="(item, i) in grupo.itens"
        :key="i"
        class="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-b-0"
      >
        <span class="min-w-0 flex-1 text-[15.5px] font-medium text-ink">{{ item.paciente }}</span>
        <span class="shrink-0 text-right">
          <span class="block whitespace-nowrap font-mono text-[13.5px] text-ink">R$ {{ formatCurrency(item.valor) }}</span>
          <span v-if="item.status === 'COMPLEMENTO'" class="mt-0.5 block whitespace-nowrap font-mono text-[11.5px] text-ink-soft">
            Complemento
          </span>
        </span>
      </li>
    </ul>

    <div class="flex items-end justify-between gap-4 border-t-2 border-hairline px-5 py-3.5">
      <span v-if="grupo.chavePix" class="min-w-0 text-[11.5px] text-ink-soft">
        PIX<br /><span class="font-mono text-[13px] break-all text-ink">{{ grupo.chavePix }}</span>
      </span>
      <span v-else aria-hidden="true"></span>
      <span class="shrink-0 text-right">
        <span class="block whitespace-nowrap text-[12px] text-ink-soft">TOTAL</span>
        <span class="block whitespace-nowrap font-display text-[20px] font-semibold text-ink">R$ {{ formatCurrency(total) }}</span>
      </span>
    </div>
  </div>
</template>
