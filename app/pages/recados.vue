<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { NewRecadoDTO, Recado, RecadoUpdateDTO } from "#shared/types/recado";
import type { LembretePessoal, LembreteUpdateDTO, NewLembreteDTO } from "#shared/types/lembretePessoal";
import { useRecados } from "../composables/useRecados";
import { useLembretesPessoais } from "../composables/useLembretesPessoais";
import { useContasSelecao } from "../composables/useContasSelecao";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";
import { filtrarLembretesVisiveis } from "../utils/lembretesFiltros";
import GlobalHeader from "../components/GlobalHeader.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
import BotaoNovoRecado from "../components/recados/BotaoNovoRecado.vue";
import RecadoCard from "../components/recados/RecadoCard.vue";
import RecadoFormModal from "../components/recados/RecadoFormModal.vue";
import LembreteCard from "../components/recados/LembreteCard.vue";
import LembreteFormModal from "../components/recados/LembreteFormModal.vue";

const { recebidos, enviados, fetchRecados, criarRecado, atualizarRecado, excluirRecado, toggleFixar, concluirRecado } =
  useRecados();
const { lembretes, fetchLembretes, criarLembrete, atualizarLembrete, excluirLembrete } = useLembretesPessoais();
const { fetchContas } = useContasSelecao();
const { showToast } = useToast();

onMounted(() => {
  fetchRecados();
  fetchLembretes();
  fetchContas();
});

type Tab = "recebidos" | "enviados" | "meus";
const activeTab = ref<Tab>("recebidos");

const lembretesVisiveis = computed(() => filtrarLembretesVisiveis(lembretes.value));

const listaAtiva = computed<Recado[]>(() => {
  return activeTab.value === "enviados" ? enviados.value : recebidos.value;
});

// Aba "Meus lembretes" cria lembrete; as demais criam recado.
const rotuloNovo = computed<string>(() => (activeTab.value === "meus" ? "Novo lembrete" : "Novo recado"));

const showFormModal = ref(false);
const editingRecado = ref<Recado | null>(null);
const showLembreteFormModal = ref(false);
const editingLembrete = ref<LembretePessoal | null>(null);

// Um botão só (flutuante abaixo de lg, com texto em lg+) — abre o modal certo
// conforme a aba ativa.
function openCreateForm(): void {
  if (activeTab.value === "meus") {
    editingLembrete.value = null;
    showLembreteFormModal.value = true;
    return;
  }
  editingRecado.value = null;
  showFormModal.value = true;
}

function openEditForm(recado: Recado): void {
  editingRecado.value = recado;
  showFormModal.value = true;
}

function closeForm(): void {
  showFormModal.value = false;
  editingRecado.value = null;
}

function openEditLembreteForm(lembrete: LembretePessoal): void {
  editingLembrete.value = lembrete;
  showLembreteFormModal.value = true;
}

function closeLembreteForm(): void {
  showLembreteFormModal.value = false;
  editingLembrete.value = null;
}

async function handleCreate(payload: NewRecadoDTO): Promise<void> {
  try {
    await criarRecado(payload);
    showToast("Recado criado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao criar recado"));
  }
}

async function handleUpdate(id: string, payload: RecadoUpdateDTO): Promise<void> {
  try {
    await atualizarRecado(id, payload);
    showToast("Recado atualizado");
    closeForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar recado"));
  }
}

async function handleExcluir(id: string): Promise<void> {
  try {
    await excluirRecado(id);
    showToast("Recado excluído");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao excluir recado"));
  }
}

async function handleFixar(id: string): Promise<void> {
  try {
    await toggleFixar(id);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao fixar recado"));
  }
}

async function handleConcluir(id: string): Promise<void> {
  try {
    await concluirRecado(id);
    showToast("Recado concluído");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao concluir recado"));
  }
}

async function handleCreateLembrete(payload: NewLembreteDTO): Promise<void> {
  try {
    await criarLembrete(payload);
    showToast("Lembrete criado");
    closeLembreteForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao criar lembrete"));
  }
}

async function handleUpdateLembrete(id: string, payload: LembreteUpdateDTO): Promise<void> {
  try {
    await atualizarLembrete(id, payload);
    showToast("Lembrete atualizado");
    closeLembreteForm();
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao atualizar lembrete"));
  }
}

async function handleExcluirLembrete(id: string): Promise<void> {
  try {
    await excluirLembrete(id);
    showToast("Lembrete excluído");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao excluir lembrete"));
  }
}

async function handleFixarLembrete(id: string, fixado: boolean): Promise<void> {
  try {
    await atualizarLembrete(id, { fixado });
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao fixar lembrete"));
  }
}

async function handleConcluirLembrete(id: string): Promise<void> {
  try {
    await atualizarLembrete(id, { concluido: true });
    showToast("Lembrete concluído");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao concluir lembrete"));
  }
}
</script>

