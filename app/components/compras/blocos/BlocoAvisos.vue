<script setup lang="ts">
import type { MudancasCompra } from "#shared/types/compra";
import { CHECKBOX_CLASS, ROTULO_CHECKBOX_CLASS, type PropsBloco } from "../../../utils/comprasBlocos";

// Bloco `avisos` (nesta altura só o "Recorrente"; isenção, documentos, pendências e observações entram no commit seguinte).
defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();
</script>

<template>
  <div data-bloco="avisos" class="contents">
    <label :class="ROTULO_CHECKBOX_CLASS" for="compra-recorrente">
      <input
        id="compra-recorrente"
        type="checkbox"
        :class="CHECKBOX_CLASS"
        :checked="compra.recorrente"
        :disabled="desabilitado"
        @change="emit('alterar', { recorrente: ($event.target as HTMLInputElement).checked })"
      />
      <span>Recorrente</span>
    </label>
  </div>
</template>
