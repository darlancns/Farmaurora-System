<script setup lang="ts">
import { computed } from "vue";
import { ICONES_COMPRA, type ChaveIconeCompra } from "../../utils/comprasIcones";

// O botão de ação do cabeçalho da compra: ÍCONE à esquerda e o texto, no molde do "Excluir processo" do Follow-Up (ProcessoPainel): borda de 1px, cantos
// de 8, fundo do cartão, texto de 12,5px em negrito, ícone de 16px com traço de 1,75; 44px de altura abaixo de lg (alvo de toque) e 36px em lg+.
// `perigo` é o estilo discreto de ação destrutiva (borda e texto avermelhados; só o fundo muda no hover) — o mesmo do "Excluir processo".
const props = defineProps<{ id: string; rotulo: string; icone: ChaveIconeCompra; perigo?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ click: [] }>();

const caminhos = computed(() => ICONES_COMPRA[props.icone]);
const COR_NEUTRA = "border-hairline text-ink hover:bg-white";
const COR_PERIGO = "border-[#efd3cc] text-[#9a3828] hover:bg-[#fbeeea]";
</script>

<template>
  <button
    :id="id"
    type="button"
    :disabled="disabled"
    :data-icone="icone"
    :class="[
      'inline-flex min-h-11 items-center gap-2 rounded-lg border bg-paper-raised px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9',
      perigo ? COR_PERIGO : COR_NEUTRA,
    ]"
    @click="emit('click')"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-for="(d, i) in caminhos" :key="i" :d="d" />
    </svg>
    {{ rotulo }}
  </button>
</template>
