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
import BotaoNovoRecado from "../components/recados/BotaoNovoRecado.vue";
import RecadoCard from "../components/recados/RecadoCard.vue";
import RecadoFormModal from "../components/recados/RecadoFormModal.vue";
import LembreteCard from "../components/recados/LembreteCard.vue";
import LembreteFormModal from "../components/recados/LembreteFormModal.vue";

const { todos, recebidos, enviados, fetchRecados, criarRecado, atualizarRecado, excluirRecado, toggleFixar, concluirRecado } =
  useRecados();
const { lembretes, fetchLembretes, criarLembrete, atualizarLembrete, excluirLembrete } = useLembretesPessoais();
const { fetchContas } = useContasSelecao();
const { showToast } = useToast();

onMounted(() => {
  fetchRecados();
  fetchLembretes();
  fetchContas();
});

type Tab = "todos" | "recebidos" | "enviados" | "meus";
const activeTab = ref<Tab>("todos");

const lembretesVisiveis = computed(() => filtrarLembretesVisiveis(lembretes.value));

const listaAtiva = computed<Recado[]>(() => {
  if (activeTab.value === "recebidos") return recebidos.value;
  if (activeTab.value === "enviados") return enviados.value;
  return todos.value;
});

const showFormModal = ref(false);
const editingRecado = ref<Recado | null>(null);
const showLembreteFormModal = ref(false);
const editingLembrete = ref<LembretePessoal | null>(null);

// Um botão só (sem duplicar) — abre o modal certo conforme a aba ativa.
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
  <div id="recados-page" class="mx-auto max-w-[1400px]">
    <GlobalHeader title="Recados" subtitle="Mural de comunicação da equipe.">
      <template #tabs>
        <div class="relative -mt-4 mb-3.5 flex flex-wrap items-end gap-1 border-b border-hairline pt-4">
          <button
            id="tab-todos"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
            :class="activeTab === 'todos' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'todos'"
          >
            Todos ({{ todos.length }})
          </button>
          <button
            id="tab-recebidos"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
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
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
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
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
            :class="activeTab === 'meus' ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = 'meus'"
          >
            Meus lembretes ({{ lembretesVisiveis.length }})
          </button>

          <BotaoNovoRecado
            class="absolute top-1/2 right-0 -translate-y-1/2"
            :label="activeTab === 'meus' ? '+ Novo lembrete' : '+ Novo recado'"
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
