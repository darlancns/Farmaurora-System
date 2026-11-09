<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { DIR_TAMANHO_PAGINA } from "#shared/constants/dir";
import type { Dir, DirPatchDTO, NewDirDTO } from "#shared/types/dir";
import { useDir } from "../composables/useDir";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import {
  FILTROS_DIR_VAZIOS,
  agruparPorPaciente,
  aplicarFiltrosDir,
  contarFiltrosAtivos,
  contarPorBanco,
  contarPorPo,
  ordenarPorPoDesc,
  resumoFechamentosRestantes,
  separarAbasDir,
  textoResumoFechamentos,
  visaoFechamentosRestantes,
  type FiltrosDir,
} from "../utils/dirFiltros";
import { montarCamposFiltroDir, type CampoFiltroDir } from "../utils/dirOptions";
import AppSelect from "../components/AppSelect.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import DirFechamentoAcoesSheet from "../components/dir/DirFechamentoAcoesSheet.vue";
import DirFechamentosList from "../components/dir/DirFechamentosList.vue";
import DirFiltrosSheet from "../components/dir/DirFiltrosSheet.vue";
import DirFormModal from "../components/dir/DirFormModal.vue";
import DirIncluirFechamento from "../components/dir/DirIncluirFechamento.vue";
import DirList from "../components/dir/DirList.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import GlobalHeader from "../components/GlobalHeader.vue";

// Acesso: operacional e administrador (seção "dir" em shared/utils/rbac.ts), leitura e escrita —
// quem consegue abrir esta página também escreve, então não há ramo somente-leitura.
const { registros, loading, error, fetchDir, addDir, patchDir, removeDir } = useDir();
const { showToast } = useToast();

onMounted(() => {
  fetchDir();
});

type Tab = "em_aberto" | "encerradas" | "fechamentos";
const activeTab = ref<Tab>("em_aberto");

const filtros = ref<FiltrosDir>({ ...FILTROS_DIR_VAZIOS });

// Abaixo de lg os filtros moram no bottom sheet (DirFiltrosSheet), aberto pelo ícone ao lado da
// busca; a bolinha do ícone conta quantos estão ativos.
const showFiltros = ref(false);
const filtrosAtivos = computed<number>(() => contarFiltrosAtivos(filtros.value));
const campos = computed<CampoFiltroDir[]>(() => montarCamposFiltroDir(registros.value));

function atualizarFiltro(chave: CampoFiltroDir["chave"], valor: string): void {
  filtros.value = { ...filtros.value, [chave]: valor };
}

// As abas são a operação (FECHAMENTO DE OPERAÇÃO): "Em aberto" = não encerrada.
const filtrados = computed<Dir[]>(() => aplicarFiltrosDir(registros.value, filtros.value));
const abas = computed(() => separarAbasDir(filtrados.value));
const listaDaAba = computed<Dir[]>(() =>
  ordenarPorPoDesc(activeTab.value === "em_aberto" ? abas.value.emAberto : abas.value.encerradas),
);

// Aba "Fechamentos restantes" = VISÃO dos POs marcados e com a operação em andamento (sai sozinha ao
// encerrar a operação; reabrir devolve). Respeita busca e demais filtros, mas NÃO o filtro "Fechamento
// restante" (a aba já é isso). Os chips por banco contam sem o próprio filtro de banco, pra não sumirem.
const filtrosDaVisao = computed<FiltrosDir>(() => ({ ...filtros.value, fechamentoRestante: "" }));
const visaoFechamentos = computed<Dir[]>(() =>
  visaoFechamentosRestantes(aplicarFiltrosDir(registros.value, filtrosDaVisao.value)),
);
const contagensBanco = computed(() =>
  contarPorBanco(
    visaoFechamentosRestantes(aplicarFiltrosDir(registros.value, { ...filtrosDaVisao.value, banco: "" })),
  ),
);
const gruposFechamentos = computed(() => agruparPorPaciente(visaoFechamentos.value));
const resumoFechamentos = computed(() => resumoFechamentosRestantes(visaoFechamentos.value));
const naAbaFechamentos = computed<boolean>(() => activeTab.value === "fechamentos");

// O filtro "Fechamento restante: sim/não" só faz sentido nas abas Em aberto e Encerradas.
const camposVisiveis = computed<CampoFiltroDir[]>(() =>
  naAbaFechamentos.value ? campos.value.filter((c) => c.chave !== "fechamentoRestante") : campos.value,
);
const subtituloPagina = computed<string>(() =>
  naAbaFechamentos.value
    ? textoResumoFechamentos(resumoFechamentos.value)
    : "Controle dos POs: pagamento, entrega e checklist de fechamento.",
);

