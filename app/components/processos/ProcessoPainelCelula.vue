<script setup lang="ts">
import { ICONES_PROCESSO } from "../../utils/processoIcones";
import type { CelulaPainel } from "../../utils/processoPainelSecoes";

// Bloquinho da barra lateral do processo (continuação do card do Kanban): ícone (16px, traço 1.75) + rótulo pequeno em
// maiúsculas + valor. Mesmo estilo do card: fundo #f6f8f8, borda #e0e7e5, raio 8, ícones #6b7f87 (gráficos, 3:1); rótulo
// no cinza do projeto (ink-soft, #4c6069: 6:1 sobre o fundo do bloquinho). O id do valor vem da célula (ids `painel-*`
// fixos). `truncar`: valor numa linha com "…" (title com o texto completo) — usado nas Pessoas; sem ele o valor quebra
// de linha (o nº do processo e a AWB, em fonte de código, quebram em qualquer ponto).
const props = withDefaults(defineProps<{ celula: CelulaPainel; truncar?: boolean }>(), { truncar: false });
</script>

<template>
  <div
    class="flex min-w-0 items-center gap-2 rounded-[8px] border border-[#e0e7e5] bg-[#f6f8f8] px-3 py-2"
    :title="celula.titulo"
  >
    <svg
      viewBox="0 0 24 24"
      class="h-4 w-4 shrink-0 text-[#6b7f87]"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="(d, i) in ICONES_PROCESSO[props.celula.chave]" :key="i" :d="d" />
    </svg>
    <div class="min-w-0 flex-1">
      <p class="mb-[3px] text-[10.5px] leading-none font-semibold tracking-[0.04em] text-ink-soft uppercase">{{ celula.rotulo }}</p>
      <p
        :id="celula.id"
        class="text-[13px] leading-snug font-medium text-ink"
        :class="[celula.mono ? 'font-mono' : '', truncar ? 'truncate' : celula.mono ? 'break-all' : 'break-words']"
      >
        {{ celula.valor }}
      </p>
    </div>
  </div>
</template>
