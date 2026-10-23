<script setup lang="ts">
import { ref } from "vue";
import { dataBrasiliaDe, ehDataFutura, hojeBrasilia } from "#shared/utils/dataBrasilia";
import { useTitleCaseInput } from "../../../composables/useTitleCaseInput";
import AppSelect from "../../AppSelect.vue";
import BaseModal from "../../BaseModal.vue";
import type { AppSelectOption } from "../../../types/appSelect";

// Reaproveitado pelos dois lados de "Pagamentos realizados":
//  - Banco: nomeLabel="Cliente", sem nomeOptions (texto livre, como o resto
//    do form de lançamento) — o nome é do LANÇAMENTO clicado.
//  - Despachante/Transportadora: nomeLabel = label do tipo, nomeOptions =
//    a MESMA lista fechada (AppSelect) usada em "Adicionar pagamento" — o
//    nome é do GRUPO inteiro, não pode virar texto livre solto (quebraria
//    o vínculo com a chave PIX salva por nome).
const props = defineProps<{
  nomeLabel: string;
  nome: string;
  nomeOptions?: AppSelectOption<string>[];
  pagoEm: string; // ISO atual
}>();

const emit = defineEmits<{
  submit: [payload: { nome: string; pagoEm: string }];
  close: [];
  invalid: [message: string];
}>();

const nomeStr = ref(props.nome);
const onNomeInput = useTitleCaseInput((value) => {
  nomeStr.value = value;
});

// Datas em Brasília (não no fuso do navegador): a data pré-preenchida é o dia de Brasília do
// instante `pagoEm`, e o máximo do input (`max` nativo) é o "hoje" de Brasília — o mesmo critério
// que o servidor usa para recusar data futura.
const maxData = hojeBrasilia();
const dataStr = ref(dataBrasiliaDe(props.pagoEm));

function submit(): void {
  const nome = nomeStr.value.trim();
  if (!nome) {
    emit("invalid", `Informe ${props.nomeLabel.toLowerCase()}.`);
    return;
  }
  if (!dataStr.value) {
    emit("invalid", "Informe a data do pagamento.");
    return;
  }
  if (ehDataFutura(dataStr.value)) {
    emit("invalid", "A data do pagamento não pode ser posterior a hoje.");
    return;
  }
  emit("submit", { nome, pagoEm: dataStr.value });
}
</script>

<template>
  <BaseModal id="editar-pagamento-realizado-overlay" @close="emit('close')">
    <div class="w-full max-w-[380px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">Editar pagamento realizado</h2>

      <form id="form-editar-pagamento-realizado" class="flex flex-col gap-3" @submit.prevent="submit">
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          {{ nomeLabel }}
          <AppSelect v-if="nomeOptions" id="epr-nome" v-model="nomeStr" :options="nomeOptions" />
          <input
            v-else
            id="epr-nome"
            :value="nomeStr"
            type="text"
            class="rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onNomeInput"
          />
        </label>

        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Data do pagamento
          <input
            id="epr-data"
            v-model="dataStr"
            type="date"
            :max="maxData"
            class="rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </label>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-cancel-editar-pagamento-realizado"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-save-editar-pagamento-realizado"
            type="submit"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
