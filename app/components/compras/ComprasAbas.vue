<script setup lang="ts">
import { ABAS_COMPRAS, ROTULO_ABA_COMPRAS, type AbaCompras } from "../../utils/comprasAbas";
import type { AppSelectOption } from "../../types/appSelect";
import SegmentedControl from "../SegmentedControl.vue";

// As 3 abas da página Compras abaixo de lg: "Compras" (lista), "Formulário" e "Resumo" (o resumo ao vivo). Um painel por vez; no
// desktop (lg+) este componente some (as três colunas aparecem juntas). Fica fixo (sticky) no topo da área rolável da página.
defineProps<{ modelValue: AbaCompras }>();
const emit = defineEmits<{ "update:modelValue": [aba: AbaCompras] }>();

const OPCOES: AppSelectOption<AbaCompras>[] = ABAS_COMPRAS.map((aba) => ({ value: aba, label: ROTULO_ABA_COMPRAS[aba] }));
</script>

<template>
  <div id="compras-abas" class="sticky top-0 z-20 -mx-6 mb-3 bg-paper px-6 pt-1 pb-2 lg:hidden">
    <SegmentedControl id="compras-aba" label="Partes da página Compras" :model-value="modelValue" :options="OPCOES" :colunas="3" @update:model-value="(aba: AbaCompras) => emit('update:modelValue', aba)" />
  </div>
</template>
