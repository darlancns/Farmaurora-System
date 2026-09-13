<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import PatientForm from "../components/prestacao/PatientForm.vue";
import PatientTable from "../components/prestacao/PatientTable.vue";
import MonthFilterBar from "../components/prestacao/MonthFilterBar.vue";
import { usePatients } from "../composables/usePatients";
import { useAuth } from "../composables/useAuth";
import { useAttachments } from "../composables/useAttachments";
import { useDocxGenerator } from "../composables/useDocxGenerator";
import { useWhatsappShare } from "../composables/useWhatsappShare";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import { normalizeText } from "../utils/search";
import { getPatientMonthKey, groupPatientsByMonth, monthKeyId } from "../utils/monthGroups";
import type { NewPatientDTO, PatientComputed } from "#shared/types/Patient";

const { patients, computedPatients, fetchPatients, addPatient, updatePatient, removePatient } = usePatients();
const { canWrite } = useAuth();
// Só administrador cria/edita/exclui prestações; socio é somente leitura.
const canWritePatients = computed<boolean>(() => canWrite("patients"));
const { uploadAttachment } = useAttachments();
const { generateDocx } = useDocxGenerator();
const { copyMessage } = useWhatsappShare();
const { showToast } = useToast();

const rows = computed<PatientComputed[]>(() => computedPatients());
const searchQuery = ref("");
const selectedMonthKey = ref<string | null>(null);
const monthGroups = computed(() => groupPatientsByMonth(rows.value));
const filteredRows = computed<PatientComputed[]>(() => {
  let list = rows.value;

  if (selectedMonthKey.value !== null) {
    list = list.filter((patient) => monthKeyId(getPatientMonthKey(patient)) === selectedMonthKey.value);
  }

  const query = normalizeText(searchQuery.value);
  if (query) {
    list = list.filter((patient) => normalizeText(patient.paciente).includes(query));
  }

  return list;
});
const hasActiveFilter = computed(() => Boolean(searchQuery.value.trim()) || selectedMonthKey.value !== null);
const editingPatientId = ref<string | null>(null);
const editingPatient = computed<PatientComputed | null>(
  () => rows.value.find((p) => p.id === editingPatientId.value) ?? null
);
const patientFormRef = ref<InstanceType<typeof PatientForm> | null>(null);

onMounted(() => {
  fetchPatients();
});

async function handleSubmit(payload: NewPatientDTO, attachments: Record<string, string>): Promise<void> {
  try {
    const created = await addPatient(payload);
    patientFormRef.value?.resetFormState();

    const attachmentEntries = Object.entries(attachments);
    let failedCount = 0;
    for (const [slotKey, imageBase64] of attachmentEntries) {
      try {
        await uploadAttachment(created.id, slotKey, imageBase64);
      } catch {
        failedCount++;
      }
    }

    if (failedCount > 0) {
      showToast(`Lançamento adicionado, mas ${failedCount} anexo(s) falharam ao enviar`);
    } else {
      showToast(attachmentEntries.length > 0 ? "Lançamento adicionado com anexos" : "Lançamento adicionado");
    }
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao adicionar lançamento"));
  }
}

function handleInvalid(message: string): void {
  showToast(message);
}

function handleEdit(patient: PatientComputed): void {
  editingPatientId.value = patient.id;
}

function handleCancelEdit(): void {
  editingPatientId.value = null;
}

async function handleUpdate(id: string, payload: NewPatientDTO): Promise<void> {
  try {
    await updatePatient(id, payload);
    showToast("Lançamento atualizado");
    editingPatientId.value = null;
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar lançamento"));
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await removePatient(id);
    showToast("Lançamento removido");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover lançamento"));
  }
}

async function handleGenerateWord(patient: PatientComputed): Promise<void> {
  try {
    await generateDocx(patient);
    showToast(`Documento gerado para ${patient.paciente}`);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao gerar documento"));
  }
}

async function handleCopyWhatsapp(patient: PatientComputed): Promise<void> {
  try {
    await copyMessage(patient);
    showToast("Mensagem copiada — cole no WhatsApp");
  } catch {
    showToast("Não foi possível copiar automaticamente");
  }
}
</script>

<template>
  <div id="dashboard-page" class="mx-auto max-w-[1400px]">
    <div class="mb-4 flex items-end justify-between gap-4 border-b border-hairline pb-3.5">
      <div>
        <h1 class="font-display text-[28px] font-semibold tracking-tight text-ink">
          Prestações de Contas
        </h1>
        <p class="mt-1 text-[13px] text-ink-soft">
          Preencha os dados, confira os cálculos e gere a prestação com um clique.
        </p>
      </div>
      <div class="text-right font-mono text-[13px] text-ink-soft">
        <strong class="block text-2xl font-semibold text-ink">{{ filteredRows.length }}</strong>
        <span v-if="hasActiveFilter">de {{ patients.length }} lançamentos</span>
        <span v-else>lançamentos</span>
      </div>
    </div>

    <div class="flex items-start gap-4">
      <div v-if="canWritePatients" class="w-[400px] shrink-0">
        <PatientForm
          ref="patientFormRef"
          :editing-patient="editingPatient"
          @submit="handleSubmit"
          @update="handleUpdate"
          @cancel-edit="handleCancelEdit"
          @invalid="handleInvalid"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="relative mb-3">
          <input
            id="patient-search"
            v-model="searchQuery"
            type="text"
            placeholder="Buscar por paciente..."
            class="w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-8 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
          <button
            v-if="searchQuery"
            id="btn-clear-search"
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            class="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger"
            @click="searchQuery = ''"
          >
            ✕
          </button>
        </div>

        <MonthFilterBar v-model="selectedMonthKey" :months="monthGroups" />

        <PatientTable
          :patients="filteredRows"
          :search-query="searchQuery"
          :readonly="!canWritePatients"
          @delete="handleDelete"
          @edit="handleEdit"
          @generate-word="handleGenerateWord"
          @copy-whatsapp="handleCopyWhatsapp"
        />
      </div>
    </div>
  </div>
</template>
