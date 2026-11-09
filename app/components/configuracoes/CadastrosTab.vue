<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { LISTA_CADASTRO_ROTULO, LISTA_CADASTRO_TEXTOS, LISTAS_CADASTRO } from "#shared/constants/cadastros";
import type { Cadastro, ListaCadastro, NovoPorLista, PatchPorLista } from "#shared/types/Cadastro";
import { useAuth } from "../../composables/useAuth";
import { useCadastros } from "../../composables/useCadastros";
import { useToast } from "../../composables/useToast";
import { getErrorMessage } from "../../utils/errorMessages";
import ConfirmDialog from "../ConfirmDialog.vue";
import CadastroFormModal from "./CadastroFormModal.vue";
import CadastroLista from "./CadastroLista.vue";

// Aba "Cadastros" de /configuracoes (só administrador — ver app/utils/abasConfiguracoes.ts). Tela única com um BLOCO
// (card) por lista, empilhados: Fornecedores, Despachantes e Cias aéreas. Cada bloco tem título, botão "+ Novo …" e a
// lista compacta. Remover = DESATIVAR (nunca apagar); o nome não muda depois de criado. Quem escreve é só o
// administrador (canWrite("config"), a mesma regra do servidor); a tela esconde os botões de quem não pode, mas a
// autorização real está na API.

const { canWrite } = useAuth();
const { showToast } = useToast();
const { itens, loading, error, fetchCadastros, criar, alterar } = useCadastros();

const podeEditar = computed<boolean>(() => canWrite("config"));

onMounted(() => {
  void fetchCadastros();
});

// ---- Modal criar/editar (um só, para qualquer bloco) ---------------------------
const modalLista = ref<ListaCadastro | null>(null);
const itemEditando = ref<Cadastro | null>(null);
const busy = ref(false);

function abrirNovo(lista: ListaCadastro): void {
  itemEditando.value = null;
  modalLista.value = lista;
}
function abrirEdicao(lista: ListaCadastro, item: Cadastro): void {
  itemEditando.value = item;
  modalLista.value = lista;
}
function fecharModal(): void {
  modalLista.value = null;
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
  const lista = modalLista.value;
  if (!lista) return;
  const ok = await executar(
    async () => {
      await criar(lista, payload);
    },
    LISTA_CADASTRO_TEXTOS[lista].criado,
    "Erro ao criar o item.",
  );
  if (ok) fecharModal();
}

async function handleAtualizar(id: string, patch: PatchPorLista[ListaCadastro]): Promise<void> {
  const lista = modalLista.value;
  if (!lista) return;
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
async function reativar(lista: ListaCadastro, item: Cadastro): Promise<void> {
  const ok = await executar(
    async () => {
      await alterar(lista, item.id, { ativo: true });
    },
    `"${item.nome}" reativado.`,
    "Erro ao reativar o item.",
  );
  if (ok) fecharModal();
}

function reativarDoModal(item: Cadastro): void {
  if (modalLista.value) void reativar(modalLista.value, item);
}

// ---- Desativar (com confirmação) -----------------------------------------------
const paraDesativar = ref<{ lista: ListaCadastro; item: Cadastro } | null>(null);

async function confirmarDesativar(): Promise<void> {
  const alvo = paraDesativar.value;
  if (!alvo) return;
  await executar(
    async () => {
      await alterar(alvo.lista, alvo.item.id, { ativo: false });
    },
    `"${alvo.item.nome}" desativado.`,
    "Erro ao desativar o item.",
  );
  paraDesativar.value = null;
}
</script>

<template>
  <div id="cadastros-tab" class="flex flex-col gap-5">
    <p v-if="error" id="cadastros-erro" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      {{ error }}
    </p>

    <!-- Um bloco (card) por lista, empilhados -->
    <section
      v-for="lista in LISTAS_CADASTRO"
      :id="`cadastro-bloco-${lista}`"
      :key="lista"
      class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
    >
      <header class="flex items-center justify-between gap-3 px-3.5 py-3">
        <h2 :id="`cadastro-titulo-${lista}`" class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">
          {{ LISTA_CADASTRO_ROTULO[lista] }}
        </h2>
        <button
          v-if="podeEditar"
          :id="`btn-novo-cadastro-${lista}`"
          type="button"
          class="shrink-0 rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 max-lg:min-h-11"
          @click="abrirNovo(lista)"
        >
          {{ LISTA_CADASTRO_TEXTOS[lista].novo }}
        </button>
      </header>

      <CadastroLista
        :lista="lista"
        :itens="itens[lista]"
        :carregando="loading"
        :pode-editar="podeEditar"
        @editar="abrirEdicao(lista, $event)"
        @desativar="paraDesativar = { lista, item: $event }"
        @reativar="reativar(lista, $event)"
      />
    </section>

    <CadastroFormModal
      v-if="modalLista"
      :lista="modalLista"
      :editando="itemEditando"
      :existentes="itens[modalLista]"
      :busy="busy"
      @criar="handleCriar"
      @atualizar="handleAtualizar"
      @reativar="reativarDoModal"
      @close="fecharModal"
      @invalid="showToast"
    />

    <ConfirmDialog
      v-if="paraDesativar"
      title="Desativar item"
      :message="`Desativar “${paraDesativar.item.nome}”? Ele deixa de ser oferecido para escolha, continua aparecendo onde já foi usado e pode ser reativado depois.`"
      confirm-label="Sim, desativar"
      cancel-label="Cancelar"
      reforcado
      :loading="busy"
      @confirm="confirmarDesativar"
      @close="paraDesativar = null"
    />
  </div>
</template>
