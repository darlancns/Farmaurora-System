<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "#app";
import type {
  EmpresaProcesso,
  NewProcessoDTO,
  Processo,
  ProcessoFormPatchPayload,
  StatusProcesso,
} from "#shared/types/processo";
import { useAberturaPorBusca } from "../composables/useAberturaPorBusca";
import { useProcessos } from "../composables/useProcessos";
import { useAuth } from "../composables/useAuth";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import { filtrarPorBusca } from "../utils/processoBusca";
import { filtrarPorStatus, separarAbas } from "../utils/processoListas";
import {
  DESTAQUE_PROCESSO_MS,
  planejarFocoProcesso,
  processoIdDaQuery,
  QUERY_PROCESSO,
} from "../utils/processoFoco";
import { EMPRESA_FILTER_OPTIONS, RESPONSAVEL_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../utils/processoOptions";
import AppSelect from "../components/AppSelect.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import ProcessoGroupList from "../components/processos/ProcessoGroupList.vue";
import ProcessoDeliveredList from "../components/processos/ProcessoDeliveredList.vue";
import ProcessoFiltrosSheet from "../components/processos/ProcessoFiltrosSheet.vue";
import ProcessoFormModal from "../components/processos/ProcessoFormModal.vue";

const { processos, error, fetchProcessos, addProcesso, patchProcesso, removeProcesso } = useProcessos();
const route = useRoute();
const router = useRouter();
const { role, consultorNome, canWrite } = useAuth();
const { showToast } = useToast();

// socio, operacional e administrador escrevem em Processos (WRITE_ACCESS.processos no RBAC);
// só o consultor é somente leitura.
const canWriteProcessos = computed<boolean>(() => canWrite("processos"));
// consultor vê a própria lista direto, sem o agrupamento por consultor.
const flatList = computed<boolean>(() => role.value === "consultor");


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
  // Paciente, pasta OU Nº Ordem. A pasta ignora espaços e hífens ("2026-375", "2026 375" e "375" acham "2026 - 375");
  // o Nº Ordem também ignora pontuação e maiúsculas ("po-25-0123", "PO250123" e "25-0123" acham "PO-25-0123/XYZ").
  return filtrarPorBusca(list, searchQuery.value);
});

const andamentoList = computed(() => separarAbas(filteredProcessos.value).andamento);
const entregueList = computed(() => separarAbas(filteredProcessos.value).entregues);

// Abertura automática ao buscar: grupos com resultado e, com até 5 resultados na aba, o detalhe de cada
// um. Uma instância por aba, na página (trocar de aba não perde o estado); ao apagar a busca volta ao
// que estava antes de digitar. Ver utils/processoBusca.ts.
const aberturaAndamento = useAberturaPorBusca({
  termo: () => searchQuery.value,
  encontrados: () => andamentoList.value,
  agrupado: () => !flatList.value,
});
const aberturaEntregues = useAberturaPorBusca({
  termo: () => searchQuery.value,
  encontrados: () => entregueList.value,
  agrupado: () => false,
});

// ── Ir até um processo (?processo=<id>, ex.: clique num alerta do sino) ─────────────────────────
// A rota é /processos?processo=<id>. A página não tinha âncora nem modal de detalhe (o detalhe é um
// acordeão local de cada linha), então: troca a aba se preciso, limpa filtros que escondem o
// processo, expande o grupo do consultor (ProcessoGroupList reage ao foco), rola até a linha e a
// destaca por DESTAQUE_PROCESSO_MS. O ?processo= é removido da URL ao tratar — assim um novo clique
// com a rota já em /processos (mesmo id) muda a query de novo e dispara o watch.
const focoId = ref("");
let timerDestaque: ReturnType<typeof setTimeout> | null = null;

function limparQueryProcesso(): void {
  const { [QUERY_PROCESSO]: _removido, ...resto } = route.query;
  router.replace({ path: route.path, query: resto });
}

async function irParaProcesso(id: string): Promise<void> {
  const plano = planejarFocoProcesso(processos.value, filteredProcessos.value, id);
  limparQueryProcesso();
  if (!plano) {
    if (!error.value) showToast("Processo não encontrado.");
    return;
  }

  if (plano.limparFiltros) {
    searchQuery.value = "";
    statusFilter.value = "";
    empresaFilter.value = "";
    responsavelFilter.value = "";
  }
  activeTab.value = plano.aba;

  // Reinicia o foco (mesmo id seguido de outro clique) e espera a lista re-renderizar já com o
  // grupo expandido antes de procurar a linha no DOM.
  focoId.value = "";
  await nextTick();
  focoId.value = id;
  await nextTick();
  await nextTick();

  const linha = document.getElementById(`processo-row-${id}`) ?? document.getElementById(`processo-delivered-${id}`);
  linha?.scrollIntoView({ block: "center", behavior: "smooth" });

  if (timerDestaque) clearTimeout(timerDestaque);
  timerDestaque = setTimeout(() => {
    focoId.value = "";
    timerDestaque = null;
  }, DESTAQUE_PROCESSO_MS);
}

onMounted(async () => {
  await fetchProcessos();
  const id = processoIdDaQuery(route.query[QUERY_PROCESSO]);
  if (id) await irParaProcesso(id);
});

// Já em /processos: a rota não muda de página, só a query — por isso o watch (e não só o onMounted).
watch(
  () => route.query[QUERY_PROCESSO],
  (valor) => {
    const id = processoIdDaQuery(valor);
    if (id) void irParaProcesso(id);
  },
);

onBeforeUnmount(() => {
  if (timerDestaque) clearTimeout(timerDestaque);
});

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

// Edição sem alteração: não chama o PATCH, só fecha o modal.
function handleUnchanged(): void {
  showToast("Nenhuma alteração para salvar");
  closeForm();
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

async function handleUpdate(id: string, payload: ProcessoFormPatchPayload): Promise<void> {
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
                placeholder="Buscar por paciente, pasta ou ordem"
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
      :foco-id="focoId"
      :abertura="aberturaAndamento"
      @edit="openEditForm"
      @delete="handleDelete"
    />
    <ProcessoDeliveredList
      v-else
      :processos="entregueList"
      :readonly="!canWriteProcessos"
      :foco-id="focoId"
      :abertura="aberturaEntregues"
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
      @unchanged="handleUnchanged"
    />
  </div>
</template>
