<script setup lang="ts">
import { computed, ref } from "vue";
import type { ItemCompra, OpcaoNome } from "#shared/types/compra";
import type { AppSelectOption } from "../../types/appSelect";
import { BOTAO_REMOVER_CLASS, INPUT_COMPACTO_CLASS, LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";
import CampoDinheiro from "./CampoDinheiro.vue";

// UMA linha de medicamento da ordem: Qtd | Medicamento | Apresentação | Valor unit. (US$) | Valor real (US$) | Temperatura | ✕.
// Abaixo, "Detalhes" recolhido (abre sozinho se Referência ou Laboratório estiverem preenchidos). O ✕ não existe no primeiro item
// (um item não pode ser removido se for o único). Os ids dos campos usam o id do item (estável: o `v-for` do pai usa :key = id).
const props = defineProps<{
  item: ItemCompra;
  /** O ✕ aparece (todos menos o primeiro). */
  podeRemover: boolean;
  desabilitado: boolean;
  temperaturas: OpcaoNome[];
}>();

const emit = defineEmits<{
  atualizar: [mudancas: Partial<ItemCompra>];
  remover: [];
}>();

const idCampo = (nome: string): string => `item-${props.item.id}-${nome}`;

const temperaturaOptions = computed<AppSelectOption<string>[]>(() => {
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...props.temperaturas.map((t) => ({ value: t.nome, label: t.nome }))];
  // A temperatura do item é texto copiado: um valor que não está na lista (antigo, ou de uma temperatura desativada) continua aparecendo.
  const atual = props.item.temperatura.trim();
  if (atual !== "" && !props.temperaturas.some((t) => t.nome === props.item.temperatura)) lista.push({ value: props.item.temperatura, label: atual });
  return lista;
});

// "Detalhes" abre sozinho se algum estiver preenchido; depois disso quem manda é a pessoa.
const detalhesAbertos = ref(props.item.referencia.trim() !== "" || props.item.laboratorio.trim() !== "");
function aoAlternarDetalhes(event: Event): void {
  detalhesAbertos.value = (event.target as HTMLDetailsElement).open;
}
</script>

<template>
  <div :id="`item-${item.id}`" data-item-linha class="rounded-md border border-hairline/70 bg-paper/40 p-2.5">
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(6rem,0.7fr)_minmax(11rem,2.2fr)_minmax(8rem,1.2fr)_minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(9rem,1.3fr)_2.75rem] lg:items-end">
      <div>
        <label :for="idCampo('quantidade')" :class="LABEL_CLASS">Qtd</label>
        <input
          :id="idCampo('quantidade')"
          type="text"
          maxlength="300"
          placeholder="ex.: 12 ampolas"
          :class="INPUT_COMPACTO_CLASS"
          :value="item.quantidade"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('atualizar', { quantidade: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="col-span-2 lg:col-span-1">
        <label :for="idCampo('medicamento')" :class="LABEL_CLASS">Medicamento</label>
        <input
          :id="idCampo('medicamento')"
          type="text"
          maxlength="300"
          :class="INPUT_COMPACTO_CLASS"
          :value="item.medicamento"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('atualizar', { medicamento: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="col-span-2 lg:col-span-1">
        <label :for="idCampo('apresentacao')" :class="LABEL_CLASS">Apresentação</label>
        <input
          :id="idCampo('apresentacao')"
          type="text"
          maxlength="300"
          :class="INPUT_COMPACTO_CLASS"
          :value="item.apresentacao"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('atualizar', { apresentacao: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div>
        <label :for="idCampo('valor-unitario')" :class="LABEL_CLASS">Valor unit. (US$)</label>
        <CampoDinheiro :id="idCampo('valor-unitario')" :model-value="item.valorUnitario" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('atualizar', { valorUnitario: v })" />
      </div>

      <div>
        <label :for="idCampo('valor-real')" :class="LABEL_CLASS">Valor real (US$)</label>
        <CampoDinheiro :id="idCampo('valor-real')" :model-value="item.valorReal" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('atualizar', { valorReal: v })" />
      </div>

      <div :class="[SELECT_CAMPO_CLASS, 'col-span-2 lg:col-span-1']">
        <label :for="idCampo('temperatura')" :class="LABEL_CLASS">Temperatura</label>
        <AppSelect :id="idCampo('temperatura')" :model-value="item.temperatura" :options="temperaturaOptions" :disabled="desabilitado" @update:model-value="(v: string) => emit('atualizar', { temperatura: v })" />
      </div>

      <div class="flex items-end justify-end lg:justify-center">
        <button
          v-if="podeRemover && !desabilitado"
          :id="idCampo('remover')"
          type="button"
          aria-label="Remover medicamento"
          title="Remover medicamento"
          :class="BOTAO_REMOVER_CLASS"
          @click="emit('remover')"
        >
          ✕
        </button>
      </div>
    </div>

    <details class="mt-2" :open="detalhesAbertos" @toggle="aoAlternarDetalhes">
      <summary class="cursor-pointer text-[12px] font-semibold text-ink-soft hover:text-accent-dark">Detalhes</summary>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label :for="idCampo('referencia')" :class="LABEL_CLASS">Referência/Bioequivalente</label>
          <input
            :id="idCampo('referencia')"
            type="text"
            maxlength="300"
            :class="INPUT_COMPACTO_CLASS"
            :value="item.referencia"
            :disabled="desabilitado"
            autocomplete="off"
            @input="emit('atualizar', { referencia: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label :for="idCampo('laboratorio')" :class="LABEL_CLASS">Laboratório</label>
          <input
            :id="idCampo('laboratorio')"
            type="text"
            maxlength="300"
            :class="INPUT_COMPACTO_CLASS"
            :value="item.laboratorio"
            :disabled="desabilitado"
            autocomplete="off"
            @input="emit('atualizar', { laboratorio: ($event.target as HTMLInputElement).value })"
          />
        </div>
      </div>
    </details>
  </div>
</template>
