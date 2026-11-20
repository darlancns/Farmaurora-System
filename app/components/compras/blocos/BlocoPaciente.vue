<script setup lang="ts">
import type { MudancasCompra } from "#shared/types/compra";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";

// Bloco `paciente`: só o campo Paciente. (O processo, o médico, o vendedor e o responsável têm blocos próprios, na ordem do resumo.)
defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();
</script>

<template>
  <div data-bloco="paciente" class="contents">
    <div class="sm:col-span-2 xl:col-span-4">
      <label for="compra-paciente" :class="LABEL_CLASS">Paciente</label>
      <input
        id="compra-paciente"
        data-campo="paciente"
        type="text"
        maxlength="300"
        :class="INPUT_CLASS"
        :value="compra.paciente"
        :disabled="desabilitado"
        autocomplete="off"
        @input="emit('alterar', { paciente: ($event.target as HTMLInputElement).value })"
      />
    </div>
  </div>
</template>
