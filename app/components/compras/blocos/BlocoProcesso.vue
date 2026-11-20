<script setup lang="ts">
import type { MudancasCompra } from "#shared/types/compra";
import { CHECKBOX_CLASS, ROTULO_CHECKBOX_CLASS, type PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_MONO_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";

// Bloco `processo`: o Nº do processo (texto livre, mono, sem máscara que corte caracteres; aceita "/UF" no fim) e "Compra particular
// (sem processo)": marcada, o campo fica desabilitado e vazio (o valor sai junto, no mesmo aviso).
defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

function aoMarcarParticular(event: Event): void {
  const marcada = (event.target as HTMLInputElement).checked;
  emit("alterar", marcada ? { compraParticular: true, processoNumero: "" } : { compraParticular: false });
}
</script>

<template>
  <div data-bloco="processo" class="contents">
    <div>
      <label for="compra-processo" :class="LABEL_CLASS">Nº do processo</label>
      <input
        id="compra-processo"
        data-campo="processo"
        type="text"
        maxlength="300"
        :class="INPUT_MONO_CLASS"
        placeholder="0000000-00.0000.0.00.0000"
        :value="compra.compraParticular ? '' : compra.processoNumero"
        :disabled="desabilitado || compra.compraParticular"
        autocomplete="off"
        @input="emit('alterar', { processoNumero: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <label :class="[ROTULO_CHECKBOX_CLASS, 'self-end']" for="compra-particular">
      <input id="compra-particular" data-campo="processo-particular" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.compraParticular" :disabled="desabilitado" @change="aoMarcarParticular" />
      <span>Compra particular (sem processo)</span>
    </label>
  </div>
</template>
