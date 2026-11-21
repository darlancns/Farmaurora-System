<script setup lang="ts">
import { computed } from "vue";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { montarConsultorOptions } from "../../utils/consultorOptions";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import { INPUT_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";
import CompraCampo from "./CompraCampo.vue";

// As linhas 23 e 24 do formulário (a ordem do resumo): Consultor (consultores ativos do Cadastro; um valor antigo continua aparecendo) e
// Responsável (texto; vem preenchido do servidor com quem criou a compra).
const props = defineProps<{ compra: Compra; desabilitado: boolean; opcoes: OpcoesFormulario }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const consultorOptions = computed(() =>
  montarConsultorOptions(
    props.compra.consultor,
    props.opcoes.consultores.map((c) => ({ nome: c.nome, ativo: true })),
  ),
);
</script>

<template>
  <CompraCampo id-linha="consultor" rotulo="Consultor" para="compra-consultor">
    <div :class="[SELECT_CAMPO_CLASS]">
      <AppSelect id="compra-consultor" :model-value="compra.consultor" :options="consultorOptions" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { consultor: v })" />
    </div>
  </CompraCampo>

  <CompraCampo id-linha="responsavel" rotulo="Responsável" para="compra-responsavel">
    <input
      id="compra-responsavel"
      type="text"
      maxlength="300"
      :class="[INPUT_CLASS]"
      :value="compra.responsavel"
      :disabled="desabilitado"
      autocomplete="off"
      @input="emit('alterar', { responsavel: ($event.target as HTMLInputElement).value })"
    />
  </CompraCampo>
</template>
