<script setup lang="ts">
import { BOTAO_ICONE_CLASS } from "../../utils/botaoIcone";

// O seletor do mês da lista: seta para o mês anterior, o mês por extenso ("Novembro/2026") e seta para o próximo, mais "N compras"
// (todas menos as canceladas). O mês em si (de Brasília) vem de useComprasMes.
defineProps<{
  rotulo: string;
  totalDoMes: number;
}>();

const emit = defineEmits<{ anterior: []; proximo: [] }>();
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <button id="compras-mes-anterior" type="button" aria-label="Mês anterior" :class="BOTAO_ICONE_CLASS" class="hover:border-accent-dark hover:text-accent-dark" @click="emit('anterior')">
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6" />
      </svg>
    </button>
    <div class="min-w-0 text-center">
      <p id="compras-mes-rotulo" class="truncate text-[15px] font-semibold text-ink" aria-live="polite">{{ rotulo }}</p>
      <p id="compras-mes-total" class="text-[12px] text-ink-soft">{{ totalDoMes === 1 ? "1 compra" : `${totalDoMes} compras` }}</p>
    </div>
    <button id="compras-mes-proximo" type="button" aria-label="Próximo mês" :class="BOTAO_ICONE_CLASS" class="hover:border-accent-dark hover:text-accent-dark" @click="emit('proximo')">
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    </button>
  </div>
</template>
