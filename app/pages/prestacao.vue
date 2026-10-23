<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import PatientForm from "../components/prestacao/PatientForm.vue";
import PatientTable from "../components/prestacao/PatientTable.vue";
import MonthFilterBar from "../components/prestacao/MonthFilterBar.vue";
import AppSelect from "../components/AppSelect.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import PagamentosFiltrosSheet from "../components/pagamentos/PagamentosFiltrosSheet.vue";
import { usePatients } from "../composables/usePatients";
import { useAuth } from "../composables/useAuth";
import { useAttachments } from "../composables/useAttachments";
import { useDocxGenerator } from "../composables/useDocxGenerator";
import { useWhatsappShare } from "../composables/useWhatsappShare";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import { normalizeText } from "../utils/search";
import { getPatientMonthKey, groupPatientsByMonth, monthFilterOptions, monthKeyId } from "../utils/monthGroups";
import type { NewPatientDTO, PatientComputed } from "#shared/types/Patient";

const { computedPatients, fetchPatients, addPatient, updatePatient, removePatient } = usePatients();
const { canWrite } = useAuth();
// socio e administrador criam/editam/excluem prestações.
const canWritePatients = computed<boolean>(() => canWrite("patients"));
const { uploadAttachment } = useAttachments();
const { generateDocx } = useDocxGenerator();
const { copyMessage } = useWhatsappShare();
const { showToast } = useToast();

const rows = computed<PatientComputed[]>(() => computedPatients());
const searchQuery = ref("");
const selectedMonthKey = ref<string | null>(null);
const monthGroups = computed(() => groupPatientsByMonth(rows.value));

// Abaixo de lg o mês mora no bottom sheet (PagamentosFiltrosSheet, genérico), aberto pelo ícone dentro
// da busca; é o MESMO selectedMonthKey dos chips (o select só traduz null <-> ""). A bolinha do ícone
// conta o mês ativo — a busca por texto não conta.
const showFiltros = ref(false);
const filtrosAtivos = computed<number>(() => (selectedMonthKey.value === null ? 0 : 1));
const mesOptions = computed(() => monthFilterOptions(monthGroups.value));
const mesFiltro = computed<string>({
  get: () => selectedMonthKey.value ?? "",
  set: (value) => {
    selectedMonthKey.value = value === "" ? null : value;
  },
});
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
const showForm = ref(false);
const editingPatientId = ref<string | null>(null);
const editingPatient = computed<PatientComputed | null>(
  () => rows.value.find((p) => p.id === editingPatientId.value) ?? null
);

onMounted(() => {
  fetchPatients();
});

function openCreateForm(): void {
  editingPatientId.value = null;
  showForm.value = true;
}

function closeForm(): void {
  showForm.value = false;
  editingPatientId.value = null;
}

async function handleSubmit(payload: NewPatientDTO, attachments: Record<string, Blob>): Promise<void> {
  try {
    const created = await addPatient(payload);
    closeForm();

    const attachmentEntries = Object.entries(attachments);
    const failures: string[] = [];
    for (const [slotKey, image] of attachmentEntries) {
      try {
        await uploadAttachment(created.id, slotKey, image);
      } catch (e) {
        failures.push(getErrorMessage(e, "erro ao enviar"));
      }
    }

    if (failures.length > 0) {
      showToast(`Prestação adicionada, mas ${failures.length} anexo(s) falharam ao enviar: ${failures[0]}`);
    } else {
      showToast(attachmentEntries.length > 0 ? "Prestação adicionada com anexos" : "Prestação adicionada");
    }
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao adicionar prestação"));
  }
}

function handleInvalid(message: string): void {
  showToast(message);
}

function handleEdit(patient: PatientComputed): void {
  editingPatientId.value = patient.id;
  showForm.value = true;
}

