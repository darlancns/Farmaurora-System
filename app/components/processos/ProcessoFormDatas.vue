<script setup lang="ts">
import type { DataField, FormState } from "../../composables/useProcessoForm";
import { FIELDSET_CLASS, INPUT_DATA_CLASS, LABEL_CLASS, LEGEND_CLASS } from "../../utils/processoFormClasses";
import AppDatePicker from "../AppDatePicker.vue";
import type { SentidoAno } from "#shared/utils/anoAutomatico";

defineProps<{
  values: Pick<FormState, DataField>;
}>();

const emit = defineEmits<{
  "update:field": [field: DataField, value: string];
}>();

// As 9 datas do processo, na ordem da tela. Cada uma é um AppDatePicker com ANO AUTOMÁTICO: dá para digitar
// ("22/10" ou "2210" ganham o ano sozinhos) ou escolher no calendário, e o valor novo é gravado sempre como
// "DD/MM/AAAA". Sentido do ano: "futuro" nas previsões (próxima ocorrência, hoje conta) e "proximo" nos fatos (o
// ano mais perto de hoje). Valor antigo "DD/MM" aparece como está até ser editado; texto antigo com anotação ("09/10
// - agd. análise", "já tem"...) aparece como está, com um pontinho de atenção, e só é trocado depois de confirmar.
const CAMPOS: ReadonlyArray<{
  id: string;
  campo: DataField;
  rotulo: string;
  sentido: SentidoAno;
  larguraTotal?: boolean;
}> = [
  { id: "pf-data-po", campo: "dataCompraPO", rotulo: "Compra (PO)", sentido: "proximo" },
  { id: "pf-data-embarque", campo: "dataEmbarque", rotulo: "Embarque", sentido: "proximo" },
  { id: "pf-thread", campo: "aberturaThread", rotulo: "Abertura thread", sentido: "proximo" },
  { id: "pf-chegada", campo: "dataChegadaBrasil", rotulo: "Chegada Brasil", sentido: "proximo" },
  { id: "pf-radar", campo: "registroRadar", rotulo: "Registro Radar", sentido: "proximo" },
  { id: "pf-duimp", campo: "registroDuimp", rotulo: "Registro Duimp", sentido: "proximo" },
  { id: "pf-lpco", campo: "registroLpco", rotulo: "Registro Lpco", sentido: "proximo" },
  { id: "pf-previsao", campo: "previsaoEntrega", rotulo: "Previsão entrega", sentido: "futuro" },
  {
    id: "pf-suposta-estimativa",
    campo: "supostaEstimativa",
    rotulo: "Suposta estimativa",
    sentido: "futuro",
    larguraTotal: true,
  },
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
          ano-automatico
          :sentido="item.sentido"
          placeholder="DD/MM/AAAA"
          :label="item.rotulo"
          :classe-campo="INPUT_DATA_CLASS"
          @update:model-value="emit('update:field', item.campo, $event)"
        />
      </div>
    </div>
  </fieldset>
</template>
