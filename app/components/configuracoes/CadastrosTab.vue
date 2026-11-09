<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  LISTA_CADASTRO_ITEM,
  LISTA_CADASTRO_ROTULO,
  LISTAS_CADASTRO,
} from "#shared/constants/cadastros";
import type { Cadastro, ListaCadastro, NovoPorLista, PatchPorLista } from "#shared/types/Cadastro";
import { useAuth } from "../../composables/useAuth";
import { useCadastros } from "../../composables/useCadastros";
import { useToast } from "../../composables/useToast";
import { getErrorMessage } from "../../utils/errorMessages";
import type { AppSelectOption } from "../../types/appSelect";
import ConfirmDialog from "../ConfirmDialog.vue";
import SegmentedControl from "../SegmentedControl.vue";
import CadastroFormModal from "./CadastroFormModal.vue";
import CadastroLista from "./CadastroLista.vue";

// Aba "Cadastros" de /configuracoes (só administrador — ver app/utils/abasConfiguracoes.ts). Três listas editáveis:
// Fornecedores, Despachantes e Temperaturas. Remover = DESATIVAR (nunca apagar); o nome não muda depois de criado.
// Quem escreve é só o administrador (canWrite("config"), a mesma regra do servidor); a tela esconde os botões de
// quem não pode, mas a autorização real está na API.

const { canWrite } = useAuth();
const { showToast } = useToast();
const { itens, loading, error, fetchCadastros, criar, alterar } = useCadastros();

const podeEditar = computed<boolean>(() => canWrite("config"));

const listaAtiva = ref<ListaCadastro>("fornecedores");
const opcoesLista: AppSelectOption<ListaCadastro>[] = LISTAS_CADASTRO.map((lista) => ({
  value: lista,
  label: LISTA_CADASTRO_ROTULO[lista],
}));

const itensDaLista = computed<Cadastro[]>(() => itens.value[listaAtiva.value]);
const nomeDoItem = computed(() => LISTA_CADASTRO_ITEM[listaAtiva.value]);

onMounted(() => {
  void fetchCadastros();
});

// ---- Modal criar/editar -------------------------------------------------------
const modalAberto = ref(false);
const itemEditando = ref<Cadastro | null>(null);
const busy = ref(false);

function abrirNovo(): void {
  itemEditando.value = null;
  modalAberto.value = true;
}
function abrirEdicao(item: Cadastro): void {
  itemEditando.value = item;
  modalAberto.value = true;
}
function fecharModal(): void {
  modalAberto.value = false;
  itemEditando.value = null;
  busy.value = false;
}

async function executar(acao: () => Promise<void>, sucesso: string, falha: string): Promise<boolean> {
  busy.value = true;
  try {
    await acao();
    showToast(sucesso);
    return true;
  } catch (e) {
    showToast(getErrorMessage(e, falha));
    return false;
  } finally {
    busy.value = false;
  }
}

async function handleCriar(payload: NovoPorLista[ListaCadastro]): Promise<void> {
  const lista = listaAtiva.value;
  const ok = await executar(
    async () => {
      await criar(lista, payload);
    },
    `${capitalizar(LISTA_CADASTRO_ITEM[lista])} criado.`,
    "Erro ao criar o item.",
  );
  if (ok) fecharModal();
}

async function handleAtualizar(id: string, patch: PatchPorLista[ListaCadastro]): Promise<void> {
  const lista = listaAtiva.value;
  const ok = await executar(
    async () => {
      await alterar(lista, id, patch);
    },
    "Alterações salvas.",
    "Erro ao salvar as alterações.",
  );
  if (ok) fecharModal();
}

// ---- Reativar (também vem do aviso de nome repetido no modal) ------------------
async function reativar(item: Cadastro): Promise<void> {
  const lista = listaAtiva.value;
  const ok = await executar(
    async () => {
      await alterar(lista, item.id, { ativo: true });
    },
    `"${item.nome}" reativado.`,
    "Erro ao reativar o item.",
  );
  if (ok) fecharModal();
}

// ---- Desativar (com confirmação) -----------------------------------------------
const itemParaDesativar = ref<Cadastro | null>(null);

async function confirmarDesativar(): Promise<void> {
  const item = itemParaDesativar.value;
  if (!item) return;
  const lista = listaAtiva.value;
  await executar(
    async () => {
      await alterar(lista, item.id, { ativo: false });
    },
    `"${item.nome}" desativado.`,
    "Erro ao desativar o item.",
  );
  itemParaDesativar.value = null;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
</script>

<template>
  <div id="cadastros-tab" class="flex flex-col gap-4">
    <SegmentedControl
      id="cadastro-lista-escolha"
      v-model="listaAtiva"
      :options="opcoesLista"
      label="Lista de cadastro"
      compacto
    />

    <div class="flex items-center justify-between gap-3">
      <h2 id="cadastro-lista-titulo" class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">
        {{ LISTA_CADASTRO_ROTULO[listaAtiva] }}
      </h2>
      <button
        v-if="podeEditar"
        id="btn-novo-cadastro"
        type="button"
        class="shrink-0 rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 max-lg:min-h-11"
        @click="abrirNovo"
      >
        + Novo {{ nomeDoItem }}
      </button>
    </div>

    <p v-if="error" id="cadastros-erro" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      {{ error }}
    </p>

    <CadastroLista
      :key="listaAtiva"
      :lista="listaAtiva"
      :itens="itensDaLista"
      :carregando="loading"
      :pode-editar="podeEditar"
      @editar="abrirEdicao"
      @desativar="itemParaDesativar = $event"
      @reativar="reativar"
    />

    <CadastroFormModal
      v-if="modalAberto"
      :lista="listaAtiva"
      :editando="itemEditando"
      :existentes="itensDaLista"
      :busy="busy"
      @criar="handleCriar"
      @atualizar="handleAtualizar"
      @reativar="reativar"
      @close="fecharModal"
      @invalid="showToast"
    />

    <ConfirmDialog
      v-if="itemParaDesativar"
      title="Desativar item"
      :message="`Desativar “${itemParaDesativar.nome}”? Ele deixa de ser oferecido para escolha, continua aparecendo onde já foi usado e pode ser reativado depois.`"
      confirm-label="Sim, desativar"
      cancel-label="Cancelar"
      reforcado
      :loading="busy"
      @confirm="confirmarDesativar"
      @close="itemParaDesativar = null"
    />
  </div>
</template>
