<script setup lang="ts">
import type { ConsultorNome, NewPatientDTO, Patient } from "#shared/types/Patient";
import { usePatientForm } from "../../composables/usePatientForm";
import { usePatientAttachments } from "../../composables/usePatientAttachments";
import { CONSULTORES } from "#shared/constants/consultores";
import AttachmentsModal from "./AttachmentsModal.vue";
import ConfirmDialog from "../ConfirmDialog.vue";
import AppSelect from "../AppSelect.vue";
import type { AppSelectOption } from "../../types/appSelect";

const props = defineProps<{
  editingPatient?: Patient | null;
}>();

const emit = defineEmits<{
  submit: [payload: NewPatientDTO, attachments: Record<string, string>];
  update: [id: string, payload: NewPatientDTO];
  "cancel-edit": [];
  invalid: [message: string];
}>();

const consultorOptions: AppSelectOption<ConsultorNome | "">[] = [
  { value: "", label: "Selecione" },
  ...CONSULTORES.map((nome) => ({ value: nome, label: nome })),
];

const {
  form,
  medicamentos,
  despesasPorRemessa,
  transportesPorRemessa,
  reducaoRemessasPendente,
  mensagemReducaoRemessas,
  confirmarReducaoRemessas,
  cancelarReducaoRemessas,
  addMedicamentoItem,
  removeMedicamentoItem,
  resetFormState: resetPatientFormState,
  onDataInput,
  onPacienteInput,
  onMedicamentoInput,
  onCurrencyInput,
  onCurrencyPaste,
  onDespesaInput,
  onDespesaPaste,
  onTransporteInput,
  onTransportePaste,
  handleSubmit,
} = usePatientForm({
  editingPatient: () => props.editingPatient,
  onSubmit: (payload) => emit("submit", payload, { ...stagedAttachments }),
  onUpdate: (id, payload) => emit("update", id, payload),
  onInvalid: (message) => emit("invalid", message),
});

const {
  requiredSlots,
  attachmentPreviews,
  attachedCount,
  stagedAttachments,
  showAttachmentsModal,
  onStageAttachment,
  onUnstageAttachment,
  resetStaged: resetStagedAttachments,
} = usePatientAttachments({
  editingPatient: () => props.editingPatient,
  remessas: () => Math.max(1, Number(form.remessas) || 1),
  custoImportacao: () => form.custoImportacao,
  despesasPorRemessa,
  transportesPorRemessa,
  medicamentos,
});

function resetFormState(): void {
  resetPatientFormState();
  resetStagedAttachments();
}

function cancelEdit(): void {
  emit("cancel-edit");
}

defineExpose({ resetFormState });
</script>

