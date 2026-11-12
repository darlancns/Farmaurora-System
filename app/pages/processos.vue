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
import { useConflitoEdicaoProcesso } from "../composables/useConflitoEdicaoProcesso";
import { useProcessos } from "../composables/useProcessos";
import { useAuth } from "../composables/useAuth";
import { useMoverProcesso } from "../composables/useMoverProcesso";
import { useRecarregarAoVoltar } from "../composables/useRecarregarAoVoltar";
import { useToast } from "../composables/useToast";
import { useVisaoProcessos } from "../composables/useVisaoProcessos";
import type { VisaoProcessos } from "../utils/processoVisao";
import type { AppSelectOption } from "../types/appSelect";
import { getErrorMessage } from "../utils/errorMessages";
import { filtrarPorBusca } from "../utils/processoBusca";
import { filtrarPorCotacao, filtrarPorStatus, separarAbas, type FiltroCotacao } from "../utils/processoListas";
import { contarProcessosPorPasta } from "../utils/remessaNaLinha";
import {
  DESTAQUE_PROCESSO_MS,
  planejarFocoProcesso,
  processoIdDaQuery,
  QUERY_PROCESSO,
} from "../utils/processoFoco";
import {
  COTACAO_FILTER_OPTIONS,
  EMPRESA_FILTER_OPTIONS,
  RESPONSAVEL_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "../utils/processoOptions";
import AppSelect from "../components/AppSelect.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import SegmentedControl from "../components/SegmentedControl.vue";
import ProcessoGroupList from "../components/processos/ProcessoGroupList.vue";
import ProcessoKanban from "../components/processos/ProcessoKanban.vue";
import ProcessoPainel from "../components/processos/ProcessoPainel.vue";
import ProcessoDeliveredList from "../components/processos/ProcessoDeliveredList.vue";
import ProcessoFiltrosSheet from "../components/processos/ProcessoFiltrosSheet.vue";
import ProcessoFormModal from "../components/processos/ProcessoFormModal.vue";

const {
  processos,
  error,
  fetchProcessos,
  addProcesso,
  patchProcesso,
  removeProcesso,
  moverProcesso,
  recarregarProcesso,
} = useProcessos();
const route = useRoute();
const router = useRouter();
const { role, consultorNome, canWrite } = useAuth();
const { showToast } = useToast();

// Pode editar processos? Segue o mapa de permissões por página da conta (socio e operacional: "editar" escreve,
// "ver" é só leitura) e, sem mapa, a regra do cargo (WRITE_ACCESS.processos: socio, operacional e administrador).
// Consultor é sempre somente leitura. A mesma decisão vale no servidor (autorizarApi no middleware).
const canWriteProcessos = computed<boolean>(() => canWrite("processos"));
// consultor vê a própria lista direto, sem o agrupamento por consultor.
const flatList = computed<boolean>(() => role.value === "consultor");

// Kanban | Lista: só para quem pode editar processos, e só no cliente depois de montar (ver useVisaoProcessos).
// Consultor e conta só-leitura nunca veem a alternância nem o Kanban.
const { visao, mostrarAlternancia, mostrarKanban, escolher: escolherVisao } = useVisaoProcessos(
  () => canWriteProcessos.value,
);
const VISAO_OPTIONS: AppSelectOption<VisaoProcessos>[] = [
  { value: "kanban", label: "Kanban" },
  { value: "lista", label: "Lista" },
];


type Tab = "andamento" | "entregues";
const activeTab = ref<Tab>("andamento");

const searchQuery = ref("");
const statusFilter = ref<StatusProcesso | "">("");
const empresaFilter = ref<EmpresaProcesso | "">("");
const responsavelFilter = ref("");
const cotacaoFilter = ref<FiltroCotacao>("");

// Abaixo de lg os 4 selects moram no bottom sheet (ProcessoFiltrosSheet), aberto
// pelo ícone ao lado da busca; a bolinha do ícone conta quantos estão ativos.
const showFiltros = ref(false);
// No Kanban o filtro Status não existe (cada status é uma coluna): não aparece, não conta na bolinha e não filtra.
const filtrosAtivos = computed<number>(
  () =>
    [mostrarKanban.value ? "" : statusFilter.value, empresaFilter.value, responsavelFilter.value, cotacaoFilter.value].filter(
      Boolean,
    ).length,
);

const filteredProcessos = computed<Processo[]>(() => {
  let list = processos.value;

  // Defesa em profundidade: o servidor já entrega só os processos do próprio
  // consultor, mas garantimos aqui também.
  if (role.value === "consultor" && consultorNome.value) {
    list = list.filter((p) => p.consultor === consultorNome.value);
  }

  if (!mostrarKanban.value) list = filtrarPorStatus(list, statusFilter.value);
  if (empresaFilter.value) {
    list = list.filter((p) => p.empresa === empresaFilter.value);
  }
  if (responsavelFilter.value) {
    list = list.filter((p) => p.responsavelOperacional === responsavelFilter.value);
  }
  // "Cotações ASD": sem a cotação da transportadora nacional (nunca Entregues nem Courier Simples).
  list = filtrarPorCotacao(list, cotacaoFilter.value);
  // Paciente, pasta OU Nº Ordem. A pasta ignora espaços e hífens ("2026-375", "2026 375" e "375" acham "2026 - 375");
  // o Nº Ordem também ignora pontuação e maiúsculas ("po-25-0123", "PO250123" e "25-0123" acham "PO-25-0123/XYZ").
  return filtrarPorBusca(list, searchQuery.value);
});

// "Remessa N" na linha: N > 1 OU pasta repetida. A contagem por pasta usa TODOS os processos carregados (Andamento +
// Entregues), nunca a lista filtrada pela busca/filtros — ver utils/remessaNaLinha.ts.
const contagemPasta = computed(() => contarProcessosPorPasta(processos.value));

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

function limparBuscaEFiltros(): void {
  searchQuery.value = "";
  statusFilter.value = "";
  empresaFilter.value = "";
  responsavelFilter.value = "";
  cotacaoFilter.value = "";
}

function destacarPorUmTempo(id: string): void {
  if (timerDestaque) clearTimeout(timerDestaque);
  timerDestaque = setTimeout(() => {
    if (focoId.value === id) focoId.value = "";
    timerDestaque = null;
  }, DESTAQUE_PROCESSO_MS);
}

// Kanban: caminho PARALELO ao da Lista. Limpa a busca/filtros só se escondem o processo, destaca o card, rola a
// coluna (e o quadro) até ele e abre o painel lateral.
async function irParaProcessoNoKanban(id: string): Promise<void> {
  limparQueryProcesso();
  if (!processos.value.some((p) => p.id === id)) {
    if (!error.value) showToast("Processo não encontrado.");
    return;
  }
  if (!filteredProcessos.value.some((p) => p.id === id)) limparBuscaEFiltros();

  focoId.value = "";
  await nextTick();
  focoId.value = id;
  await nextTick();
  document.getElementById(`processo-card-${id}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  destacarPorUmTempo(id);
  if (canWriteProcessos.value) painelId.value = id;
}

async function irParaProcesso(id: string): Promise<void> {
  if (mostrarKanban.value) return irParaProcessoNoKanban(id);
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
    cotacaoFilter.value = "";
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

// Volta para a aba do navegador: recarrega a lista (no máximo a cada 60s), nunca com o formulário aberto.
useRecarregarAoVoltar({
  recarregar: () => fetchProcessos(),
  bloqueado: () => showFormModal.value,
});

// Conflito de versão na edição (outra pessoa gravou o processo com o formulário aberto): ver o composable.
const {
  conflito: conflitoEdicao,
  recarregando: recarregandoEdicao,
  salvar: salvarEdicao,
  recarregar: recarregarEdicao,
  limpar: limparConflitoEdicao,
} = useConflitoEdicaoProcesso(editingProcesso);

function openCreateForm(): void {
  if (!canWriteProcessos.value) return;
  limparConflitoEdicao();
  editingProcesso.value = null;
  showFormModal.value = true;
}

function openEditForm(processo: Processo): void {
  if (!canWriteProcessos.value) return;
  limparConflitoEdicao();
  editingProcesso.value = processo;
  showFormModal.value = true;
}

// ── Painel lateral do Kanban ──────────────────────────────────────────────────────────────────────────
// Guarda só o id; o processo vem do store (reativo): salvar no formulário ou nas atualizações já aparece no
// painel. Se o processo some (excluído, ou a recarga não o trouxe), o painel fecha sozinho.
const painelId = ref("");
const painelProcesso = computed<Processo | null>(
  () => (painelId.value && processos.value.find((p) => p.id === painelId.value)) || null,
);

function abrirPainel(processo: Processo): void {
  if (!canWriteProcessos.value) return;
  painelId.value = processo.id;
}

function fecharPainel(): void {
  painelId.value = "";
}

// ── Mudar de coluna (arrastar e "Mover para…") ────────────────────────────────────────────────────────
// Fluxo único (useMoverProcesso): confirmação → POST /mover com a versão → card travado até a resposta.
const {
  pedido: pedidoMover,
  movendo,
  anuncio: anuncioMover,
  pedir: pedirMover,
  cancelar: cancelarMover,
  confirmar: confirmarMover,
} = useMoverProcesso({
  podeEditar: () => canWriteProcessos.value && mostrarKanban.value,
  obter: (id) => processos.value.find((p) => p.id === id),
  mover: moverProcesso,
  recarregar: recarregarProcesso,
  toast: (texto) => showToast(texto),
});

function closeForm(): void {
  showFormModal.value = false;
  editingProcesso.value = null;
  limparConflitoEdicao();
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
  if (!canWriteProcessos.value) return;
  try {
    await addProcesso(payload);
    showToast("Processo adicionado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao adicionar processo"));
  }
}

async function handleUpdate(id: string, payload: ProcessoFormPatchPayload): Promise<void> {
  if (!canWriteProcessos.value) return;
  try {
    const resultado = await salvarEdicao(id, payload);
    // Conflito: o modal segue aberto com o aviso (nada foi gravado); a pessoa decide recarregar.
    if (resultado.tipo === "conflito") return;
    showToast("Processo atualizado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar processo"));
  }
}

// "Recarregar dados atuais": busca a linha atual, o formulário recarrega por ela e as alterações em andamento
// são descartadas. Falha (rede) mantém o aviso na tela; processo excluído nesse meio-tempo fecha o modal.
async function handleRecarregarEdicao(): Promise<void> {
  try {
    const resultado = await recarregarEdicao();
    if (resultado.tipo === "removido") {
      showToast("Este processo não existe mais");
      closeForm();
    }
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao recarregar processo"));
  }
}

async function handleDelete(id: string): Promise<void> {
  if (!canWriteProcessos.value) return;
  try {
    await removeProcesso(id);
    showToast("Processo removido");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover processo"));
  }
}

async function handlePatch(id: string, patch: Partial<NewProcessoDTO>): Promise<void> {
  if (!canWriteProcessos.value) return;
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
  <!--
    Largura: a Lista fica na coluna de até 1400px de sempre; o Kanban usa a largura toda da janela (5 colunas de no
    mínimo 312px cabem lado a lado num monitor largo; no resto, só o quadro rola de lado). Altura automática nos dois:
    a única rolagem vertical é a do <main>. A classe do Kanban só entra DEPOIS de montar (mostrarKanban é false no SSR
    e na hidratação), então não há atributo divergente entre servidor e cliente.
  -->
  <div
    id="processos-page"
    class="mx-auto pb-20 lg:pb-0"
    :class="mostrarKanban ? 'max-w-none' : 'max-w-[1400px]'"
  >
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
                placeholder="Buscar por paciente, pasta ou PO"
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

          <!-- Kanban | Lista: só para quem pode editar e só depois de montar (cliente). Abaixo de lg em linha própria,
               largura total; em lg+ logo depois da busca. -->
          <div v-if="mostrarAlternancia" id="processo-visao" class="shrink-0 lg:w-[176px]">
            <SegmentedControl
              id="processo-visao-toggle"
              label="Visão do Follow-Up"
              :model-value="visao"
              :options="VISAO_OPTIONS"
              @update:model-value="escolherVisao"
            />
          </div>

          <!-- Status: só na Lista, aba Em andamento (no Kanban cada status é uma coluna). -->
          <div v-if="!mostrarKanban && activeTab === 'andamento'" class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-status" v-model="statusFilter" :options="STATUS_FILTER_OPTIONS" />
          </div>

          <div class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-empresa" v-model="empresaFilter" :options="EMPRESA_FILTER_OPTIONS" />
          </div>

          <div class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-responsavel" v-model="responsavelFilter" :options="RESPONSAVEL_FILTER_OPTIONS" />
          </div>

          <!-- Lista: só em Em andamento (como o status): quem está em Entregues nunca entra em "Cotações ASD".
               Kanban: sempre (a regra já deixa a coluna Entregue vazia com o filtro ligado). -->
          <div v-if="mostrarKanban || activeTab === 'andamento'" class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect id="filtro-cotacao" v-model="cotacaoFilter" :options="COTACAO_FILTER_OPTIONS" />
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
        <!-- No Kanban não há abas: Entregue é uma coluna, com todos os entregues. -->
        <div v-if="!mostrarKanban" class="mb-3.5 flex gap-0 border-b border-hairline lg:gap-1">
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

    <ProcessoKanban
      v-if="mostrarKanban"
      class="mt-1 lg:mt-0"
      :processos="filteredProcessos"
      :foco-id="focoId"
      :movendo="movendo"
      @abrir="abrirPainel"
      @mover="pedirMover"
    />
    <ProcessoGroupList
      v-else-if="activeTab === 'andamento'"
      :processos="andamentoList"
      :readonly="!canWriteProcessos"
      :flat="flatList"
      :foco-id="focoId"
      :contagem-pasta="contagemPasta"
      :abertura="aberturaAndamento"
      @edit="openEditForm"
      @delete="handleDelete"
    />
    <ProcessoDeliveredList
      v-else
      :processos="entregueList"
      :readonly="!canWriteProcessos"
      :foco-id="focoId"
      :contagem-pasta="contagemPasta"
      :abertura="aberturaEntregues"
      @edit="openEditForm"
      @delete="handleDelete"
      @patch="handlePatch"
    />

    <!-- Painel lateral: só no Kanban e só para quem pode editar (z-880, abaixo do formulário e dos ConfirmDialog). -->
    <ProcessoPainel
      v-if="painelProcesso && mostrarKanban && canWriteProcessos"
      :key="painelProcesso.id"
      :processo="painelProcesso"
      :contagem-pasta="contagemPasta"
      :movendo="movendo.has(painelProcesso.id)"
      @close="fecharPainel"
      @edit="openEditForm"
      @delete="handleDelete"
      @mover="pedirMover"
    />

    <!-- Confirmação de mudança de coluna (arrastar e menu): BaseModal z-900, por cima do painel. -->
    <ConfirmDialog
      v-if="pedidoMover"
      title="Mover processo"
      :message="pedidoMover.mensagem"
      confirm-label="Mover"
      cancel-label="Cancelar"
      reforcado
      @confirm="confirmarMover"
      @close="cancelarMover"
    />
    <!-- Resultado da mudança de coluna para leitor de tela. -->
    <p id="kanban-anuncio" class="sr-only" aria-live="polite" role="status">{{ anuncioMover }}</p>

    <ProcessoFiltrosSheet
      v-if="showFiltros"
      v-model:status="statusFilter"
      v-model:empresa="empresaFilter"
      v-model:responsavel="responsavelFilter"
      v-model:cotacao="cotacaoFilter"
      :show-status="!mostrarKanban && activeTab === 'andamento'"
      :show-cotacao="mostrarKanban || activeTab === 'andamento'"
      @close="showFiltros = false"
    />

    <ProcessoFormModal
      v-if="showFormModal && canWriteProcessos"
      :editing-processo="editingProcesso"
      :conflito="conflitoEdicao"
      :recarregando="recarregandoEdicao"
      @submit="handleSubmit"
      @update="handleUpdate"
      @recarregar="handleRecarregarEdicao"
      @close="closeForm"
      @invalid="handleInvalid"
      @unchanged="handleUnchanged"
    />
  </div>
</template>
