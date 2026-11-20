<script setup lang="ts">
import type { MudancasCompra } from "#shared/types/compra";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";

// Bloco `contatos`: o texto livre dos contatos (vai por último no resumo).
defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();
</script>

<template>
  <div data-bloco="contatos" class="contents">
    <div class="sm:col-span-2 xl:col-span-4">
      <label for="compra-contatos" :class="LABEL_CLASS">Contatos</label>
      <textarea
        id="compra-contatos"
        rows="3"
        maxlength="300"
        :class="INPUT_CLASS"
        :value="compra.contatos"
        :disabled="desabilitado"
        @input="emit('alterar', { contatos: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
  </div>
</template>
