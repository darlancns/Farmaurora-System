<script setup lang="ts">
import { nextTick } from "vue";
import { LIMITE_LABORATORIO } from "#shared/constants/processos";
import { COMPRA_LINHA_MAX, COMPRA_MAX_ITENS } from "#shared/constants/compra";
import type { BrandMedicamento } from "#shared/types/processo";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { adicionarItem, atualizarItem, removerItem } from "#shared/utils/compraForm";
import { BRAND_MEDICAMENTO_OPTIONS } from "../../utils/processoOptions";
import { INPUT_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";
import CompraMedicamentoInput from "./CompraMedicamentoInput.vue";
import CompraPorMedicamento from "./CompraPorMedicamento.vue";

// As linhas 1 a 4 do formulário (a ordem do resumo): Medicamento, Laboratório, Brand e Quantidade. Cada uma é POR MEDICAMENTO: com um só,
// um controle; com dois ou mais, um por medicamento, rotulados "Med. 1", "Med. 2". O "+" (adicionar medicamento, com aria-label e title) fica à direita do input do ÚLTIMO medicamento; os demais têm o "✕".
const props = defineProps<{ compra: Compra; desabilitado: boolean }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const atualizar = (id: string, mudancas: Partial<Compra["itens"][number]>): void => emit("alterar", { itens: atualizarItem(props.compra.itens, id, mudancas) });
const adicionar = (): void => emit("alterar", { itens: adicionarItem(props.compra.itens, COMPRA_MAX_ITENS) });
// Remover: o foco vai para o campo Medicamento do medicamento de ANTES (ou, se era o primeiro, do que passou a ser o primeiro): nada se perde.
function remover(id: string): void {
  const itens = props.compra.itens;
  const i = itens.findIndex((x) => x.id === id);
  const vizinho = itens[i - 1] ?? itens[i + 1];
  emit("alterar", { itens: removerItem(itens, id) });
  if (vizinho) void nextTick(() => document.getElementById(`compra-item-${vizinho.id}-medicamento`)?.focus());
}

const noLimite = (): boolean => props.compra.itens.length >= COMPRA_MAX_ITENS;
</script>

<template>
  <CompraPorMedicamento id-linha="medicamento" rotulo="Medicamento" campo="medicamento" :itens="compra.itens">
    <template #default="{ item, indice, idControle, nomeAcessivel, total }">
      <CompraMedicamentoInput
        :item="item"
        :id-controle="idControle"
        :nome-acessivel="nomeAcessivel"
        :rotulo-med="`Med. ${indice + 1}`"
        :pode-remover="total > 1"
        :eh-ultimo="indice === total - 1"
        :no-limite="noLimite()"
        :desabilitado="desabilitado"
        @atualizar="(m) => atualizar(item.id, m)"
        @remover="remover(item.id)"
        @adicionar="adicionar"
      />
    </template>
  </CompraPorMedicamento>

  <CompraPorMedicamento id-linha="laboratorio" rotulo="Laboratório" campo="laboratorio" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <input
        :id="idControle"
        type="text"
        :maxlength="LIMITE_LABORATORIO"
        autocomplete="off"
        :aria-label="nomeAcessivel"
        :class="INPUT_CLASS"
        :value="item.laboratorio"
        :disabled="desabilitado"
        @input="atualizar(item.id, { laboratorio: ($event.target as HTMLInputElement).value })"
      />
    </template>
  </CompraPorMedicamento>

  <CompraPorMedicamento id-linha="brand" rotulo="Brand" campo="brand" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <div :class="[SELECT_CAMPO_CLASS]">
        <AppSelect
          :id="idControle"
          :model-value="item.brand"
          :options="BRAND_MEDICAMENTO_OPTIONS"
          :aria-label="nomeAcessivel"
          :disabled="desabilitado"
          @update:model-value="(brand: BrandMedicamento | '') => atualizar(item.id, { brand })"
        />
      </div>
    </template>
  </CompraPorMedicamento>

  <CompraPorMedicamento id-linha="quantidade" rotulo="Quantidade" campo="quantidade" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <input
        :id="idControle"
        type="text"
        :maxlength="COMPRA_LINHA_MAX"
        placeholder="ex.: 12 ampolas"
        autocomplete="off"
        :aria-label="nomeAcessivel"
        :class="[INPUT_CLASS]"
        :value="item.quantidade"
        :disabled="desabilitado"
        @input="atualizar(item.id, { quantidade: ($event.target as HTMLInputElement).value })"
      />
    </template>
  </CompraPorMedicamento>
</template>