async function handleUpdate(id: string, payload: NewPatientDTO): Promise<void> {
  try {
    await updatePatient(id, payload);
    showToast("Prestação atualizada");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar prestação"));
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await removePatient(id);
    showToast("Prestação removida");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover prestação"));
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
  <!-- pb-20 abaixo de lg: folga pro botão flutuante nunca cobrir o último card (classe estática de
       propósito — mesma razão de processos.vue: condicionar por cargo diverge entre SSR e client).
       Com o painel de filtros ou o modal do formulário aberto a lista interna (#patient-table-scroll, que tem
       rolagem própria) também trava: o useLockBodyScroll só trava body e <main>, então a roda/toque sobre o fundo
       escuro (painel) ou o PageDown com o foco num botão da lista (modal, ex.: o "editar" do card) rolaria a
       lista por trás. Só abaixo de lg (max-lg): em lg+ nada muda. showFiltros e showForm são false no SSR e no
       1º render do client: sem efeito na hydration. -->
  <div
    id="dashboard-page"
    class="mx-auto max-w-[1400px] pb-20 lg:pb-0"
    :class="{ 'max-lg:[&_#patient-table-scroll]:overflow-y-hidden': showFiltros || showForm }"
  >
    <GlobalHeader
      title="Prestações de Contas"
      short-title="Prestações"
      subtitle="Preencha os dados, confira os cálculos e gere a prestação com um clique."
    />

    <div class="mb-3 flex items-center gap-2.5">
      <div class="relative min-w-0 flex-1">
        <input
          id="patient-search"
          v-model="searchQuery"
          type="text"
          placeholder="Buscar por paciente..."
          class="min-h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-[68px] text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:min-h-0 lg:pr-8"
        />
        <button
          v-if="searchQuery"
          id="btn-clear-search"
          type="button"
          title="Limpar busca"
          aria-label="Limpar busca"
          class="absolute top-1/2 right-11 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger lg:right-2"
          @click="searchQuery = ''"
        >
          ✕
        </button>
        <!-- Abaixo de lg: ícone de filtros DENTRO da busca, à direita (mesmo padrão de Processos e
             Pagamentos). Em lg+ some (lg:hidden) e os chips de mês voltam. -->
        <button
          id="btn-filtros-prestacao"
          type="button"
          title="Filtros"
          aria-label="Filtros"
          aria-haspopup="dialog"
          class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-accent-dark lg:hidden"
          @click="showFiltros = true"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
            />
          </svg>
          <span
            v-if="filtrosAtivos > 0"
            id="badge-filtros-prestacao"
            class="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-farm-blue px-1 text-[10px] font-semibold text-white"
          >
            {{ filtrosAtivos }}
          </span>
        </button>
      </div>

      <!-- Abaixo de lg: só o "+" flutuante (FloatingAddButton) acima do BottomNav. Em lg+ o botão
           com texto fica à direita da busca, como "+ Novo processo" e "+ Novo recado". -->
      <button
        v-if="canWritePatients"
        id="btn-nova-prestacao"
        type="button"
        class="hidden shrink-0 rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90 lg:block"
        @click="openCreateForm"
      >
        + Nova prestação
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

    <FloatingAddButton v-if="canWritePatients" id="fab-nova-prestacao" label="Nova prestação" @click="openCreateForm" />

    <PagamentosFiltrosSheet
      v-if="showFiltros"
      id="prestacao-filtros-sheet"
      @close="showFiltros = false"
      @limpar="selectedMonthKey = null"
    >
      <div class="flex flex-col gap-1">
        <label for="sheet-filtro-mes" class="text-[12px] font-semibold text-ink-soft">Mês</label>
        <AppSelect id="sheet-filtro-mes" v-model="mesFiltro" :options="mesOptions" drop-up />
      </div>
    </PagamentosFiltrosSheet>

    <PatientForm
      v-if="canWritePatients && showForm"
      :editing-patient="editingPatient"
      @submit="handleSubmit"
      @update="handleUpdate"
      @close="closeForm"
      @invalid="handleInvalid"
    />
  </div>
</template>
