<script setup lang="ts">
import type { MudancasCompra } from "#shared/types/compra";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";

// Bloco `medico`: o Médico(a).
defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();
</script>

<template>
  <div data-bloco="medico" class="contents">
    <div>
      <label for="compra-medico" :class="LABEL_CLASS">Médico(a)</label>
      <input id="compra-medico" type="text"
        maxlength="300" :class="INPUT_CLASS" :value="compra.medico" :disabled="desabilitado" autocomplete="off" @input="emit('alterar', { medico: ($event.target as HTMLInputElement).value })" />
    </div>
  </div>
</template>
