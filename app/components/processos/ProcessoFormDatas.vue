<script setup lang="ts">
import type { DataField, FormState } from "../../composables/useProcessoForm";
import { INPUT_DATA_CLASS, LABEL_CLASS } from "../../utils/processoFormClasses";

defineProps<{
  values: Pick<FormState, DataField>;
}>();

const emit = defineEmits<{
  "field-input": [field: DataField, event: Event];
}>();
</script>

<template>
  <fieldset class="min-w-0 rounded-md border border-hairline p-3 lg:min-w-min">
    <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Datas</legend>
    <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <div>
        <label for="pf-data-po" :class="LABEL_CLASS">Compra (PO)</label>
        <input
          id="pf-data-po"
          :value="values.dataCompraPO"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'dataCompraPO', $event)"
        />
      </div>
      <div>
        <label for="pf-data-embarque" :class="LABEL_CLASS">Embarque</label>
        <input
          id="pf-data-embarque"
          :value="values.dataEmbarque"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'dataEmbarque', $event)"
        />
      </div>
      <div>
        <label for="pf-thread" :class="LABEL_CLASS">Abertura thread</label>
        <input
          id="pf-thread"
          :value="values.aberturaThread"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'aberturaThread', $event)"
        />
      </div>
      <div>
        <label for="pf-chegada" :class="LABEL_CLASS">Chegada Brasil</label>
        <input
          id="pf-chegada"
          :value="values.dataChegadaBrasil"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'dataChegadaBrasil', $event)"
        />
      </div>
      <div>
        <label for="pf-radar" :class="LABEL_CLASS">Registro Radar</label>
        <input
          id="pf-radar"
          :value="values.registroRadar"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'registroRadar', $event)"
        />
      </div>
      <div>
        <label for="pf-duimp" :class="LABEL_CLASS">Registro Duimp</label>
        <input
          id="pf-duimp"
          :value="values.registroDuimp"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'registroDuimp', $event)"
        />
      </div>
      <div>
        <label for="pf-lpco" :class="LABEL_CLASS">Registro Lpco</label>
        <input
          id="pf-lpco"
          :value="values.registroLpco"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'registroLpco', $event)"
        />
      </div>
      <div>
        <label for="pf-previsao" :class="LABEL_CLASS">Previsão entrega</label>
        <input
          id="pf-previsao"
          :value="values.previsaoEntrega"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'previsaoEntrega', $event)"
        />
      </div>
      <div class="col-span-2 sm:col-span-1">
        <label for="pf-suposta-estimativa" :class="LABEL_CLASS">Suposta estimativa</label>
        <input
          id="pf-suposta-estimativa"
          :value="values.supostaEstimativa"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          :class="INPUT_DATA_CLASS"
          @input="emit('field-input', 'supostaEstimativa', $event)"
        />
      </div>
    </div>
  </fieldset>
</template>