// "Mostrar mais" de 50 em 50; volta a 50 ao trocar de aba ou de filtro.
const limite = ref<number>(DIR_TAMANHO_PAGINA);
watch(
  [activeTab, filtros],
  () => {
    limite.value = DIR_TAMANHO_PAGINA;
  },
  { deep: true },
);
const visiveis = computed<Dir[]>(() => listaDaAba.value.slice(0, limite.value));
const restantes = computed<number>(() => Math.max(0, listaDaAba.value.length - limite.value));

// PO repetido é permitido (ex.: ordem 1 e ordem 2): só avisa. Conta sobre TODOS os registros.
const contagemPorPo = computed(() => contarPorPo(registros.value));

const showFormModal = ref(false);
const editingId = ref<string | null>(null);
// Registro vivo da store: o modal enxerga na hora o resultado dos PATCH dos toggles.
const editingDir = computed<Dir | null>(() => registros.value.find((d) => d.id === editingId.value) ?? null);

function openCreateForm(): void {
  editingId.value = null;
  showFormModal.value = true;
}

function openEditForm(dir: Dir): void {
  editingId.value = dir.id;
  showFormModal.value = true;
}

function closeForm(): void {
  showFormModal.value = false;
  editingId.value = null;
}

function handleInvalid(message: string): void {
  showToast(message);
}

async function handleSubmit(payload: NewDirDTO): Promise<void> {
  try {
    await addDir(payload);
    showToast("PO adicionado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao adicionar PO"));
  }
}

async function handleUpdate(id: string, payload: DirPatchDTO): Promise<void> {
  try {
    await patchDir(id, payload);
    showToast("PO atualizado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar PO"));
  }
}

// Toggles que gravam na hora (conferido, operação encerrada, checklist): sucesso silencioso.
async function handlePatch(id: string, patch: DirPatchDTO): Promise<void> {
  try {
    await patchDir(id, patch);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar PO"));
  }
}

// ── Lista "Fechamentos restantes": incluir e remover (marca no próprio PO; o servidor registra quem/quando) ──
const showIncluir = ref(false);
// Desktop: confirmação por ConfirmDialog. Mobile: sheet "⋯" (a confirmação fica dentro dele).
const remocaoDesktop = ref<Dir | null>(null);
const acoesMobile = ref<Dir | null>(null);

async function incluirFechamento(dir: Dir): Promise<void> {
  try {
    await patchDir(dir.id, { fechamentoRestante: true });
    showToast(`${dir.po} incluído nos fechamentos restantes`);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao incluir o PO"));
  }
}

async function removerFechamento(dir: Dir): Promise<void> {
  remocaoDesktop.value = null;
  acoesMobile.value = null;
  try {
    await patchDir(dir.id, { fechamentoRestante: false });
    showToast(`${dir.po} removido dos fechamentos restantes`);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover o PO da lista"));
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await removeDir(id);
    showToast("PO removido");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao remover PO"));
  }
}
</script>