<template>
  <div id="patient-form" class="rounded-[10px] border border-hairline bg-paper-raised p-4">
    <div
      v-if="editingPatient"
      class="mb-3 flex items-center justify-between gap-2 rounded-md border border-accent-dark/30 bg-paper px-3 py-2"
    >
      <p class="text-[12px] font-medium text-accent-dark">
        Editando: {{ editingPatient.paciente.toUpperCase() }}
      </p>
      <button
        type="button"
        class="text-[11.5px] font-semibold text-ink-soft transition-colors hover:text-danger"
        @click="cancelEdit"
      >
        Cancelar edição
      </button>
    </div>

    <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
      <div class="grid grid-cols-[1fr_1.6fr_0.6fr] gap-2.5">
        <div>
          <label for="f-data" class="mb-1.5 block text-[10.5px] text-ink-soft">Data</label>
          <input
            id="f-data"
            :value="form.data"
            type="text"
            inputmode="numeric"
            maxlength="10"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onDataInput"
          />
        </div>

        <div>
          <label for="f-consultor" class="mb-1.5 block text-[10.5px] text-ink-soft">Consultor</label>
          <AppSelect id="f-consultor" v-model="form.consultor" :options="consultorOptions" placeholder="Selecione" />
        </div>

        <div>
          <label for="f-remessas" class="mb-1.5 block text-[10.5px] text-ink-soft">Remessas</label>
          <input
            id="f-remessas"
            v-model="form.remessas"
            type="number"
            min="1"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>
      </div>

      <div>
        <label for="f-paciente" class="mb-1.5 block text-[10.5px] text-ink-soft">Paciente</label>
        <input
          id="f-paciente"
          :value="form.paciente"
          type="text"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          @input="onPacienteInput"
        />
      </div>

      <div
        v-for="(item, index) in medicamentos"
        :key="index"
        class="grid grid-cols-[70px_1fr_auto] items-end gap-2.5"
      >
        <div>
          <label :for="`f-qtd-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Qtd.</label>
          <input
            :id="`f-qtd-${index}`"
            v-model="item.qtd"
            type="number"
            min="1"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div>
          <label :for="`f-medicamento-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">
            Medicamento
          </label>
          <input
            :id="`f-medicamento-${index}`"
            :value="item.medicamento"
            type="text"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onMedicamentoInput(index, $event)"
          />
        </div>

        <div class="flex gap-1">
          <button
            v-if="index > 0"
            type="button"
            title="Remover medicamento"
            class="rounded-md px-1.5 py-2 text-ink-soft transition-colors hover:text-danger"
            @click="removeMedicamentoItem(index)"
          >
            ✕
          </button>
          <button
            v-if="index === medicamentos.length - 1"
            type="button"
            title="Adicionar medicamento"
            class="rounded-md border border-hairline px-2.5 py-2 text-[13px] font-semibold text-accent-dark transition-colors hover:bg-paper"
            @click="addMedicamentoItem"
          >
            +
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label for="f-alvara" class="mb-1.5 block text-[10.5px] text-ink-soft">Alvará (R$)</label>
          <input
            id="f-alvara"
            :value="form.alvara"
            type="text"
            inputmode="decimal"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onCurrencyInput('alvara', $event)"
            @paste="onCurrencyPaste('alvara', $event)"
          />
        </div>

        <div>
          <label for="f-custo" class="mb-1.5 block text-[10.5px] text-ink-soft">Custo (R$)</label>
          <input
            id="f-custo"
            :value="form.custoImportacao"
            type="text"
            inputmode="decimal"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onCurrencyInput('custoImportacao', $event)"
            @paste="onCurrencyPaste('custoImportacao', $event)"
          />
        </div>
      </div>

      <div v-for="(_, index) in despesasPorRemessa" :key="index" class="grid grid-cols-2 gap-2.5">
        <div>
          <label :for="`f-despesa-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">
            Despachante {{ index + 1 }} (R$)
          </label>
          <input
            :id="`f-despesa-${index}`"
            :value="despesasPorRemessa[index]"
            type="text"
            inputmode="decimal"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onDespesaInput(index, $event)"
            @paste="onDespesaPaste(index, $event)"
          />
        </div>

        <div>
          <label :for="`f-transporte-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">
            Transporte {{ index + 1 }} (R$)
          </label>
          <input
            :id="`f-transporte-${index}`"
            :value="transportesPorRemessa[index]"
            type="text"
            inputmode="decimal"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onTransporteInput(index, $event)"
            @paste="onTransportePaste(index, $event)"
          />
        </div>
      </div>

      <button
        v-if="requiredSlots.length > 0"
        id="btn-open-attachments"
        type="button"
        class="w-full rounded-lg border border-hairline bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
        @click="showAttachmentsModal = true"
      >
        Anexar documentos ({{ attachedCount }}/{{ requiredSlots.length }})
      </button>

      <button
        id="btn-add-patient"
        type="submit"
        class="mt-1 w-full rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
      >
        {{ editingPatient ? "Salvar alterações" : "+ Adicionar lançamento" }}
      </button>
    </form>

    <AttachmentsModal
      v-if="showAttachmentsModal"
      :slots="requiredSlots"
      :staged="attachmentPreviews"
      :patient-id="editingPatient?.id"
      :patient-name="form.paciente"
      @stage="onStageAttachment"
      @unstage="onUnstageAttachment"
      @close="showAttachmentsModal = false"
    />

    <ConfirmDialog
      v-if="reducaoRemessasPendente"
      title="Reduzir remessas"
      :message="mensagemReducaoRemessas"
      confirm-label="Sim, reduzir"
      cancel-label="Cancelar"
      danger
      @confirm="confirmarReducaoRemessas"
      @close="cancelarReducaoRemessas"
    />
  </div>
</template>
