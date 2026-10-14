<script setup lang="ts">
import { computed, onMounted } from "vue";
import { ROLE_LABEL } from "#shared/constants/roles";
import { useAuth } from "../../composables/useAuth";
import { useContasAdmin } from "../../composables/useContasAdmin";
import { useToast } from "../../composables/useToast";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";
import ConfirmDialog from "../ConfirmDialog.vue";
import ContaFormModal from "./ContaFormModal.vue";
import ResetPasswordModal from "./ResetPasswordModal.vue";
import type { AdminUserSummary } from "#shared/types/auth";

const { user, canWrite } = useAuth();
const { showToast } = useToast();
// socio lê a lista de contas mas não gerencia — só administrador cria/edita/
// exclui/redefine senha (seção "admin", ver shared/utils/rbac.ts).
const podeGerenciar = computed<boolean>(() => canWrite("admin"));
const {
  contas,
  loading,
  error,
  fetchContas,
  consultoresEmUso,
  showFormModal,
  editingConta,
  formBusy,
  abrirNovaConta,
  abrirEdicao,
  fecharFormModal,
  handleCreate,
  handleUpdate,
  contaParaExcluir,
  confirmarExclusao,
  resetConta,
  resetBusy,
  abrirReset,
  fecharReset,
  confirmarReset,
  revelacao,
  copiarSenha,
} = useContasAdmin();

onMounted(() => {
  fetchContas();
});

const meuId = computed(() => user.value?.id ?? null);

function itemsPara(conta: AdminUserSummary): ActionsMenuItem[] {
  return [
    {
      id: `btn-editar-conta-${conta.id}`,
      label: "Editar",
      onClick: () => abrirEdicao(conta),
    },
    {
      id: `btn-reset-senha-${conta.id}`,
      label: "Redefinir senha",
      onClick: () => abrirReset(conta),
    },
    {
      id: `btn-excluir-conta-${conta.id}`,
      label: "Excluir",
      danger: true,
      onClick: () => {
        contaParaExcluir.value = conta;
      },
    },
  ];
}
</script>

