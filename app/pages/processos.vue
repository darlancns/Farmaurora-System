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
import { filtrarPorStatus, separarAbas } from "../utils/processoListas";
import { EMPRESA_FILTER_OPTIONS, RESPONSAVEL_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../utils/processoOptions";
import AppSelect from "../components/AppSelect.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import ProcessoGroupList from "../components/processos/ProcessoGroupList.vue";
import ProcessoDeliveredList from "../components/processos/ProcessoDeliveredList.vue";
import ProcessoFiltrosSheet from "../components/processos/ProcessoFiltrosSheet.vue";
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

// Abaixo de lg os 3 selects moram no bottom sheet (ProcessoFiltrosSheet), aberto
// pelo ícone ao lado da busca; a bolinha do ícone conta quantos estão ativos.
const showFiltros = ref(false);
const filtrosAtivos = computed<number>(
  () => [statusFilter.value, empresaFilter.value, responsavelFilter.value].filter(Boolean).length,
);

const filteredProcessos = computed<Processo[]>(() => {
  let list = processos.value;

  // Defesa em profundidade: o servidor já entrega só os processos do próprio
  // consultor, mas garantimos aqui também.
  if (role.value === "consultor" && consultorNome.value) {
    list = list.filter((p) => p.consultor === consultorNome.value);
  }

  list = filtrarPorStatus(list, statusFilter.value);
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

const andamentoList = computed(() => separarAbas(filteredProcessos.value).andamento);
const entregueList = computed(() => separarAbas(filteredProcessos.value).entregues);

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
  <!--
    pb-20 abaixo de lg: folga pro botão flutuante "+ Novo processo" nunca cobrir o último item.
    Classe ESTÁTICA de propósito: condicionar por cargo (canWriteProcessos) aqui seria um
    atributo divergente entre SSR (sem usuário) e client (com usuário) — o Vue não corrige
    atributos no hydration e a folga nunca seria aplicada. Cargos somente-leitura ficam com
    80px de folga a mais, sem efeito visível.
  -->
  <div id="processos-page" class="mx-auto max-w-[1400px] pb-20 lg:pb-0">
    <GlobalHeader title="Follow-Up" subtitle="Acompanhamento dos processos de importação em andamento.">
      <template #filters>
        <!-- mb-[3px] abaixo de lg: com o botão de aba de 44px (texto centrado), o texto fica com o mesmo respiro
             acima (a partir da busca) e abaixo (até a linha da barra). Em lg+ o mb-3.5 de sempre. -->
        <div id="processo-filtros" class="mb-[3px] flex flex-col gap-2.5 lg:mb-3.5 lg:flex-row lg:flex-wrap lg:items-center">
          <!-- Abaixo de lg: busca com o ícone de filtros DENTRO dela, à direita. Em lg+ o wrapper é
               `contents` (a busca volta a ser filha direta da linha de filtros, como sempre foi). -->
          <div class="flex items-stretch gap-2.5 lg:contents">
            <div class="relative min-w-0 flex-1 lg:w-[216px] lg:flex-none lg:shrink-0">
              <input
                id="processo-search"
                v-model="searchQuery"
                type="text"
                placeholder="Buscar por paciente..."
                class="w-full rounded-md border border-hairline bg-paper px-3 py-[11px] pr-[68px] text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:py-2 lg:pr-8"
              />
              <button
                v-if="searchQuery"
                id="btn-clear-processo-search"
                type="button"
                title="Limpar busca"
                aria-label="Limpar busca"
                class="absolute top-1/2 right-11 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger lg:right-2"
                @click="searchQuery = ''"
              >
                ✕
              </button>
              <button
                id="btn-filtros-processo"
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
                  id="badge-filtros-ativos"
                  class="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-farm-blue px-1 text-[10px] font-semibold text-white"
                >
                  {{ filtrosAtivos }}
                </span>
              </button>
            </div>
          </div>

          <div v-if="activeTab === 'andamento'" class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-status" v-model="statusFilter" :options="STATUS_FILTER_OPTIONS" />
          </div>

          <div class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-empresa" v-model="empresaFilter" :options="EMPRESA_FILTER_OPTIONS" />
          </div>

          <div class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-responsavel" v-model="responsavelFilter" :options="RESPONSAVEL_FILTER_OPTIONS" />
          </div>

          <!-- Abaixo de lg: só o "+" flutuante (FloatingAddButton) acima do BottomNav. Em lg+ o botão
               com texto volta pra linha de filtros, à direita, igual a antes. -->
          <FloatingAddButton v-if="canWriteProcessos" id="fab-novo-processo" label="Novo processo" @click="openCreateForm" />
          <button
            v-if="canWriteProcessos"
            id="btn-novo-processo"
            type="button"
            class="hidden rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90 lg:ml-auto lg:block lg:shrink-0"
            @click="openCreateForm"
          >
            + Novo processo
          </button>
        </div>
      </template>

      <template #tabs>
        <div class="mb-3.5 flex gap-0 border-b border-hairline lg:gap-1">
          <button
            id="tab-andamento"
            type="button"
            class="flex-1 border-b-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11 lg:flex-[0_1_auto] lg:border-b-2"
            :class="activeTab === 'andamento' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'andamento'"
          >
            Em andamento ({{ andamentoList.length }})
          </button>
          <button
            id="tab-entregues"
            type="button"
            class="flex-1 border-b-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11 lg:flex-[0_1_auto] lg:border-b-2"
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

    <ProcessoFiltrosSheet
      v-if="showFiltros"
      v-model:status="statusFilter"
      v-model:empresa="empresaFilter"
      v-model:responsavel="responsavelFilter"
      :show-status="activeTab === 'andamento'"
      @close="showFiltros = false"
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
