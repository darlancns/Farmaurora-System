<script setup lang="ts">
import type { Medicamento } from "#shared/types/processo";

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
    <p class="mb-1.5 text-[10.5px] text-ink-soft">Medicamentos</p>
    <div
      v-for="(item, index) in items"
      :key="index"
      class="mb-1.5 grid grid-cols-[1.4fr_1fr_0.7fr_auto] items-end gap-2"
    >
      <div>
        <label :for="`pf-medicamento-nome-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Nome</label>
        <input
          :id="`pf-medicamento-nome-${index}`"
          :value="item.nome"
          type="text"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('nome-input', index, $event)"
        />
      </div>
      <div>
        <label :for="`pf-medicamento-dosagem-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Dosagem</label>
        <input
          :id="`pf-medicamento-dosagem-${index}`"
          :value="item.dosagem"
          type="text"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('dosagem-input', index, $event)"
        />
      </div>
      <div>
        <label :for="`pf-medicamento-quantidade-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Quantidade</label>
        <input
          :id="`pf-medicamento-quantidade-${index}`"
          :value="item.quantidade"
          type="text"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="emit('quantidade-input', index, $event)"
        />
      </div>
      <div class="flex gap-1">
        <button
          v-if="index > 0"
          type="button"
          title="Remover medicamento"
          class="rounded-md px-1.5 py-2 text-ink-soft transition-colors hover:text-danger"
          @click="emit('remove', index)"
        >
          ✕
        </button>
        <button
          v-if="index === items.length - 1"
          type="button"
          title="Adicionar medicamento"
          class="rounded-md border border-hairline px-2.5 py-2 text-[13px] font-semibold text-accent-dark transition-colors hover:bg-paper"
          @click="emit('add')"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>
