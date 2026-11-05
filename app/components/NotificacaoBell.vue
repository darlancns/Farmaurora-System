<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { Notificacao } from "#shared/types/notificacao";
import { podeResolverAlertaMandado } from "#shared/utils/mandadoPermissao";
import { calcularNotificacoesFornecedor, type NotificacaoFornecedor } from "../utils/prazoFornecedor";
import { calcularNotificacoesMandadoDoUsuario, type NotificacaoMandado } from "../utils/prazoMandado";
import { useAuth } from "../composables/useAuth";
import { useProcessos } from "../composables/useProcessos";
import { useNotificacoes } from "../composables/useNotificacoes";
import { useToast } from "../composables/useToast";
import { getErrorMessage } from "../utils/errorMessages";

/**
 * Sino global (Fase C2) — renderizado direto pelo GlobalHeader em toda
 * página, não mais um slot de Processos. Agrega 3 fontes que continuam
 * isoladas por baixo do capô (ver docs/recados-spec.md seção 7):
 *  - Fornecedor: alertas de SLA calculados on-the-fly a partir de
 *    Processo[] (calcularNotificacoesFornecedor, inalterada) — só aparece
 *    pra quem tem escrita em Processos.
 *  - Mandado de Segurança: 7 dias após o registro do LPCO, calculado a partir
 *    de Processo[] (calcularNotificacoesMandadoDoUsuario). Administrador vê
 *    todos; operacional só os seus (vínculo pelo primeiro nome); consultor e
 *    sócio não veem.
 *  - Recados: tabela `notificacoes`, aparece pra qualquer conta.
 * IDs preservados de NotificacaoFornecedorBell.vue (ver
 * tests/e2e/notificacao-fornecedor.spec.ts): btn/badge/painel
 * "-notificacoes-fornecedor", item/botão "-notificacao-fornecedor-{id}" —
 * o nome ficou "fornecedor" por legado, mas o badge/painel agora são
 * combinados; renomear quebraria esse spec sem necessidade.
 */

const { canWrite, user } = useAuth();
const canWriteProcessos = computed<boolean>(() => canWrite("processos"));

const { processos, patchProcesso, fetchProcessos } = useProcessos();
const { notificacoes, fetchNotificacoes, marcarComoLida } = useNotificacoes();
const { showToast } = useToast();

onMounted(() => {
  // Busca a lista completa de processos só quando a seção Fornecedor pode
  // aparecer — evita um fetch inútil pra Consultor/Sócio, que nunca veem
  // essa seção. Dedup de in-flight fica dentro de fetchProcessos().
  if (canWriteProcessos.value) fetchProcessos();
  fetchNotificacoes();
});

const open = ref(false);
const rootRef = ref<HTMLDivElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);

// Fornecedor: removidos otimisticamente da lista assim que o usuário clica no
// check, antes da resposta do PATCH — se o PATCH falhar, volta pra lista e
// avisa por toast. Mesma lógica de sempre (NotificacaoFornecedorBell.vue),
// só realocada aqui.
const dismissedIds = reactive(new Set<string>());

const notificacoesFornecedor = computed<NotificacaoFornecedor[]>(() =>
  canWriteProcessos.value ? calcularNotificacoesFornecedor(processos.value) : [],
);
const notificacoesFornecedorVisiveis = computed(() =>
  notificacoesFornecedor.value.filter((n) => !dismissedIds.has(n.processoId)),
);

// Mandado: mesmo esquema otimista do Fornecedor, com conjunto próprio (o mesmo
// processo pode ter os dois alertas e resolver um não pode esconder o outro).
const dismissedMandadoIds = reactive(new Set<string>());

const notificacoesMandado = computed<NotificacaoMandado[]>(() =>
  canWriteProcessos.value
    ? calcularNotificacoesMandadoDoUsuario(processos.value, { role: user.value?.role, nome: user.value?.nome })
    : [],
);
const notificacoesMandadoVisiveis = computed(() =>
  notificacoesMandado.value.filter((n) => !dismissedMandadoIds.has(n.processoId)),
);

// Recados: só as não lidas aparecem no sino — mesmo espírito de "some da
// lista ao resolver" do lado Fornecedor, aplicado a "marcar como lida".
const notificacoesRecadosVisiveis = computed<Notificacao[]>(() => notificacoes.value.filter((n) => !n.lida));

const badgeCount = computed(
  () =>
    notificacoesFornecedorVisiveis.value.length +
    notificacoesMandadoVisiveis.value.length +
    notificacoesRecadosVisiveis.value.length,
);

function togglePanel(): void {
  open.value = !open.value;
}

function closePanel(focusButton = false): void {
  open.value = false;
  if (focusButton) buttonRef.value?.focus();
}

async function resolverNotificacaoFornecedor(notificacao: NotificacaoFornecedor): Promise<void> {
  dismissedIds.add(notificacao.processoId);
  try {
    await patchProcesso(notificacao.processoId, { alertaFornecedorResolvido: true });
  } catch (e) {
    dismissedIds.delete(notificacao.processoId);
    showToast(getErrorMessage(e, "Erro ao marcar alerta como resolvido"));
  }
}

