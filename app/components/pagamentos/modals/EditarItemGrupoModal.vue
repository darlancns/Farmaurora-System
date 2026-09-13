<script setup lang="ts">
import { reactive } from "vue";
import { parseBrCurrency } from "../../../utils/formatters";
import { useTitleCaseInput } from "../../../composables/useTitleCaseInput";
import { initialCurrencyStr, useCurrencyField } from "../../../composables/useCurrencyField";
import BaseModal from "../../BaseModal.vue";

const props = defineProps<{
  paciente: string;
  valor: number;
}>();

const emit = defineEmits<{
  submit: [payload: { paciente: string; valor: number }];
  close: [];
  invalid: [message: string];
}>();

const form = reactive({
  pacienteStr: props.paciente,
  valorStr: initialCurrencyStr(props.valor),
});

const onPacienteInput = useTitleCaseInput((value) => {
  form.pacienteStr = value;
});
const { normalizar: normalizarValor, onPaste: onPasteValor } = useCurrencyField(
  () => form.valorStr,
  (value) => {
    form.valorStr = value;
  }
);

function submit(): void {
  normalizarValor();
  const paciente = form.pacienteStr.trim();
  const valor = parseBrCurrency(form.valorStr);
  if (!paciente) {
    emit("invalid", "Informe o nome do paciente.");
    return;
  }
  if (!(valor > 0)) {
    emit("invalid", "Informe um valor maior que zero.");
    return;
  }
  emit("submit", { paciente, valor });
}
</script>

<template>
  <BaseModal id="editar-item-grupo-overlay" @close="emit('close')">
    <div class="w-full max-w-[420px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">Editar pagamento</h2>

      <form id="form-editar-item-grupo" class="flex flex-col gap-3" @submit.prevent="submit">
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Paciente
          <input
            id="ei-paciente"
            :value="form.pacienteStr"
            type="text"
            class="rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onPacienteInput"
          />
        </label>

        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Valor
          <input
            id="ei-valor"
            v-model="form.valorStr"
            type="text"
            inputmode="decimal"
            placeholder="0,00"
            class="rounded-md border border-hairline bg-paper px-2.5 py-2 text-right font-mono text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @paste="onPasteValor"
            @blur="normalizarValor"
          />
        </label>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-cancel-editar-item"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-save-editar-item"
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
