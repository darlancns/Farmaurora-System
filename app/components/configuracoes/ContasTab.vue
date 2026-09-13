<script setup lang="ts">
import { computed, onMounted } from "vue";
import { ROLE_LABEL } from "#shared/constants/roles";
import { useAuth } from "../../composables/useAuth";
import { useContasAdmin } from "../../composables/useContasAdmin";
import { useToast } from "../../composables/useToast";
import ConfirmDialog from "../ConfirmDialog.vue";
import ContaFormModal from "./ContaFormModal.vue";
import ResetPasswordModal from "./ResetPasswordModal.vue";

const { user } = useAuth();
const { showToast } = useToast();
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

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
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

    <div class="overflow-hidden rounded-lg border border-hairline bg-paper-raised">
      <table class="w-full text-left text-[13px]">
        <thead class="border-b border-hairline bg-paper text-[11px] tracking-wide text-ink-soft uppercase">
          <tr>
            <th class="px-3.5 py-2.5 font-semibold">E-mail</th>
            <th class="px-3.5 py-2.5 font-semibold">Cargo</th>
            <th class="px-3.5 py-2.5 font-semibold">Consultor</th>
            <th class="px-3.5 py-2.5 font-semibold">Criado em</th>
            <th class="px-3.5 py-2.5 font-semibold">Último login</th>
            <th class="px-3.5 py-2.5 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !contas.length">
            <td colspan="6" class="px-3.5 py-6 text-center text-ink-soft">Carregando…</td>
          </tr>
          <tr v-else-if="!contas.length">
            <td colspan="6" class="px-3.5 py-6 text-center text-ink-soft">Nenhuma conta.</td>
          </tr>
          <tr
            v-for="conta in contas"
            :id="`conta-row-${conta.id}`"
            :key="conta.id"
            class="border-b border-hairline last:border-b-0"
          >
            <td class="px-3.5 py-2.5">
              {{ conta.email }}
              <span v-if="conta.id === meuId" class="ml-1 text-[11px] text-ink-soft">(você)</span>
            </td>
            <td class="px-3.5 py-2.5">{{ ROLE_LABEL[conta.role] }}</td>
            <td class="px-3.5 py-2.5 text-ink-soft">{{ conta.consultorNome ?? "—" }}</td>
            <td class="px-3.5 py-2.5 font-mono text-[12px] text-ink-soft">{{ fmtData(conta.createdAt) }}</td>
            <td class="px-3.5 py-2.5 font-mono text-[12px] text-ink-soft">{{ fmtData(conta.lastSignInAt) }}</td>
            <td class="px-3.5 py-2.5">
              <div class="flex justify-end gap-1.5">
                <button
                  :id="`btn-editar-conta-${conta.id}`"
                  type="button"
                  class="rounded-md border border-hairline px-2 py-1 text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
                  @click="abrirEdicao(conta)"
                >
                  Editar
                </button>
                <button
                  :id="`btn-reset-senha-${conta.id}`"
                  type="button"
                  class="rounded-md border border-hairline px-2 py-1 text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
                  @click="abrirReset(conta)"
                >
                  Redefinir senha
                </button>
                <button
                  :id="`btn-excluir-conta-${conta.id}`"
                  type="button"
                  class="rounded-md border border-hairline px-2 py-1 text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-danger hover:text-danger"
                  @click="contaParaExcluir = conta"
                >
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
