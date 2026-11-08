<script setup lang="ts">
import type { DataField, FormState } from "../../composables/useProcessoForm";
import { FIELDSET_CLASS, INPUT_DATA_CLASS, LABEL_CLASS, LEGEND_CLASS } from "../../utils/processoFormClasses";
import AppDatePicker from "../AppDatePicker.vue";

defineProps<{
  values: Pick<FormState, DataField>;
}>();

const emit = defineEmits<{
  "update:field": [field: DataField, value: string];
}>();

// As 9 datas do processo, na ordem da tela. Cada uma é um AppDatePicker (calendário próprio, não digitável):
// grava "DD/MM" (ano corrente) ou "DD/MM/AAAA" (outro ano). Texto antigo que já existe no banco ("09/10 - agd.
// análise", "já tem"...) aparece como está, com um pontinho de atenção, e só é trocado depois de confirmar.
const CAMPOS: ReadonlyArray<{ id: string; campo: DataField; rotulo: string; larguraTotal?: boolean }> = [
  { id: "pf-data-po", campo: "dataCompraPO", rotulo: "Compra (PO)" },
  { id: "pf-data-embarque", campo: "dataEmbarque", rotulo: "Embarque" },
  { id: "pf-thread", campo: "aberturaThread", rotulo: "Abertura thread" },
  { id: "pf-chegada", campo: "dataChegadaBrasil", rotulo: "Chegada Brasil" },
  { id: "pf-radar", campo: "registroRadar", rotulo: "Registro Radar" },
  { id: "pf-duimp", campo: "registroDuimp", rotulo: "Registro Duimp" },
  { id: "pf-lpco", campo: "registroLpco", rotulo: "Registro Lpco" },
  { id: "pf-previsao", campo: "previsaoEntrega", rotulo: "Previsão entrega" },
  { id: "pf-suposta-estimativa", campo: "supostaEstimativa", rotulo: "Suposta estimativa", larguraTotal: true },
];
</script>

<template>
  <fieldset :class="FIELDSET_CLASS">
    <legend :class="LEGEND_CLASS">Datas</legend>
    <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="item in CAMPOS" :key="item.id" :class="item.larguraTotal ? 'col-span-2 sm:col-span-1' : ''">
        <label :for="item.id" :class="LABEL_CLASS">{{ item.rotulo }}</label>
        <AppDatePicker
          :id="item.id"
          :model-value="values[item.campo]"
          formato="dd/mm"
          placeholder="Escolher"
          :label="item.rotulo"
          :classe-campo="INPUT_DATA_CLASS"
          @update:model-value="emit('update:field', item.campo, $event)"
        />
      </div>
    </div>
  </fieldset>
</template>
