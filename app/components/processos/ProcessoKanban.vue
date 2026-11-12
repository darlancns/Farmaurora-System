<script setup lang="ts">
import { computed } from "vue";
import type { Processo } from "#shared/types/processo";
import { agruparPorColuna, COLUNAS_KANBAN } from "../../utils/processoKanban";
import { STATUS_PROCESSO_META } from "../../utils/processoStatus";
import ProcessoKanbanCard from "./ProcessoKanbanCard.vue";

// Quadro do Follow-Up por status (só para quem pode editar processos). Recebe a lista JÁ filtrada pela página
// (busca, Empresa, Responsável, Cotações ASD) e agrupa uma vez só; cada coluna vem ordenada por Pasta (o mais antigo
// em cima). O contador de cada coluna reflete os filtros e a busca.
//
// Layout: em lg+ colunas de 226px com rolagem horizontal do quadro e rolagem vertical por coluna; abaixo de lg
// rolagem horizontal com snap (~85vw por coluna) e a página rola na vertical.
const props = withDefaults(
  defineProps<{
    processos: Processo[];
    focoId?: string;
  }>(),
  { focoId: "" },
);

const emit = defineEmits<{
  abrir: [processo: Processo];
}>();

const grupos = computed(() => agruparPorColuna(props.processos));
</script>

<template>
  <div
    id="processo-kanban"
    class="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-3 lg:mx-0 lg:snap-none lg:px-0"
    aria-label="Processos por status"
  >
    <section
      v-for="coluna in COLUNAS_KANBAN"
      :id="`kanban-coluna-${coluna.id}`"
      :key="coluna.id"
      :data-testid="`kanban-coluna-${coluna.id}`"
      :aria-labelledby="`kanban-titulo-${coluna.id}`"
      class="flex w-[85vw] max-w-[340px] shrink-0 snap-start flex-col rounded-lg bg-hairline/25 lg:w-[226px] lg:max-w-none"
    >
      <header class="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-2">
        <span
          :id="`kanban-titulo-${coluna.id}`"
          class="truncate rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="STATUS_PROCESSO_META[coluna.status].badgeClass"
          >{{ coluna.rotulo }}</span
        >
        <span
          :id="`kanban-contador-${coluna.id}`"
          class="shrink-0 rounded-full bg-paper-raised px-2 py-0.5 font-mono text-[11.5px] text-ink-soft"
          :aria-label="`${grupos[coluna.status].length} processos`"
          >{{ grupos[coluna.status].length }}</span
        >
      </header>

      <div
        :id="`kanban-lista-${coluna.id}`"
        class="flex flex-col gap-2 px-2 pb-2 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto lg:overscroll-contain"
      >
        <ProcessoKanbanCard
          v-for="processo in grupos[coluna.status]"
          :key="processo.id"
          :processo="processo"
          :destaque="processo.id === focoId"
          @abrir="emit('abrir', $event)"
        />
        <p
          v-if="!grupos[coluna.status].length"
          :id="`kanban-vazio-${coluna.id}`"
          class="rounded-lg border border-dashed border-hairline px-3 py-5 text-center text-[12px] text-ink-soft"
        >
          Nenhum processo
        </p>
      </div>
    </section>
  </div>
</template>
