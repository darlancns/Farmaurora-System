<script setup lang="ts">
import { computed } from "vue";
import type { MudancasCompra } from "#shared/types/compra";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { montarConsultorOptions } from "../../../utils/consultorOptions";
import { INPUT_CLASS, LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../../utils/processoFormClasses";
import AppSelect from "../../AppSelect.vue";

// Bloco `vendedor_responsavel`: o Vendedor (consultores ativos do Cadastro) e o Responsável (texto; vem preenchido do servidor).
const props = defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const vendedorOptions = computed(() =>
  montarConsultorOptions(
    props.compra.vendedor,
    props.opcoes.consultores.map((c) => ({ nome: c.nome, ativo: true })),
  ),
);
</script>

<template>
  <div data-bloco="vendedor_responsavel" class="contents">
    <div :class="SELECT_CAMPO_CLASS">
      <label for="compra-vendedor" :class="LABEL_CLASS">Vendedor</label>
      <AppSelect id="compra-vendedor" :model-value="compra.vendedor" :options="vendedorOptions" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { vendedor: v })" />
    </div>
    <div>
      <label for="compra-responsavel" :class="LABEL_CLASS">Responsável</label>
      <input
        id="compra-responsavel"
        type="text"
        maxlength="300"
        :class="INPUT_CLASS"
        :value="compra.responsavel"
        :disabled="desabilitado"
        autocomplete="off"
        @input="emit('alterar', { responsavel: ($event.target as HTMLInputElement).value })"
      />
    </div>
  </div>
</template>
