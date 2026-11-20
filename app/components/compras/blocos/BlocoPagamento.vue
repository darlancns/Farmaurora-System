<script setup lang="ts">
import { computed } from "vue";
import type { MomentoPagamentoResumo } from "#shared/types/compraResumo";
import type { MudancasCompra } from "#shared/types/compra";
import type { AppSelectOption } from "../../../types/appSelect";
import { CHECKBOX_CLASS, ROTULO_CHECKBOX_CLASS, type PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";
import SegmentedControl from "../../SegmentedControl.vue";

// Bloco `pagamento`: Alvará na conta (checkbox), Quando pagar ("Vamos pagar" | "Após o envio da AWB"; sem valor inicial) e Termo de
// pagamento posterior ("Sim" | "n/a"; com "Sim" aparece a Observação do termo).
const props = defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const OPCOES_MOMENTO: AppSelectOption<string>[] = [
  { value: "vamos_pagar", label: "Vamos pagar" },
  { value: "apos_awb", label: "Após o envio da AWB" },
];
const OPCOES_TERMO: AppSelectOption<string>[] = [
  { value: "sim", label: "Sim" },
  { value: "na", label: "n/a" },
];

// Vazio = ainda não decidido (null no banco): nenhuma opção marcada.
const momento = computed(() => props.compra.pagamentoMomento ?? "");
const termo = computed(() => (props.compra.termoPosterior ? "sim" : "na"));
</script>

<template>
  <div data-bloco="pagamento" class="contents">
    <label :class="[ROTULO_CHECKBOX_CLASS, 'sm:col-span-2 xl:col-span-4']" for="compra-alvara">
      <input
        id="compra-alvara"
        type="checkbox"
        :class="CHECKBOX_CLASS"
        :checked="compra.pagamentoAlvara === true"
        :disabled="desabilitado"
        @change="emit('alterar', { pagamentoAlvara: ($event.target as HTMLInputElement).checked })"
      />
      <span>Alvará na conta</span>
    </label>

    <div class="sm:col-span-2">
      <span :class="LABEL_CLASS">Quando pagar</span>
      <SegmentedControl
        id="compra-pagamento-momento"
        label="Quando pagar"
        :model-value="momento"
        :options="OPCOES_MOMENTO"
        :disabled="desabilitado"
        @update:model-value="(v: string) => emit('alterar', { pagamentoMomento: v as MomentoPagamentoResumo })"
      />
    </div>

    <div class="sm:col-span-2">
      <span :class="LABEL_CLASS">Termo de pagamento posterior</span>
      <SegmentedControl
        id="compra-termo-posterior"
        label="Termo de pagamento posterior"
        :model-value="termo"
        :options="OPCOES_TERMO"
        :disabled="desabilitado"
        @update:model-value="(v: string) => emit('alterar', { termoPosterior: v === 'sim' })"
      />
    </div>

    <div v-if="compra.termoPosterior" class="sm:col-span-2 xl:col-span-4">
      <label for="compra-termo-observacao" :class="LABEL_CLASS">Observação do termo</label>
      <input
        id="compra-termo-observacao"
        type="text"
        maxlength="2000"
        :class="INPUT_CLASS"
        :value="compra.termoObservacao"
        :disabled="desabilitado"
        autocomplete="off"
        @input="emit('alterar', { termoObservacao: ($event.target as HTMLInputElement).value })"
      />
    </div>
  </div>
</template>
