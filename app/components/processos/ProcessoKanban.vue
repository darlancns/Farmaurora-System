<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { useArrastarKanban } from "../../composables/useArrastarKanban";
import { useRolagemQuadro } from "../../composables/useRolagemQuadro";
import { agruparPorColuna, COLUNAS_KANBAN } from "../../utils/processoKanban";
import KanbanColunaIcone from "./KanbanColunaIcone.vue";
import ProcessoKanbanCard from "./ProcessoKanbanCard.vue";

// Quadro do Follow-Up por status (só para quem pode editar processos). Recebe a lista JÁ filtrada pela página
// (busca, Empresa, Responsável, Cotações ASD) e agrupa uma vez só; cada coluna vem ordenada por Pasta (o mais antigo
// em cima). O número no cabeçalho reflete os filtros e a busca.
//
// Mudar de coluna: arrastar o card (mouse) — a página confirma e grava (useMoverProcesso). Em toque e por teclado o
// caminho é o "Mover para…" do painel. `movendo` = ids travados enquanto gravam.
//
// Layout:
// - Colunas com largura MÍNIMA de 19,5rem (312px): cabe "Pasta · PO" no pior caso ("2026 - 426 · PO-26-1126/2", 25
//   caracteres em mono 11,5px ≈ 173px) + a etiqueta "Pendente" (~63px) na mesma linha, com respiro, dentro do
//   padding do card e da coluna. Quando sobra tela, as colunas crescem igualmente (flex-1).
// - Só o QUADRO rola na horizontal (overflow-x no contêiner); o cabeçalho da página, a busca e os filtros ficam na
//   largura da janela. Os botões ‹ › (sticky na janela, no meio da altura) rolam ~1 coluna e somem na ponta; Shift+roda
//   e trackpad seguem funcionando.
// - SEM rolagem vertical por coluna: cada coluna cresce com o conteúdo e a única rolagem vertical é a da página. As
//   colunas esticam até a altura da mais alta (flex), então dá para soltar um card em qualquer altura da coluna.
// - Abaixo de lg: snap horizontal (~85vw por coluna) com gutter de 16px.
const props = withDefaults(
  defineProps<{
    processos: Processo[];
    focoId?: string;
    movendo?: ReadonlySet<string>;
  }>(),
  { focoId: "", movendo: () => new Set<string>() },
);

const emit = defineEmits<{
  abrir: [processo: Processo];
  mover: [processo: Processo, para: StatusProcesso];
}>();

const grupos = computed(() => agruparPorColuna(props.processos));
const quadro = ref<HTMLElement | null>(null);

const arrasto = useArrastarKanban({
  processos: () => props.processos,
  quadro,
  podeArrastar: (p) => !props.movendo.has(p.id),
  aoSoltar: (p, destino) => emit("mover", p, destino),
});

const rolagem = useRolagemQuadro(quadro);
// A lista mudou (busca, filtros, recarga): a largura do conteúdo pode mudar; reavalia as pontas.
watch(
  () => props.processos,
  () => void nextTick(rolagem.atualizar),
);

const CLASSE_SETA =
  "pointer-events-auto absolute flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-paper-raised text-accent-dark shadow-md transition-colors hover:border-accent-dark hover:bg-farm-blue-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark lg:h-10 lg:w-10";
</script>

<template>
  <div id="processo-kanban-area" class="relative">
    <!-- Botões ‹ ›: um "trilho" de altura zero, sticky no meio da janela, dentro da área do quadro (aparece só enquanto
         o quadro está à vista). Cada botão some quando não há para onde rolar naquele sentido. -->
    <div class="pointer-events-none sticky top-[45dvh] z-20 h-0">
      <button
        v-if="rolagem.podeEsquerda.value"
        id="btn-kanban-rolar-esquerda"
        type="button"
        aria-label="Rolar quadro para a esquerda"
        aria-controls="processo-kanban"
        :class="CLASSE_SETA"
        class="left-0"
        @click="rolagem.rolar(-1)"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        v-if="rolagem.podeDireita.value"
        id="btn-kanban-rolar-direita"
        type="button"
        aria-label="Rolar quadro para a direita"
        aria-controls="processo-kanban"
        :class="CLASSE_SETA"
        class="right-0"
        @click="rolagem.rolar(1)"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>

    <div
      id="processo-kanban"
      ref="quadro"
      class="-mx-6 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 lg:mx-0 lg:snap-none lg:scroll-px-0 lg:px-0"
      aria-label="Processos por status"
    >
      <section
        v-for="coluna in COLUNAS_KANBAN"
        :id="`kanban-coluna-${coluna.id}`"
        :key="coluna.id"
        :data-testid="`kanban-coluna-${coluna.id}`"
        :aria-labelledby="`kanban-cabecalho-${coluna.id}`"
        class="flex w-[85vw] max-w-[22rem] min-w-[18rem] shrink-0 snap-start flex-col gap-2 rounded-lg transition-colors lg:w-auto lg:max-w-none lg:min-w-[19.5rem] lg:flex-1 lg:basis-0"
        :class="arrasto.destacada(coluna.status) ? 'outline-2 outline-offset-2 outline-accent-dark' : ''"
        @dragenter="arrasto.onDragEnter($event, coluna.status)"
        @dragover="arrasto.onDragOver($event, coluna.status)"
        @dragleave="arrasto.onDragLeave(coluna.status)"
        @drop="arrasto.onDrop($event, coluna.status)"
      >
        <!-- Cabeçalho: faixa na cor do projeto, igual em todas as colunas: ícone + título + (número). -->
        <header
          :id="`kanban-cabecalho-${coluna.id}`"
          class="flex h-10 w-full shrink-0 items-center gap-2 rounded-lg bg-accent-dark px-3 font-display text-[13.5px] font-medium text-white"
        >
          <KanbanColunaIcone :status="coluna.status" />
          <span :id="`kanban-titulo-${coluna.id}`" class="truncate">{{ coluna.rotulo }}</span>
          <!-- O espaço antes do "(" é texto de verdade (não só o gap): o nome lido pelo leitor de tela é "Em trânsito (24)". -->
          <span class="-ml-2 shrink-0 text-white/80"
            >{{ " (" }}<span :id="`kanban-contador-${coluna.id}`">{{ grupos[coluna.status].length }}</span>)</span
          >
        </header>

        <div
          :id="`kanban-lista-${coluna.id}`"
          class="flex flex-1 flex-col gap-2 rounded-lg p-2 transition-colors"
          :class="arrasto.destacada(coluna.status) ? 'bg-farm-blue-soft' : 'bg-hairline/25'"
        >
          <ProcessoKanbanCard
            v-for="processo in grupos[coluna.status]"
            :key="processo.id"
            :processo="processo"
            :destaque="processo.id === focoId"
            :arrastavel="arrasto.habilitado.value"
            :movendo="movendo.has(processo.id)"
            @abrir="emit('abrir', $event)"
            @arrastar="arrasto.onDragStart"
            @soltar-arrasto="arrasto.onDragEnd"
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
  </div>
</template>