<template>
  <div id="contas-tab" class="flex flex-col gap-4">
    <!-- Senha revelada uma única vez -->
    <div
      v-if="revelacao"
      id="senha-revelada"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-accent-dark/30 bg-farm-blue-soft px-4 py-3 text-[13px]"
    >
      <span class="text-ink">
        Senha de <strong>{{ revelacao.email }}</strong>:
        <code class="ml-1 rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">{{ revelacao.password }}</code>
      </span>
      <span class="text-[11.5px] text-ink-soft">Copie e repasse agora — não aparece de novo.</span>
      <div class="ml-auto flex gap-2">
        <button
          id="btn-copiar-senha-revelada"
          type="button"
          class="rounded-md border border-accent-dark px-2.5 py-1 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark hover:text-white"
          @click="copiarSenha"
        >
          Copiar
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:text-ink"
          @click="revelacao = null"
        >
          Ocultar
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between">
      <h2 class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Contas da equipe</h2>
      <button
        v-if="podeGerenciar"
        id="btn-nova-conta"
        type="button"
        class="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
        @click="abrirNovaConta"
      >
        + Nova conta
      </button>
    </div>

    <p v-if="error" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      {{ error }}
    </p>

    <!--
      @container: abaixo do breakpoint, a tabela original (inalterada, mesmo
      layout de sempre a partir dele) dá lugar a uma lista de cards — igual
      ao padrão já usado em LancamentoBancoCard/ProcessoRow, só que aqui como
      duas renderizações paralelas (tabela + cards) alternadas só por CSS, em
      vez de reordenar o conteúdo de uma única linha: cada `<td>` de uma
      tabela HTML não pode virar bloco/coluna sozinho sem sair do "table
      layout" (que é justamente o que garante o desktop ficar idêntico ao
      atual). Mesmo esquema de "dois renders, um oculto por breakpoint" já
      usado por SidebarNav/BottomNav (Rodada 1) — ids diferentes em cada um
      pra nunca duplicar id no DOM.
    -->
    <div class="@container overflow-hidden rounded-lg border border-hairline bg-paper-raised">
      <table class="hidden w-full text-left text-[13px] @[700px]:table">
        <thead class="border-b border-hairline bg-paper text-[11px] tracking-wide text-ink-soft uppercase">
          <tr>
            <th class="px-3.5 py-2.5 font-semibold">Nome</th>
            <th class="px-3.5 py-2.5 font-semibold">E-mail</th>
            <th class="px-3.5 py-2.5 font-semibold">Cargo</th>
            <th class="px-3.5 py-2.5 font-semibold">Consultor</th>
            <th class="px-3.5 py-2.5 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !contas.length">
            <td colspan="5" class="px-3.5 py-6 text-center text-ink-soft">Carregando…</td>
          </tr>
          <tr v-else-if="!contas.length">
            <td colspan="5" class="px-3.5 py-6 text-center text-ink-soft">Nenhuma conta.</td>
          </tr>
          <tr
            v-for="conta in contas"
            :id="`conta-row-${conta.id}`"
            :key="conta.id"
            class="border-b border-hairline last:border-b-0"
          >
            <td class="px-3.5 py-2.5">{{ conta.nome ?? "—" }}</td>
            <td class="px-3.5 py-2.5">
              {{ conta.email }}
              <span v-if="conta.id === meuId" class="ml-1 text-[11px] text-ink-soft">(você)</span>
            </td>
            <td class="px-3.5 py-2.5">{{ ROLE_LABEL[conta.role] }}</td>
            <td class="px-3.5 py-2.5 text-ink-soft">{{ conta.consultorNome ?? "—" }}</td>
            <td class="px-3.5 py-2.5 text-right">
              <ActionsMenu
                v-if="podeGerenciar"
                :trigger-id="`btn-acoes-conta-${conta.id}`"
                :items="itemsPara(conta)"
                :aria-label="`Ações para ${conta.email}`"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="flex flex-col @[700px]:hidden">
        <p v-if="loading && !contas.length" class="px-3.5 py-6 text-center text-[13px] text-ink-soft">Carregando…</p>
        <p v-else-if="!contas.length" class="px-3.5 py-6 text-center text-[13px] text-ink-soft">Nenhuma conta.</p>

        <div
          v-for="conta in contas"
          :id="`conta-card-${conta.id}`"
          :key="conta.id"
          class="flex flex-col gap-1.5 border-b border-hairline px-3.5 py-3 last:border-b-0"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[13.5px] font-medium text-ink">{{ conta.nome ?? "—" }}</p>
              <p class="mt-0.5 text-[12px] break-all text-ink-soft">
                {{ conta.email }}<span v-if="conta.id === meuId" class="ml-1">(você)</span>
              </p>
            </div>
            <ActionsMenu
              v-if="podeGerenciar"
              :trigger-id="`btn-acoes-conta-card-${conta.id}`"
              :items="itemsPara(conta)"
              :aria-label="`Ações para ${conta.email}`"
              class="shrink-0"
            />
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            <span class="rounded-full bg-paper px-2 py-0.5">{{ ROLE_LABEL[conta.role] }}</span>
            <span v-if="conta.consultorNome">{{ conta.consultorNome }}</span>
          </div>
        </div>
      </div>
    </div>

    <ContaFormModal
      v-if="showFormModal"
      :editing-conta="editingConta"
      :consultores-em-uso="consultoresEmUso"
      :busy="formBusy"
      @create="handleCreate"
      @update="handleUpdate"
      @close="fecharFormModal"
      @invalid="showToast"
    />

    <ConfirmDialog
      v-if="contaParaExcluir"
      title="Excluir conta"
      :message="`Excluir a conta de ${contaParaExcluir.email}? Essa ação não pode ser desfeita.`"
      confirm-label="Sim, excluir"
      cancel-label="Cancelar"
      danger
      @confirm="confirmarExclusao"
      @close="contaParaExcluir = null"
    />

    <!-- Redefinir senha -->
    <ResetPasswordModal
      v-if="resetConta"
      :conta="resetConta"
      :busy="resetBusy"
      @confirm="confirmarReset"
      @close="fecharReset"
      @invalid="showToast"
    />
  </div>
</template>
