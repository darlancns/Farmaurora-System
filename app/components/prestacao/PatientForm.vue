<script setup lang="ts">
import type { ConsultorNome, NewPatientDTO, Patient } from "#shared/types/Patient";
import { usePatientForm } from "../../composables/usePatientForm";
import { usePatientAttachments } from "../../composables/usePatientAttachments";
import { CONSULTORES } from "#shared/constants/consultores";
import AttachmentsPanel from "./AttachmentsPanel.vue";
import BaseModal from "../BaseModal.vue";
import ConfirmDialog from "../ConfirmDialog.vue";
import AppSelect from "../AppSelect.vue";
import type { AppSelectOption } from "../../types/appSelect";

const props = defineProps<{
  editingPatient?: Patient | null;
}>();

const emit = defineEmits<{
  submit: [payload: NewPatientDTO, attachments: Record<string, Blob>];
  update: [id: string, payload: NewPatientDTO];
  close: [];
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
  previewsLoading,
  attachedCount,
  stagedAttachments,
  showAttachments,
  onStageAttachment,
  onUnstageAttachment,
  onPreviewError,
} = usePatientAttachments({
  editingPatient: () => props.editingPatient,
  remessas: () => Math.max(1, Number(form.remessas) || 1),
  custoImportacao: () => form.custoImportacao,
  despesasPorRemessa,
  transportesPorRemessa,
  medicamentos,
});

// Esc com o diálogo "Reduzir remessas" aberto fecha só o diálogo (o listener do
// formulário roda primeiro, ainda com a pendência marcada, e ignora o Esc).
function handleOverlayClose(): void {
  if (reducaoRemessasPendente.value) return;
  emit("close");
}
</script>

<template>
  <BaseModal id="patient-form-overlay" @close="handleOverlayClose">
    <!--
      Abaixo de lg o casco vira tela cheia (por cima do BottomNav — overlay do BaseModal em z-900,
      BottomNav em z-40), com cabeçalho fixo e corpo que rola por dentro. Em lg+ volta a ser o
      cartão centralizado, igual aos formulários de Processos/Recados/Pagamentos.
    -->
    <div
      id="patient-form"
      class="fixed inset-0 flex h-dvh w-full flex-col bg-paper-raised lg:static lg:inset-auto lg:h-auto lg:max-h-[90vh] lg:max-w-[640px] lg:rounded-[10px] lg:border lg:border-hairline"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-2 lg:px-5 lg:py-4">
        <div class="min-w-0">
          <p class="mb-1 truncate font-mono text-[11px] tracking-wider text-accent-dark uppercase">
            {{ editingPatient ? editingPatient.paciente : "Prestação" }}
          </p>
          <h2 class="font-display text-[18px] font-semibold text-ink">
            {{ editingPatient ? "Editar prestação" : "Nova prestação" }}
          </h2>
        </div>
        <button
          id="btn-close-patient-form"
          type="button"
          title="Fechar"
          aria-label="Fechar"
          class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-danger lg:mr-0 lg:h-auto lg:w-auto lg:px-2 lg:py-1"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <form
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 lg:p-5"
        @submit.prevent="handleSubmit"
      >
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1.6fr_0.6fr]">
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
          class="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[70px_1fr_auto]"
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
              class="rounded-md px-4 py-2.5 text-ink-soft transition-colors hover:text-danger md:px-1.5 md:py-2"
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
          aria-controls="attachments-panel"
          :aria-expanded="showAttachments"
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-hairline bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
          @click="showAttachments = !showAttachments"
        >
          Anexar documentos ({{ attachedCount }}/{{ requiredSlots.length }})
          <span aria-hidden="true" class="text-[10px]">{{ showAttachments ? "▲" : "▼" }}</span>
        </button>

        <AttachmentsPanel
          v-if="showAttachments && requiredSlots.length > 0"
          :slots="requiredSlots"
          :previews="attachmentPreviews"
          :patient-id="editingPatient?.id"
          :loading="previewsLoading"
          @stage="onStageAttachment"
          @unstage="onUnstageAttachment"
          @preview-error="onPreviewError"
        />

        <button
          id="btn-add-patient"
          type="submit"
          class="mt-1 w-full rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
        >
          {{ editingPatient ? "Salvar alterações" : "+ Adicionar prestação" }}
        </button>
      </form>
    </div>
  </BaseModal>

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
</template>
