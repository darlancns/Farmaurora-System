<script setup lang="ts">
import { computed } from "vue";
import type { StatusProcesso } from "#shared/types/processo";

// Ícone do cabeçalho de cada coluna do Kanban. Mesmo conjunto de ícones que o projeto já usa (contorno 24x24,
// stroke 1.5–1.8, desenhado inline como os demais SVG das telas): Na origem = pacote; Em trânsito = caminhão;
// Desembaraço = prédio da aduana (landmark); Liberado = círculo com check; Entregue = pacote com check.
const props = defineProps<{ status: StatusProcesso }>();

const PACOTE = "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9";

const CAMINHOS: Record<StatusProcesso, readonly string[]> = {
  elaboracao_fornecedores: [PACOTE],
  em_transito: [
    "M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  ],
  desembaraco: [
    "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z",
  ],
  liberado: ["M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  // Pacote com um check na face da frente.
  entregue: [PACOTE, "m13.5 15 1.5 1.5 3-3"],
};

const caminhos = computed(() => CAMINHOS[props.status]);
</script>

<template>
  <svg viewBox="0 0 24 24" class="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <path v-for="(d, i) in caminhos" :key="i" stroke-linecap="round" stroke-linejoin="round" :d="d" />
  </svg>
</template>
