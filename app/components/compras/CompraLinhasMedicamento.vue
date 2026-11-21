<script setup lang="ts">
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
// um controle; com dois ou mais, um por medicamento, rotulados "Med. 1", "Med. 2". O "+ Adicionar medicamento" fica na linha Medicamento.
const props = defineProps<{ compra: Compra; desabilitado: boolean }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const atualizar = (id: string, mudancas: Partial<Compra["itens"][number]>): void => emit("alterar", { itens: atualizarItem(props.compra.itens, id, mudancas) });
const adicionar = (): void => emit("alterar", { itens: adicionarItem(props.compra.itens, COMPRA_MAX_ITENS) });
const remover = (id: string): void => emit("alterar", { itens: removerItem(props.compra.itens, id) });

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
        :desabilitado="desabilitado"
        @atualizar="(m) => atualizar(item.id, m)"
        @remover="remover(item.id)"
      />
    </template>
    <template #rodape>
      <!-- O mesmo botão "+" do Follow-Up (ProcessoFormMedicamentos): borda hairline, texto em accent-dark, 44px de altura no celular. -->
      <button
        v-if="!desabilitado"
        id="compra-adicionar-medicamento"
        type="button"
        :disabled="noLimite()"
        :title="noLimite() ? `No máximo ${COMPRA_MAX_ITENS} medicamentos por compra` : 'Adicionar medicamento'"
        class="mt-2 flex min-h-11 items-center justify-center rounded-md border border-hairline px-3 py-2 text-[14px] font-semibold text-accent-dark transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-auto lg:text-[13px]"
        @click="adicionar"
      >
        + Adicionar medicamento
      </button>
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
      <div :class="[SELECT_CAMPO_CLASS, 'max-w-xs']">
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
        :class="[INPUT_CLASS, 'max-w-xs']"
        :value="item.quantidade"
        :disabled="desabilitado"
        @input="atualizar(item.id, { quantidade: ($event.target as HTMLInputElement).value })"
      />
    </template>
  </CompraPorMedicamento>
</template>
