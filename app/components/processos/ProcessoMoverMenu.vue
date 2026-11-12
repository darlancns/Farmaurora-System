<script setup lang="ts">
import { computed } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { opcoesMoverPara } from "../../utils/processoKanban";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";

// Menu "Mover para…" do CABEÇALHO DO PAINEL do Kanban: lista as OUTRAS 4 colunas. É o único caminho de mudar de
// coluna em toque e por teclado (o card não tem mais botão próprio: abrir o card → Tab até aqui). Reaproveita o
// ActionsMenu (role=menu, setas ↑/↓, Esc fecha e devolve o foco ao botão); a lista abre em z-890, acima do painel
// (z-880). Escolher só PEDE a mudança: a página abre a confirmação (o mesmo fluxo do arrastar).
const props = withDefaults(
  defineProps<{
    processo: Processo;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  mover: [para: StatusProcesso];
}>();

const itens = computed<ActionsMenuItem[]>(() =>
  opcoesMoverPara(props.processo).map((coluna) => ({
    id: `mover-painel-${props.processo.id}-${coluna.id}`,
    label: coluna.rotulo,
    onClick: () => emit("mover", coluna.status),
  })),
);

const CLASSE_TRIGGER =
  "flex min-h-11 items-center gap-1.5 rounded-md border border-hairline bg-paper-raised px-2.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark lg:min-h-8";
</script>

<template>
  <ActionsMenu
    :items="itens"
    :trigger-id="`btn-mover-painel-${processo.id}`"
    :menu-id="`menu-mover-painel-${processo.id}`"
    :aria-label="`Mover ${processo.paciente} para…`"
    :trigger-class="CLASSE_TRIGGER"
    menu-z-class="z-[890]"
    itens-toque
    :disabled="disabled"
  >
    <template #trigger>
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
      <span>Mover para…</span>
    </template>
  </ActionsMenu>
</template>
