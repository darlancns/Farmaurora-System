<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  EmpresaProcesso,
  NewProcessoDTO,
  Processo,
  ProcessoFormUpdatePayload,
  StatusProcesso,
} from "#shared/types/processo";
import { useProcessos } from "../composables/useProcessos";
import { useAuth } from "../composables/useAuth";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import { normalizeText } from "../utils/search";
import { EMPRESA_FILTER_OPTIONS, RESPONSAVEL_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../utils/processoOptions";
import AppSelect from "../components/AppSelect.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import ProcessoGroupList from "../components/processos/ProcessoGroupList.vue";
import ProcessoDeliveredList from "../components/processos/ProcessoDeliveredList.vue";
import ProcessoFormModal from "../components/processos/ProcessoFormModal.vue";

const { processos, fetchProcessos, addProcesso, patchProcesso, removeProcesso } = useProcessos();
const { role, consultorNome, canWrite } = useAuth();
const { showToast } = useToast();

// operacional e administrador escrevem; consultor e socio são somente leitura.
const canWriteProcessos = computed<boolean>(() => canWrite("processos"));
// consultor vê a própria lista direto, sem o agrupamento por consultor.
const flatList = computed<boolean>(() => role.value === "consultor");

onMounted(() => {
  fetchProcessos();
});

type Tab = "andamento" | "entregues";
const activeTab = ref<Tab>("andamento");

const searchQuery = ref("");
const statusFilter = ref<StatusProcesso | "">("");
const empresaFilter = ref<EmpresaProcesso | "">("");
const responsavelFilter = ref("");

const filteredProcessos = computed<Processo[]>(() => {
  let list = processos.value;

  // Defesa em profundidade: o servidor já entrega só os processos do próprio
  // consultor, mas garantimos aqui também.
  if (role.value === "consultor" && consultorNome.value) {
    list = list.filter((p) => p.consultor === consultorNome.value);
  }

  if (statusFilter.value) {
    list = list.filter((p) => p.status === statusFilter.value);
  }
  if (empresaFilter.value) {
    list = list.filter((p) => p.empresa === empresaFilter.value);
  }
  if (responsavelFilter.value) {
    list = list.filter((p) => p.responsavelOperacional === responsavelFilter.value);
  }
  const query = normalizeText(searchQuery.value);
  if (query) {
    list = list.filter((p) => normalizeText(p.paciente).includes(query));
  }

  return list;
});

const andamentoList = computed(() => filteredProcessos.value.filter((p) => p.status !== "entregue"));
const entregueList = computed(() => filteredProcessos.value.filter((p) => p.status === "entregue"));

const showFormModal = ref(false);
const editingProcesso = ref<Processo | null>(null);

function openCreateForm(): void {
  if (!canWriteProcessos.value) return;
  editingProcesso.value = null;
  showFormModal.value = true;
}

function openEditForm(processo: Processo): void {
  if (!canWriteProcessos.value) return;
  editingProcesso.value = processo;
  showFormModal.value = true;
}

function closeForm(): void {
  showFormModal.value = false;
  editingProcesso.value = null;
}

function handleInvalid(message: string): void {
  showToast(message);
}

async function handleSubmit(payload: NewProcessoDTO): Promise<void> {
  try {
    await addProcesso(payload);
    showToast("Processo adicionado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao adicionar processo"));
  }
}

async function handleUpdate(id: string, payload: ProcessoFormUpdatePayload): Promise<void> {
  try {
    await patchProcesso(id, payload);
    showToast("Processo atualizado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar processo"));
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await removeProcesso(id);
    showToast("Processo removido");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover processo"));
  }
}

async function handlePatch(id: string, patch: Partial<NewProcessoDTO>): Promise<void> {
  try {
    await patchProcesso(id, patch);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar processo"));
  }
}
</script>

<template>
  <div id="processos-page" class="mx-auto max-w-[1400px]">
    <GlobalHeader title="Follow-Up" subtitle="Acompanhamento dos processos de importação em andamento.">
      <template #filters>
        <div class="mb-3.5 flex flex-nowrap items-center gap-2.5">
          <div class="relative w-[216px] shrink-0">
            <input
              id="processo-search"
              v-model="searchQuery"
              type="text"
              placeholder="Buscar por paciente..."
              class="w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-8 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
            <button
              v-if="searchQuery"
              id="btn-clear-processo-search"
              type="button"
              title="Limpar busca"
              aria-label="Limpar busca"
              class="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger"
              @click="searchQuery = ''"
            >
              ✕
            </button>
          </div>

          <div v-if="activeTab === 'andamento'" class="w-fit shrink-0">
            <AppSelect id="filtro-status" v-model="statusFilter" :options="STATUS_FILTER_OPTIONS" />
          </div>

          <div class="w-fit shrink-0">
            <AppSelect id="filtro-empresa" v-model="empresaFilter" :options="EMPRESA_FILTER_OPTIONS" />
          </div>

          <div class="w-fit shrink-0">
            <AppSelect id="filtro-responsavel" v-model="responsavelFilter" :options="RESPONSAVEL_FILTER_OPTIONS" />
          </div>

          <button
            v-if="canWriteProcessos"
            id="btn-novo-processo"
            type="button"
            class="ml-auto shrink-0 rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
            @click="openCreateForm"
          >
            + Novo processo
          </button>
        </div>
      </template>

      <template #tabs>
        <div class="mb-3.5 flex gap-1 border-b border-hairline">
          <button
            id="tab-andamento"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
            :class="activeTab === 'andamento' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'andamento'"
          >
            Em andamento ({{ andamentoList.length }})
          </button>
          <button
            id="tab-entregues"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
            :class="activeTab === 'entregues' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'entregues'"
          >
            Entregues ({{ entregueList.length }})
          </button>
        </div>
      </template>
    </GlobalHeader>

    <ProcessoGroupList
      v-if="activeTab === 'andamento'"
      :processos="andamentoList"
      :readonly="!canWriteProcessos"
      :flat="flatList"
      @edit="openEditForm"
      @delete="handleDelete"
      @patch="handlePatch"
    />
    <ProcessoDeliveredList
      v-else
      :processos="entregueList"
      :readonly="!canWriteProcessos"
      @edit="openEditForm"
      @delete="handleDelete"
      @patch="handlePatch"
    />

    <ProcessoFormModal
      v-if="showFormModal && canWriteProcessos"
      :editing-processo="editingProcesso"
      @submit="handleSubmit"
      @update="handleUpdate"
      @close="closeForm"
      @invalid="handleInvalid"
    />
  </div>
</template>
