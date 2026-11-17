<script setup lang="ts">
import type { BrandMedicamento, Medicamento } from "#shared/types/processo";
import { LIMITE_LABORATORIO } from "#shared/constants/processos";
import AppSelect from "../AppSelect.vue";
import { BRAND_MEDICAMENTO_OPTIONS } from "../../utils/processoOptions";
import {
  BOTAO_REMOVER_CLASS,
  INPUT_COMPACTO_CLASS,
  LABEL_CLASS,
  SELECT_CAMPO_CLASS,
} from "../../utils/processoFormClasses";

withDefaults(
  defineProps<{
    items: Medicamento[];
    // Oculta o rótulo "Medicamentos" de cima (quando o bloco que envolve o componente já tem esse título na legenda).
    semRotulo?: boolean;
  }>(),
  { semRotulo: false },
);

const emit = defineEmits<{
  "nome-input": [index: number, event: Event];
  "quantidade-input": [index: number, event: Event];
  "laboratorio-input": [index: number, event: Event];
  "laboratorio-blur": [index: number];
  "brand-change": [index: number, brand: BrandMedicamento | ""];
  add: [];
  remove: [index: number];
}>();
</script>

<template>
  <div>
    <p v-if="!semRotulo" :class="LABEL_CLASS">Medicamentos</p>
    <!-- Cada item: (1) Qtd. (estreita, texto livre, ~14 caracteres) / Medicamento (o resto) / botões como sempre foram: remover (✕,
         a partir do 2º item) e depois adicionar ("+", só no último item); (2) logo abaixo, Laboratório (o resto da linha) / Brand
         (11.5rem, à direita), empilhados em coluna abaixo de sm. A dosagem NÃO é mais um campo do formulário (o valor que um
         item já tenha continua sendo preservado ao salvar; ver buildBasePayload). Ordem do DOM = ordem visual = ordem do Tab
         (Qtd., Medicamento, ✕, +, Laboratório, Brand, próximo item); nenhuma classe order-*. Abaixo de lg os botões vão para
         a linha de baixo da 1ª linha; em lg+ ficam na mesma linha, à direita. Remover o item remove as duas linhas. -->
    <div
      v-for="(item, index) in items"
      :key="index"
      class="mb-3 border-b border-hairline pb-3 last:mb-0 last:border-b-0 last:pb-0 lg:mb-3 lg:border-b-0 lg:pb-0 lg:last:mb-1.5"
    >
      <div class="grid grid-cols-[10rem_minmax(0,1fr)] items-end gap-2 lg:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
        <div>
          <label :for="`pf-medicamento-quantidade-${index}`" :class="LABEL_CLASS">Qtd.</label>
          <input
            :id="`pf-medicamento-quantidade-${index}`"
            :value="item.quantidade"
            type="text"
            :class="INPUT_COMPACTO_CLASS"
            @input="emit('quantidade-input', index, $event)"
          />
        </div>
        <div>
          <label :for="`pf-medicamento-nome-${index}`" :class="LABEL_CLASS">Medicamento</label>
          <input
            :id="`pf-medicamento-nome-${index}`"
            :value="item.nome"
            type="text"
            :class="INPUT_COMPACTO_CLASS"
            @input="emit('nome-input', index, $event)"
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
      <!-- Laboratório / Brand do item. minmax(0,1fr): o Laboratório encolhe sem empurrar a largura do modal. -->
      <div
        data-medicamento-extra
        class="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11.5rem] lg:mt-1.5"
      >
        <div class="min-w-0">
          <label :for="`pf-medicamento-laboratorio-${index}`" :class="LABEL_CLASS">Laboratório</label>
          <!-- data-sem-maiuscula: o plugin global fica de fora. Ao digitar, a 1ª letra de cada palavra vira maiúscula e o resto
               fica como digitado (cursor preservado; na composição de acentos/IME, só no fim dela); ao sair, normalização
               completa. Ver useProcessoForm.onMedicamentoLaboratorioInput. -->
          <input
            :id="`pf-medicamento-laboratorio-${index}`"
            data-sem-maiuscula
            :value="item.laboratorio"
            type="text"
            :maxlength="LIMITE_LABORATORIO"
            autocomplete="off"
            :class="INPUT_COMPACTO_CLASS"
            @input="emit('laboratorio-input', index, $event)"
            @compositionend="emit('laboratorio-input', index, $event)"
            @blur="emit('laboratorio-blur', index)"
          />
        </div>
        <div class="min-w-0" :class="SELECT_CAMPO_CLASS">
          <label :for="`pf-medicamento-brand-${index}`" :class="LABEL_CLASS">Brand</label>
          <AppSelect
            :id="`pf-medicamento-brand-${index}`"
            :model-value="item.brand"
            :options="BRAND_MEDICAMENTO_OPTIONS"
            @update:model-value="(brand: BrandMedicamento | '') => emit('brand-change', index, brand)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
