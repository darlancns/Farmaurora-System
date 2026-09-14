<script setup lang="ts">
import type { DataField, FormState } from "../../composables/useProcessoForm";

defineProps<{
  values: Pick<FormState, DataField>;
}>();

const emit = defineEmits<{
  "field-input": [field: DataField, event: Event];
}>();
</script>

<template>
  <fieldset class="rounded-md border border-hairline p-3">
    <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Datas</legend>
    <div class="grid grid-cols-4 gap-2.5">
      <div>
        <label for="pf-data-po" class="mb-1.5 block text-[10.5px] text-ink-soft">Compra (PO)</label>
        <input
          id="pf-data-po"
          :value="values.dataCompraPO"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'dataCompraPO', $event)"
        />
      </div>
      <div>
        <label for="pf-data-embarque" class="mb-1.5 block text-[10.5px] text-ink-soft">Embarque</label>
        <input
          id="pf-data-embarque"
          :value="values.dataEmbarque"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'dataEmbarque', $event)"
        />
      </div>
      <div>
        <label for="pf-thread" class="mb-1.5 block text-[10.5px] text-ink-soft">Abertura thread</label>
        <input
          id="pf-thread"
          :value="values.aberturaThread"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'aberturaThread', $event)"
        />
      </div>
      <div>
        <label for="pf-chegada" class="mb-1.5 block text-[10.5px] text-ink-soft">Chegada Brasil</label>
        <input
          id="pf-chegada"
          :value="values.dataChegadaBrasil"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'dataChegadaBrasil', $event)"
        />
      </div>
      <div>
        <label for="pf-radar" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Radar</label>
        <input
          id="pf-radar"
          :value="values.registroRadar"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'registroRadar', $event)"
        />
      </div>
      <div>
        <label for="pf-duimp" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Duimp</label>
        <input
          id="pf-duimp"
          :value="values.registroDuimp"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'registroDuimp', $event)"
        />
      </div>
      <div>
        <label for="pf-lpco" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Lpco</label>
        <input
          id="pf-lpco"
          :value="values.registroLpco"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'registroLpco', $event)"
        />
      </div>
      <div>
        <label for="pf-previsao" class="mb-1.5 block text-[10.5px] text-ink-soft">Previsão entrega</label>
        <input
          id="pf-previsao"
          :value="values.previsaoEntrega"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'previsaoEntrega', $event)"
        />
      </div>
      <div>
        <label for="pf-suposta-estimativa" class="mb-1.5 block text-[10.5px] text-ink-soft">Suposta estimativa</label>
        <input
          id="pf-suposta-estimativa"
          :value="values.supostaEstimativa"
          type="text"
          inputmode="numeric"
          placeholder="DD/MM"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('field-input', 'supostaEstimativa', $event)"
        />
      </div>
    </div>
  </fieldset>
</template>
