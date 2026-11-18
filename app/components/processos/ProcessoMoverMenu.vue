<script setup lang="ts">
import { computed } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { ICONES_PROCESSO } from "../../utils/processoIcones";
import { opcoesMoverPara } from "../../utils/processoKanban";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";

// Menu "Mover para…" do CABEÇALHO DO PAINEL do Kanban: lista as OUTRAS 4 colunas. É o único caminho de mudar de
// coluna em toque e por teclado (o card não tem mais botão próprio: abrir o card → Tab até aqui). Reaproveita o
// ActionsMenu (role=menu, setas ↑/↓, Esc fecha e devolve o foco ao botão); a lista abre em z-890, acima do painel
// (z-880), em `body` com position fixed (posicionada pela borda direita do botão: não depende da largura dele).
// Escolher só PEDE a mudança: a página abre a confirmação (o mesmo fluxo do arrastar).
//
// O botão é SÓ O ÍCONE (setas): `title` "Mover para…" e `aria-label` com o nome do paciente. Enquanto a mudança grava
// (`movendo`), o botão continua no lugar, desabilitado, com aria-busy, nome "Movendo…" e um spinner pequeno.
const props = withDefaults(
  defineProps<{
    processo: Processo;
    disabled?: boolean;
    movendo?: boolean;
  }>(),
  { disabled: false, movendo: false },
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

const rotulo = computed(() => (props.movendo ? "Movendo…" : `Mover ${props.processo.paciente} para…`));
const dica = computed(() => (props.movendo ? "Movendo…" : "Mover para…"));

// 44x44 abaixo de lg (alvo de toque); 36x36 em lg+.
const CLASSE_TRIGGER =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-paper-raised text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark lg:h-9 lg:w-9";
</script>

<template>
  <ActionsMenu
    :items="itens"
    :trigger-id="`btn-mover-painel-${processo.id}`"
    :menu-id="`menu-mover-painel-${processo.id}`"
    :aria-label="rotulo"
    :title="dica"
    :busy="movendo"
    :trigger-class="CLASSE_TRIGGER"
    menu-z-class="z-[890]"
    itens-toque
    :disabled="disabled || movendo"
  >
    <template #trigger>
      <svg
        v-if="movendo"
        id="painel-movendo-spinner"
        viewBox="0 0 24 24"
        class="h-4 w-4 shrink-0 animate-spin"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.2-8.55" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        class="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path v-for="(d, i) in ICONES_PROCESSO.mover" :key="i" :d="d" />
      </svg>
    </template>
  </ActionsMenu>
</template>
