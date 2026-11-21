<script setup lang="ts">
import { computed } from "vue";

// Uma LINHA do formulário único da Compra: rótulo à esquerda (largura fixa de 140px em lg+) e o controle à direita (grade
// [rótulo | controle]); abaixo de lg o rótulo fica ACIMA do controle. `idLinha` é o id da linha no resumo (montarResumo("modelo")):
// vai em `data-linha`, e é por ele que a ordem do formulário é conferida contra a ordem do resumo.
//
// ACESSIBILIDADE: com `para` (o id do controle) o rótulo é um <label for>; sem ele (linhas com vários controles: Med. 1, Med. 2, ou
// Envio + Cia) o rótulo é um texto e a linha vira role="group" ligado a ele por aria-labelledby. O erro da linha (`erro`) aparece
// embaixo do controle, com id fixo (`erroId`) para o controle apontar por aria-describedby.
const props = defineProps<{
  idLinha: string;
  rotulo: string;
  /** O id do controle: o rótulo vira <label for>. Sem ele, a linha é um grupo. */
  para?: string;
  erro?: string | null;
  /** O texto de apoio embaixo do controle (ex.: os dados do broker). */
  apoio?: string | null;
}>();

defineSlots<{ default(props: { rotuloId: string; erroId: string }): unknown }>();

const rotuloId = computed(() => `compra-linha-${props.idLinha}-rotulo`);
const erroId = computed(() => `compra-linha-${props.idLinha}-erro`);
// O rótulo quebra em 2 linhas quando preciso (nunca é cortado): break-words + leading-snug.
const CLASSE_ROTULO = "block pt-0.5 text-[14px] leading-snug font-semibold break-words text-ink lg:pt-2 lg:text-[13px]";
</script>

<template>
  <div :data-linha="idLinha" class="grid gap-x-3 gap-y-1 border-b border-hairline/70 py-3 last:border-b-0 lg:grid-cols-[140px_minmax(0,1fr)] lg:items-start">
    <label v-if="para" :id="rotuloId" :for="para" :class="CLASSE_ROTULO">{{ rotulo }}</label>
    <span v-else :id="rotuloId" :class="CLASSE_ROTULO">{{ rotulo }}</span>
    <div class="min-w-0" :role="para ? undefined : 'group'" :aria-labelledby="para ? undefined : rotuloId">
      <slot :rotulo-id="rotuloId" :erro-id="erroId" />
      <p v-if="apoio" :id="`compra-linha-${idLinha}-apoio`" class="mt-1.5 text-[12px] text-ink-soft">{{ apoio }}</p>
      <p v-if="erro" :id="erroId" role="alert" class="mt-1.5 text-[12px] font-medium text-danger">{{ erro }}</p>
    </div>
  </div>
</template>
