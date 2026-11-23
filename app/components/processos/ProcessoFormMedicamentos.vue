<script setup lang="ts">
import type { MedicamentoLido } from "#shared/types/Cadastro";
import type { BrandMedicamento, Medicamento } from "#shared/types/processo";
import { LIMITE_LABORATORIO } from "#shared/constants/processos";
import AppSearchSelect, { type OpcaoBusca } from "../AppSearchSelect.vue";
import AppSelect from "../AppSelect.vue";
import { sugerirMedicamentos } from "../../utils/processoMedicamentoSugestoes";
import { BRAND_MEDICAMENTO_OPTIONS } from "../../utils/processoOptions";
import {
  BOTAO_REMOVER_CLASS,
  INPUT_COMPACTO_CLASS,
  LABEL_CLASS,
  SELECT_CAMPO_CLASS,
} from "../../utils/processoFormClasses";

const props = withDefaults(
  defineProps<{
    items: Medicamento[];
    // Oculta o rótulo "Medicamentos" de cima (quando o bloco que envolve o componente já tem esse título na legenda).
    semRotulo?: boolean;
    // Os medicamentos do Cadastro (já carregados): só para SUGERIR o nome ao digitar. O campo continua texto livre; vazio/não carregado = só texto.
    medicamentosCadastro?: readonly MedicamentoLido[];
  }>(),
  { semRotulo: false, medicamentosCadastro: () => [] },
);

// Sugestões do Cadastro (só ativos; filtro no cliente, sem rede). A lista pode chegar depois: lê a prop a cada busca.
const buscarMedicamento = (q: string): Promise<OpcaoBusca[]> => Promise.resolve(sugerirMedicamentos(props.medicamentosCadastro, q));

const emit = defineEmits<{
  // O nome digitado (texto livre, já em MAIÚSCULAS e com o cursor preservado pelo campo) e a sugestão do Cadastro escolhida: os dois só trocam o nome.
  "nome-digitar": [index: number, texto: string];
  "nome-escolher": [index: number, nome: string];
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
          <!-- Texto livre COM sugestão do Cadastro (só ativos): digitar continua valendo; escolher uma sugestão só põe o nome dela. O texto vira
               MAIÚSCULAS no valor, com o cursor onde estava. Sem sugestão, a lista nem aparece; o Enter só escolhe uma sugestão destacada
               pelas setas (senão segue como sempre) e o Esc fecha só a lista. Não há "Pedir cadastro" nem "Fora do Cadastro" aqui (isso é do Compras). -->
          <AppSearchSelect
            :id="`pf-medicamento-nome-${index}`"
            :model-value="item.nome"
            :buscar="buscarMedicamento"
            :input-class="INPUT_COMPACTO_CLASS"
            :debounce-ms="0"
            maiusculas
            somente-sugestao
            @digitar="(texto: string) => emit('nome-digitar', index, texto)"
            @escolher="(opcao: OpcaoBusca) => emit('nome-escolher', index, opcao.rotulo)"
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