<template>
  <!-- pb-20 abaixo de lg: folga pro botão flutuante "+" nunca cobrir o último item (classe estática de
       propósito, como em processos.vue). -->
  <div id="dir-page" class="mx-auto max-w-[1400px] pb-20 lg:pb-0">
    <GlobalHeader title="DIR" :subtitle="subtituloPagina">
      <template #filters>
        <div id="dir-filtros" class="mb-[3px] flex flex-col gap-2.5 lg:mb-3.5 lg:flex-row lg:flex-wrap lg:items-center">
          <!-- Abaixo de lg: busca com o ícone de filtros DENTRO dela, à direita. Em lg+ o wrapper é `contents`. -->
          <div class="flex items-stretch gap-2.5 lg:contents">
            <div class="relative min-w-0 flex-1 lg:w-[260px] lg:flex-none lg:shrink-0">
              <input
                id="dir-search"
                v-model="filtros.busca"
                type="text"
                placeholder="Buscar por paciente, PO, medicamento ou AWB..."
                class="w-full rounded-md border border-hairline bg-paper px-3 py-[11px] pr-[68px] text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:py-2 lg:pr-8"
              />
              <button
                v-if="filtros.busca"
                id="btn-clear-dir-search"
                type="button"
                title="Limpar busca"
                aria-label="Limpar busca"
                class="absolute top-1/2 right-11 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger lg:right-2"
                @click="filtros.busca = ''"
              >
                ✕
              </button>
              <button
                id="btn-filtros-dir"
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
                  id="badge-dir-filtros-ativos"
                  class="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-farm-blue px-1 text-[10px] font-semibold text-white"
                >
                  {{ filtrosAtivos }}
                </span>
              </button>
            </div>
          </div>

          <div v-for="campo in camposVisiveis" :key="campo.chave" class="hidden shrink-0 lg:block lg:w-fit">
            <AppSelect
              :id="campo.id"
              :model-value="filtros[campo.chave]"
              :options="campo.opcoes"
              @update:model-value="atualizarFiltro(campo.chave, $event)"
            />
          </div>

          <!-- Abaixo de lg: só o "+" flutuante acima do BottomNav. Em lg+ o botão com texto fica à direita. -->
          <FloatingAddButton v-if="!naAbaFechamentos" id="fab-novo-dir" label="Novo PO" @click="openCreateForm" />
          <!-- Na aba Fechamentos restantes o "+" flutuante inclui um paciente na lista (sheet em tela cheia). -->
          <FloatingAddButton v-else id="fab-incluir-fechamento" label="Incluir paciente" @click="showIncluir = true" />
          <button
            id="btn-novo-dir"
            type="button"
            class="hidden rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90 lg:ml-auto lg:block lg:shrink-0"
            @click="openCreateForm"
          >
            + Novo PO
          </button>
        </div>
      </template>

      <template #tabs>
        <div class="mb-3.5 flex gap-0 border-b border-hairline lg:gap-1">
          <button
            id="tab-dir-em-aberto"
            type="button"
            class="flex-1 border-b-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11 lg:flex-[0_1_auto] lg:border-b-2"
            :class="activeTab === 'em_aberto' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'em_aberto'"
          >
            Em aberto ({{ abas.emAberto.length }})
          </button>
          <button
            id="tab-dir-encerradas"
            type="button"
            class="flex-1 border-b-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11 lg:flex-[0_1_auto] lg:border-b-2"
            :class="activeTab === 'encerradas' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'encerradas'"
          >
            Encerradas ({{ abas.encerradas.length }})
          </button>
          <button
            id="tab-dir-fechamentos"
            type="button"
            aria-label="Fechamentos restantes"
            class="flex-1 border-b-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11 lg:flex-[0_1_auto] lg:border-b-2"
            :class="activeTab === 'fechamentos' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'fechamentos'"
          >
            <!-- Título curto abaixo de lg (3 abas não cabem em 375px); o nome completo fica no aria-label. -->
            <span class="lg:hidden">Fechamentos</span><span class="hidden lg:inline">Fechamentos restantes</span>
            ({{ visaoFechamentos.length }})
          </button>
        </div>
      </template>
    </GlobalHeader>

    <p
      v-if="error"
      id="dir-erro"
      class="mb-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger"
    >
      {{ error }}
    </p>
    <p v-else-if="loading && !registros.length" id="dir-carregando" class="px-1 py-6 text-center text-[13px] text-ink-soft">
      Carregando...
    </p>
    <DirFechamentosList
      v-else-if="naAbaFechamentos"
      :grupos="gruposFechamentos"
      :contagens-banco="contagensBanco"
      :banco-ativo="filtros.banco"
      @filtrar-banco="atualizarFiltro('banco', $event)"
      @edit="openEditForm"
      @remover-desktop="remocaoDesktop = $event"
      @acoes-mobile="acoesMobile = $event"
      @incluir="showIncluir = true"
    />
    <template v-else>
      <DirList
        :registros="visiveis"
        :contagem-por-po="contagemPorPo"
        @edit="openEditForm"
        @patch="handlePatch"
      />

      <div v-if="restantes > 0" class="mt-3 flex justify-center">
        <button
          id="btn-dir-mostrar-mais"
          type="button"
          class="min-h-11 rounded-lg border border-hairline bg-paper-raised px-5 py-2 text-[13.5px] font-semibold text-accent-dark transition-colors hover:bg-paper lg:min-h-0"
          @click="limite += DIR_TAMANHO_PAGINA"
        >
          Mostrar mais ({{ Math.min(DIR_TAMANHO_PAGINA, restantes) }} de {{ restantes }})
        </button>
      </div>
    </template>

    <DirFiltrosSheet v-if="showFiltros" v-model:filtros="filtros" :campos="camposVisiveis" @close="showFiltros = false" />

    <DirIncluirFechamento
      v-if="showIncluir"
      :registros="registros"
      @incluir="incluirFechamento"
      @close="showIncluir = false"
    />

    <DirFechamentoAcoesSheet
      v-if="acoesMobile"
      :dir="acoesMobile"
      @remover="removerFechamento"
      @close="acoesMobile = null"
    />

    <ConfirmDialog
      v-if="remocaoDesktop"
      :message="`Remover o ${remocaoDesktop.po} da lista de fechamentos restantes? O PO não é excluído; só deixa a lista.`"
      confirm-label="Remover"
      danger
      reforcado
      @confirm="removerFechamento(remocaoDesktop)"
      @close="remocaoDesktop = null"
    />

    <DirFormModal
      v-if="showFormModal"
      :editing-dir="editingDir"
      :contagem-por-po="contagemPorPo"
      @submit="handleSubmit"
      @update="handleUpdate"
      @patch="handlePatch"
      @delete="handleDelete"
      @close="closeForm"
      @invalid="handleInvalid"
    />
  </div>
</template>
