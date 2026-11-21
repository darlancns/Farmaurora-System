<script setup lang="ts">
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { atualizarItem } from "#shared/utils/compraForm";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import CampoDinheiro from "./CampoDinheiro.vue";
import CompraCampo from "./CompraCampo.vue";
import CompraPorMedicamento from "./CompraPorMedicamento.vue";
import CompraTemperaturaItem from "./CompraTemperaturaItem.vue";
import { ROTULOS_DO_FORMULARIO } from "../../utils/comprasRotulos";

// As linhas 6 a 10 do formulário (a ordem do resumo): Valor unitário, Valor real (POR MEDICAMENTO, em US$), Frete e Valor real do frete
// (da compra, em US$) e a Temperatura (POR MEDICAMENTO: chips do Cadastro + "Outro…").
const props = defineProps<{ compra: Compra; desabilitado: boolean; opcoes: OpcoesFormulario }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const atualizar = (id: string, mudancas: Partial<Compra["itens"][number]>): void => emit("alterar", { itens: atualizarItem(props.compra.itens, id, mudancas) });
</script>

<template>
  <CompraPorMedicamento id-linha="valor_unitario" :rotulo="ROTULOS_DO_FORMULARIO.valor_unitario" campo="valor-unitario" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <div>
        <CampoDinheiro :id="idControle" :aria-label="nomeAcessivel" :model-value="item.valorUnitario" :disabled="desabilitado" @update:model-value="(v: number | null) => atualizar(item.id, { valorUnitario: v })" />
      </div>
    </template>
  </CompraPorMedicamento>

  <CompraPorMedicamento id-linha="valor_real" :rotulo="ROTULOS_DO_FORMULARIO.valor_real" campo="valor-real" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <div>
        <CampoDinheiro :id="idControle" :aria-label="nomeAcessivel" :model-value="item.valorReal" :disabled="desabilitado" @update:model-value="(v: number | null) => atualizar(item.id, { valorReal: v })" />
      </div>
    </template>
  </CompraPorMedicamento>

  <CompraCampo id-linha="frete" :rotulo="ROTULOS_DO_FORMULARIO.frete" para="compra-frete">
    <div>
      <CampoDinheiro id="compra-frete" :model-value="compra.frete" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('alterar', { frete: v })" />
    </div>
  </CompraCampo>

  <CompraCampo id-linha="frete_real" :rotulo="ROTULOS_DO_FORMULARIO.frete_real" para="compra-frete-real">
    <div>
      <CampoDinheiro id="compra-frete-real" :model-value="compra.freteReal" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('alterar', { freteReal: v })" />
    </div>
  </CompraCampo>

  <CompraPorMedicamento id-linha="temperatura" :rotulo="ROTULOS_DO_FORMULARIO.temperatura" campo="temperatura" :itens="compra.itens">
    <template #default="{ item, idControle, nomeAcessivel }">
      <CompraTemperaturaItem :item="item" :temperaturas="opcoes.temperaturas" :id-controle="idControle" :nome-acessivel="nomeAcessivel" :desabilitado="desabilitado" @atualizar="(m) => atualizar(item.id, m)" />
    </template>
  </CompraPorMedicamento>
</template>
