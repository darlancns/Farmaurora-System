<script setup lang="ts">
import { computed } from "vue";
import { BANCO_DIR_SEM_BANCO, corDoBanco } from "#shared/constants/dir";

// Chip do banco: pílula com ponto colorido E o nome escrito (a cor nunca é a única informação).
// Cores em shared/constants/dir.ts (paleta aprovada, contraste >= 4,5:1). Banco vazio ou fora do mapa
// (ex.: um "Outro" digitado) fica cinza; vazio mostra "Sem banco". O `id` vem de quem usa (attrs).
const props = defineProps<{ banco: string }>();

const cor = computed(() => corDoBanco(props.banco));
const rotulo = computed<string>(() => props.banco || BANCO_DIR_SEM_BANCO);
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] leading-tight font-semibold whitespace-nowrap"
    :class="cor.tracejado ? 'border border-dashed border-gray-400' : ''"
    :style="{ backgroundColor: cor.fundo, color: cor.texto }"
    :title="rotulo"
  >
    <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: cor.ponto }" aria-hidden="true" />
    <span class="truncate">{{ rotulo }}</span>
  </span>
</template>