async function resolverNotificacaoMandado(notificacao: NotificacaoMandado): Promise<void> {
  dismissedMandadoIds.add(notificacao.processoId);
  try {
    await patchProcesso(notificacao.processoId, { alertaMandadoResolvido: true });
  } catch (e) {
    dismissedMandadoIds.delete(notificacao.processoId);
    showToast(getErrorMessage(e, "Erro ao marcar alerta como resolvido"));
  }
}

// O check do Mandado só aparece pra quem pode resolver (mesma regra do servidor: administrador ou
// o operacional responsável — shared/utils/mandadoPermissao.ts).
function podeResolverMandado(notificacao: NotificacaoMandado): boolean {
  return podeResolverAlertaMandado({ role: user.value?.role, nome: user.value?.nome }, notificacao.responsavel);
}

// Clicar no item marca como lida — sem navegar (a página /recados ainda não
// existe, ver Fase D).
async function marcarNotificacaoRecadoComoLida(notificacao: Notificacao): Promise<void> {
  try {
    await marcarComoLida(notificacao.id);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao marcar notificação como lida"));
  }
}

function onClickOutside(event: MouseEvent): void {
  if (!rootRef.value?.contains(event.target as Node)) {
    closePanel();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closePanel(true);
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("mousedown", onClickOutside);
    document.removeEventListener("keydown", onKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onClickOutside);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      id="btn-notificacoes-fornecedor"
      ref="buttonRef"
      type="button"
      title="Notificações"
      aria-label="Notificações"
      :aria-expanded="open"
      class="relative flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-paper-raised text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark md:h-[42px] md:w-[42px]"
      @click="togglePanel"
    >
      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      <span
        v-if="badgeCount > 0"
        id="badge-notificacoes-fornecedor"
        class="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 font-mono text-[10.5px] font-semibold text-white"
      >
        {{ badgeCount }}
      </span>
    </button>

    <div
      v-if="open"
      id="painel-notificacoes-fornecedor"
      class="absolute right-0 z-50 mt-2 w-[360px] max-h-[420px] overflow-y-auto rounded-lg border border-hairline bg-paper-raised shadow-lg"
    >
      <template v-if="notificacoesFornecedorVisiveis.length">
        <p class="border-b border-hairline px-3.5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
          Fornecedor
        </p>
        <div
          v-for="notificacao in notificacoesFornecedorVisiveis"
          :key="notificacao.processoId"
          :id="`notificacao-fornecedor-${notificacao.processoId}`"
          class="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
        >
          <div class="min-w-0">
            <p class="truncate text-[13px] font-medium text-ink">
              {{ notificacao.paciente }}
              <span class="font-mono text-[11px] font-normal text-ink-soft">· {{ notificacao.pasta }}</span>
            </p>
            <p class="text-[11.5px] text-danger">
              {{ notificacao.fornecedor }} — {{ notificacao.diasDeAtraso }}
              {{ notificacao.diasDeAtraso === 1 ? "dia" : "dias" }} de atraso
            </p>
          </div>
          <button
            :id="`btn-resolver-notificacao-${notificacao.processoId}`"
            type="button"
            title="Marcar como resolvido"
            aria-label="Marcar como resolvido"
            class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark md:p-1.5"
            @click="resolverNotificacaoFornecedor(notificacao)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        </div>
      </template>

      <template v-if="notificacoesMandadoVisiveis.length">
        <p class="border-b border-hairline px-3.5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
          Mandado de Segurança
        </p>
        <div
          v-for="notificacao in notificacoesMandadoVisiveis"
          :key="notificacao.processoId"
          :id="`notificacao-mandado-${notificacao.processoId}`"
          class="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
        >
          <p class="min-w-0 text-[12.5px] text-danger">
            Solicitar Mandado de Segurança — {{ notificacao.paciente }} (pasta {{ notificacao.pasta }}). Registro do LPCO em
            {{ notificacao.registroDDMM }}, há {{ notificacao.diasDecorridos }}
            {{ notificacao.diasDecorridos === 1 ? "dia" : "dias" }}.
          </p>
          <button
            v-if="podeResolverMandado(notificacao)"
            :id="`btn-resolver-mandado-${notificacao.processoId}`"
            type="button"
            title="Marcar como resolvido"
            aria-label="Marcar como resolvido"
            class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark md:p-1.5"
            @click="resolverNotificacaoMandado(notificacao)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
        </div>
      </template>

      <template v-if="notificacoesRecadosVisiveis.length">
        <p class="border-b border-hairline px-3.5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
          Recados
        </p>
        <div
          v-for="notificacao in notificacoesRecadosVisiveis"
          :key="notificacao.id"
          :id="`notificacao-recado-${notificacao.id}`"
          class="cursor-pointer border-b border-hairline px-3.5 py-2.5 text-[13px] text-ink transition-colors last:border-b-0 hover:bg-paper"
          @click="marcarNotificacaoRecadoComoLida(notificacao)"
        >
          {{ notificacao.mensagem }}
        </div>
      </template>

      <p
        v-if="
          !notificacoesFornecedorVisiveis.length &&
          !notificacoesMandadoVisiveis.length &&
          !notificacoesRecadosVisiveis.length
        "
        class="px-3.5 py-6 text-center text-[12.5px] text-ink-soft"
      >
        Nenhuma notificação no momento.
      </p>
    </div>
  </div>
</template>
