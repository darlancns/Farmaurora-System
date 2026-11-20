<script setup lang="ts">
import { computed } from "vue";
import type { CompraDaLista } from "#shared/types/compra";
import { rotuloCurtoDaCompra } from "#shared/utils/compraMes";
import { textoPendencias } from "../../utils/comprasEstilos";
import CompraStatusChip from "./CompraStatusChip.vue";

// O cartão de uma compra na lista do mês: "Compra 13" + selo do estado + "N pendências", o paciente (negrito) e os medicamentos
// em UMA linha cortada com reticências. É um botão de verdade (Enter e Espaço abrem; as setas movem o foco entre os cartões, em
// ComprasListaPainel.vue). O selecionado leva a borda primária e o fundo #e3eef6 (farm-blue-soft).
const props = defineProps<{
  compra: CompraDaLista;
  selecionada: boolean;
}>();

const emit = defineEmits<{ selecionar: [id: string] }>();

const rotulo = computed(() => rotuloCurtoDaCompra(props.compra.sequencia));
const pendencias = computed(() => textoPendencias(props.compra.pendencias));
const medicamentos = computed(() => props.compra.medicamentos.join(", "));
</script>

<template>
  <button
    :id="`compra-cartao-${compra.id}`"
    type="button"
    data-compra-cartao
    :aria-current="selecionada ? 'true' : undefined"
    class="block w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-dark"
    :class="selecionada ? 'border-accent-dark bg-farm-blue-soft' : 'border-hairline bg-paper-raised hover:border-accent-dark'"
    @click="emit('selecionar', compra.id)"
  >
    <span class="flex items-center gap-2">
      <span class="text-[13px] font-semibold text-ink" :class="{ 'line-through': compra.cancelada }">{{ rotulo }}</span>
      <CompraStatusChip :status="compra.status" />
      <span v-if="pendencias" class="ml-auto text-[11.5px] font-semibold whitespace-nowrap text-danger">{{ pendencias }}</span>
    </span>
    <span class="mt-1 block truncate text-[13px] font-bold text-ink" :class="{ 'font-normal text-ink-soft': !compra.paciente }">
      {{ compra.paciente || "Sem paciente" }}
    </span>
    <span v-if="medicamentos" class="mt-0.5 block truncate text-[12px] text-ink-soft" :title="medicamentos">{{ medicamentos }}</span>
  </button>
</template>
