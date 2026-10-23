<script setup lang="ts">
import { COLUNA_ACOES_CLASSES } from "../../../utils/pagamentoColunaAcoes";

// Coluna de ações dos cards de item (abaixo de lg): lápis em cima e lixeira embaixo, separada do conteúdo
// por uma divisória vertical à esquerda e com a altura total do card. Quem usa decide se renderiza
// (somente leitura = sem coluna, sem divisória).
//
// `alinhada` (cards de 2 linhas de conteúdo): a coluna vira SUBGRID de 2 linhas do card, então o lápis
// fica na linha 1 e a lixeira na linha 2, cada um com a altura da sua linha (toque >= 48x34; largura única em COLUNA_ACOES_CLASSES). O pai
// precisa ser um grid com a coluna 2 livre. Sem `alinhada` (cards de 3 linhas) a coluna é um flex vertical
// que estica na altura do card, com o lápis e a lixeira repartindo a altura ao meio (toque >= 44x44).
interface AcaoColuna {
  id: string;
  label: string;
}

withDefaults(
  defineProps<{
    editar?: AcaoColuna | null;
    excluir?: AcaoColuna | null;
    alinhada?: boolean;
  }>(),
  { editar: null, excluir: null, alinhada: false },
);

const emit = defineEmits<{
  editar: [];
  excluir: [];
}>();
</script>

<template>
  <div
    :class="[COLUNA_ACOES_CLASSES, alinhada ? 'col-start-2 row-span-2 row-start-1 grid grid-rows-subgrid' : 'flex flex-col self-stretch']"
  >
    <button
      v-if="editar"
      :id="editar.id"
      type="button"
      :title="editar.label"
      :aria-label="editar.label"
      class="flex w-full flex-1 items-center justify-center text-ink-soft transition-colors hover:text-accent-dark focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-dark"
      :class="alinhada ? 'min-h-[34px]' : 'min-h-11'"
      @click="emit('editar')"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
      </svg>
    </button>
    <button
      v-if="excluir"
      :id="excluir.id"
      type="button"
      :title="excluir.label"
      :aria-label="excluir.label"
      class="flex w-full flex-1 items-center justify-center text-ink-soft transition-colors hover:text-danger focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-dark"
      :class="[alinhada ? 'min-h-[34px]' : 'min-h-11', { 'border-t border-hairline': editar }]"
      @click="emit('excluir')"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    </button>
  </div>
</template>
