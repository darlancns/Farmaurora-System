<script setup lang="ts">
import type { Medicamento } from "#shared/types/processo";
import { BOTAO_REMOVER_CLASS, INPUT_COMPACTO_CLASS, LABEL_CLASS } from "../../utils/processoFormClasses";

defineProps<{
  items: Medicamento[];
}>();

const emit = defineEmits<{
  "nome-input": [index: number, event: Event];
  "dosagem-input": [index: number, event: Event];
  "quantidade-input": [index: number, event: Event];
  add: [];
  remove: [index: number];
}>();
</script>

<template>
  <div>
    <p :class="LABEL_CLASS">Medicamentos</p>
    <div
      v-for="(item, index) in items"
      :key="index"
      class="mb-3 grid grid-cols-2 items-end gap-2 border-b border-hairline pb-3 last:mb-0 last:border-b-0 last:pb-0 lg:mb-1.5 lg:last:mb-1.5 lg:grid-cols-[1.4fr_1fr_0.7fr_auto] lg:border-b-0 lg:pb-0"
    >
      <div class="col-span-2 lg:col-span-1">
        <label :for="`pf-medicamento-nome-${index}`" :class="LABEL_CLASS">Nome</label>
        <input
          :id="`pf-medicamento-nome-${index}`"
          :value="item.nome"
          type="text"
          :class="INPUT_COMPACTO_CLASS"
          @input="emit('nome-input', index, $event)"
        />
      </div>
      <div>
        <label :for="`pf-medicamento-dosagem-${index}`" :class="LABEL_CLASS">Dosagem</label>
        <input
          :id="`pf-medicamento-dosagem-${index}`"
          :value="item.dosagem"
          type="text"
          :class="INPUT_COMPACTO_CLASS"
          @input="emit('dosagem-input', index, $event)"
        />
      </div>
      <div>
        <label :for="`pf-medicamento-quantidade-${index}`" :class="LABEL_CLASS">Quantidade</label>
        <input
          :id="`pf-medicamento-quantidade-${index}`"
          :value="item.quantidade"
          type="text"
          :class="INPUT_COMPACTO_CLASS"
          @input="emit('quantidade-input', index, $event)"
        />
      </div>
      <div class="col-span-2 flex gap-2 empty:hidden lg:col-span-1 lg:gap-1 lg:empty:flex">
        <button
          v-if="index > 0"
          type="button"
          title="Remover medicamento"
          :class="BOTAO_REMOVER_CLASS"
          @click="emit('remove', index)"
        >
          ✕
        </button>
        <button
          v-if="index === items.length - 1"
          type="button"
          title="Adicionar medicamento"
          class="flex min-h-11 flex-1 items-center justify-center rounded-md border border-hairline px-2.5 py-2 text-[14px] font-semibold text-accent-dark transition-colors hover:bg-paper lg:block lg:min-h-auto lg:flex-[0_1_auto] lg:text-[13px]"
          @click="emit('add')"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>