<template>
  <!--
    pb-20 abaixo de lg: folga pro botão flutuante "+" nunca cobrir o último card.
    Classe ESTÁTICA de propósito (mesmo motivo de processos.vue): nada condicionado a
    cargo/usuário num elemento renderizado pelo SSR.
  -->
  <div id="recados-page" class="mx-auto max-w-[1400px] pb-20 lg:pb-0">
    <GlobalHeader title="Recados" subtitle="Mural de comunicação da equipe.">
      <template #tabs>
        <!--
          Abaixo de lg: 3 colunas iguais, texto centralizado, linha inferior em largura total. A terceira aba
          usa o rótulo curto "Meus (N)" (o longo não cabe numa linha só em 360–390px), então as 3 ficam com 44px.
          O -mt-4 cancela o mb-4 do GlobalHeader; o pt-[3px] (= a espessura do sublinhado) deixa o texto com o mesmo
          respiro acima (a partir da linha do cabeçalho) e abaixo (até a linha da barra). Em lg+ volta ao flex à
          esquerda de sempre (pt-4), com o botão com texto absoluto à direita.
        -->
        <div class="relative -mt-4 mb-3.5 grid grid-cols-3 border-b border-hairline pt-[3px] lg:flex lg:flex-wrap lg:items-end lg:gap-1 lg:pt-4">
          <button
            id="tab-recebidos"
            type="button"
            class="flex min-h-11 items-center justify-center border-b-[3px] px-1.5 py-2 text-center text-[13.5px] font-semibold transition-colors lg:block lg:min-h-0 lg:border-b-2 lg:px-3.5"
            :class="
              activeTab === 'recebidos' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'
            "
            @click="activeTab = 'recebidos'"
          >
            Recebidos ({{ recebidos.length }})
          </button>
          <button
            id="tab-enviados"
            type="button"
            class="flex min-h-11 items-center justify-center border-b-[3px] px-1.5 py-2 text-center text-[13.5px] font-semibold transition-colors lg:block lg:min-h-0 lg:border-b-2 lg:px-3.5"
            :class="
              activeTab === 'enviados' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'
            "
            @click="activeTab = 'enviados'"
          >
            Enviados ({{ enviados.length }})
          </button>
          <button
            id="tab-meus"
            type="button"
            class="flex min-h-11 items-center justify-center border-b-[3px] px-1.5 py-2 text-center text-[13.5px] font-semibold transition-colors lg:block lg:min-h-0 lg:border-b-2 lg:px-3.5"
            :class="activeTab === 'meus' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            :aria-label="`Meus lembretes (${lembretesVisiveis.length})`"
            @click="activeTab = 'meus'"
          >
            <span class="lg:hidden">Meus ({{ lembretesVisiveis.length }})</span><span class="hidden lg:inline">Meus lembretes ({{ lembretesVisiveis.length }})</span>
          </button>

          <BotaoNovoRecado
            class="hidden lg:absolute lg:top-1/2 lg:right-0 lg:block lg:-translate-y-1/2"
            :label="`+ ${rotuloNovo}`"
            @click="openCreateForm"
          />
        </div>
      </template>
    </GlobalHeader>

    <template v-if="activeTab === 'meus'">
      <p v-if="!lembretesVisiveis.length" id="lembretes-vazio" class="py-10 text-center text-[13px] text-ink-soft">
        Nenhum lembrete por aqui.
      </p>

      <div v-else id="lembretes-lista" class="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <LembreteCard
          v-for="lembrete in lembretesVisiveis"
          :key="lembrete.id"
          :lembrete="lembrete"
          @editar="openEditLembreteForm"
          @excluir="handleExcluirLembrete"
          @fixar="handleFixarLembrete"
          @concluir="handleConcluirLembrete"
        />
      </div>
    </template>

    <template v-else>
      <p v-if="!listaAtiva.length" id="recados-vazio" class="py-10 text-center text-[13px] text-ink-soft">
        Nenhum recado por aqui.
      </p>

      <div v-else id="recados-lista" class="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <RecadoCard
          v-for="recado in listaAtiva"
          :key="recado.id"
          :recado="recado"
          @editar="openEditForm"
          @excluir="handleExcluir"
          @fixar="handleFixar"
          @concluir="handleConcluir"
        />
      </div>
    </template>

    <FloatingAddButton id="fab-novo-recado" :label="rotuloNovo" @click="openCreateForm" />

    <RecadoFormModal
      v-if="showFormModal"
      :editing-recado="editingRecado"
      @create="handleCreate"
      @update="handleUpdate"
      @close="closeForm"
      @invalid="showToast"
    />

    <LembreteFormModal
      v-if="showLembreteFormModal"
      :editing-lembrete="editingLembrete"
      @create="handleCreateLembrete"
      @update="handleUpdateLembrete"
      @close="closeLembreteForm"
      @invalid="showToast"
    />
  </div>
</template>
