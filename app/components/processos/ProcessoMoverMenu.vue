<script setup lang="ts">
import { computed } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { opcoesMoverPara } from "../../utils/processoKanban";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";

// Menu "Mover para…" de um processo (card do Kanban e cabeçalho do painel): lista as OUTRAS 4 colunas. Reaproveita o
// ActionsMenu (role=menu, setas ↑/↓, Esc fecha e devolve o foco ao botão). Escolher só PEDE a mudança: quem usa abre
// a confirmação (o mesmo fluxo do arrastar).
const props = withDefaults(
  defineProps<{
    processo: Processo;
    // "card" ou "painel": entra nos ids (os dois podem estar na tela ao mesmo tempo).
    contexto: "card" | "painel";
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  mover: [para: StatusProcesso];
}>();

const itens = computed<ActionsMenuItem[]>(() =>
  opcoesMoverPara(props.processo).map((coluna) => ({
    id: `mover-${props.contexto}-${props.processo.id}-${coluna.id}`,
    label: coluna.rotulo,
    onClick: () => emit("mover", coluna.status),
  })),
);

// Painel: botão com texto; card: ícone de setas, 44px abaixo de lg e 28px em lg+ (como o ActionsMenu de sempre).
const classeTrigger = computed(() =>
  props.contexto === "painel"
    ? "flex min-h-11 items-center gap-1.5 rounded-md border border-hairline bg-paper-raised px-2.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark lg:min-h-8"
    : "flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark lg:h-7 lg:w-7",
);
</script>

<template>
  <ActionsMenu
    :items="itens"
    :trigger-id="`btn-mover-${contexto}-${processo.id}`"
    :menu-id="`menu-mover-${contexto}-${processo.id}`"
    :aria-label="`Mover ${processo.paciente} para…`"
    :trigger-class="classeTrigger"
    :menu-z-class="contexto === 'painel' ? 'z-[890]' : 'z-50'"
    :disabled="disabled"
  >
    <template #trigger>
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
      <span v-if="contexto === 'painel'">Mover para…</span>
    </template>
  </ActionsMenu>
</template>
