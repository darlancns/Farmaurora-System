<script setup lang="ts">
import { computed } from "vue";
import type { Processo } from "#shared/types/processo";
import { resumoMedicamentos } from "../../utils/processoFormatters";
import { linhasInfoKanban, type ChaveCelulaKanban } from "../../utils/processoKanbanInfo";

// Card de um processo no Kanban do Follow-Up. O <article> INTEIRO é o controle que abre o painel: role="button",
// tabindex="0", Enter/Espaço abrem, foco visível — e NENHUM <button> dentro dele (a etiqueta de pagamento é só um
// span). O arrastar também é no próprio <article> (draggable), o que evita o problema do Firefox de não iniciar o
// arrasto a partir de um <button> dentro de um elemento arrastável.
//
// Mudar de coluna: arrastar (mouse/caneta, com confirmação) ou o menu "Mover para…" do CABEÇALHO DO PAINEL — o
// único caminho em toque e por teclado (Enter/Espaço no card abre o painel; Tab chega ao "Mover para…").
//
// Linhas: (1) Pasta · PO e, à direita, Pago/Pendente (só com valor); (2) paciente (até 2 linhas); (3) medicamento
// (até 2 linhas); (4) bloquinhos (ver app/utils/processoKanbanInfo.ts): [Responsável][Consultor][Pendências],
// [Fornecedor][Despachante] e [Cia. aérea · AWB]. Só a ALTURA do card cresce: os bloquinhos cabem na largura dele.
// Hierarquia: o NOME DO PACIENTE é o texto maior (16px/600, cor ink; peso igual ao das pendências — o destaque
// vem do tamanho e da cor); topo, medicamento e bloquinhos ficam abaixo (≤ 12px, peso ≤ 600). Bloquinhos discretos: fundo #f6f8f8, borda #e0e7e5, ícones #6b7f87 (gráficos, 3:1),
// texto #44585f (7:1). O topo usa #5c6d74 — o #6b7f87 do mockup dá 4,2:1 como texto; #5c6d74 é o mínimo para 4,5:1
// também no card em destaque (fundo accent-dark/10).
// `movendo`: a mudança de coluna foi confirmada e está gravando — o card fica travado até a resposta.
const props = withDefaults(
  defineProps<{
    processo: Processo;
    // Realce temporário (chegou aqui por ?processo=<id>).
    destaque?: boolean;
    arrastavel?: boolean;
    movendo?: boolean;
  }>(),
  { destaque: false, arrastavel: false, movendo: false },
);

const emit = defineEmits<{
  abrir: [processo: Processo];
  arrastar: [event: DragEvent, processo: Processo];
  soltarArrasto: [];
}>();

const pastaPo = computed(() =>
  props.processo.numeroPo ? `${props.processo.pasta} · ${props.processo.numeroPo}` : props.processo.pasta,
);

// Pagamento ao FORNECEDOR: etiqueta só quando há valor (vazio = nenhuma etiqueta).
const etiquetaPagamento = computed<{ texto: string; classe: string } | null>(() => {
  if (props.processo.statusPagamento === "pago") return { texto: "Pago", classe: "bg-green-100 text-green-800" };
  if (props.processo.statusPagamento === "pendente") return { texto: "Pendente", classe: "bg-amber-100 text-amber-800" };
  return null;
});

const medicamento = computed(() => resumoMedicamentos(props.processo.medicamentos));
const linhasInfo = computed(() => linhasInfoKanban(props.processo));

// Ícones dos bloquinhos (traço fino, 24x24, só <path>): usuário com check, usuário, alerta, prédio, prancheta com
// check, avião.
const ICONES_INFO: Record<ChaveCelulaKanban, string[]> = {
  responsavel: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "m16 11 2 2 4-4"],
  consultor: [
    "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  ],
  pendencias: [
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  ],
  fornecedor: [
    "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z",
    "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2",
    "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2",
    "M10 6h4M10 10h4M10 14h4M10 18h4",
  ],
  despachante: [
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "m9 14 2 2 4-4",
  ],
  aereo: [
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  ],
};

function abrir(): void {
  if (props.movendo) return;
  emit("abrir", props.processo);
}

// Espaço/Enter num role="button": abre e não rola a página (o padrão do Espaço).
function onKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    abrir();
  }
}
</script>

<template>
  <article
    :id="`processo-card-${processo.id}`"
    :data-testid="`processo-card-${processo.id}`"
    data-kanban-card
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    :aria-disabled="movendo ? 'true' : undefined"
    :aria-busy="movendo ? 'true' : undefined"
    class="flex min-h-11 flex-col gap-[3px] rounded-lg border bg-paper-raised px-3 py-2.5 text-left transition-colors hover:border-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
    :class="[
      destaque ? 'border-accent-dark bg-accent-dark/10 outline-2 -outline-offset-2 outline-accent-dark' : 'border-hairline',
      movendo ? 'pointer-events-none opacity-60' : 'cursor-pointer',
      arrastavel && !movendo ? 'active:cursor-grabbing' : '',
    ]"
    :draggable="arrastavel && !movendo ? 'true' : undefined"
    @click="abrir"
    @keydown="onKeydown"
    @dragstart="emit('arrastar', $event, processo)"
    @dragend="emit('soltarArrasto')"
  >
    <span class="flex w-full items-center justify-between gap-3">
      <span :id="`card-pasta-po-${processo.id}`" class="min-w-0 truncate font-mono text-[11.5px] text-[#5c6d74]" :title="pastaPo">{{
        pastaPo
      }}</span>
      <span
        v-if="etiquetaPagamento"
        :id="`card-pagamento-${processo.id}`"
        class="shrink-0 rounded-full px-[9px] py-px text-[11.5px] leading-snug font-semibold"
        :class="etiquetaPagamento.classe"
        >{{ etiquetaPagamento.texto }}</span
      >
    </span>

    <span :id="`card-paciente-${processo.id}`" class="mt-[2px] line-clamp-2 text-[16px] leading-[1.25] font-semibold tracking-[-0.01em] break-words text-ink">{{
      processo.paciente
    }}</span>

    <span
      :id="`card-medicamento-${processo.id}`"
      class="line-clamp-2 text-[12px] leading-[1.35] font-medium tracking-[0.02em] break-words text-ink-soft uppercase"
      :title="medicamento"
      >{{ medicamento }}</span
    >

    <!-- Bloquinhos: cada linha é uma caixa com borda; as células dividem a linha (flex-auto, min-w-0) e cortam com
         "…" (texto completo no title). Não interativos: nada de botão nem parada de Tab. O rótulo de cada célula é
         só para leitor de tela (sr-only); a célula é `relative` para conter o sr-only (posição absoluta). -->
    <span v-if="linhasInfo.length" :id="`card-info-${processo.id}`" class="mt-[7px] flex w-full min-w-0 flex-col gap-1">
      <span
        v-for="linha in linhasInfo"
        :id="`card-info-${linha.chave}-${processo.id}`"
        :key="linha.chave"
        class="flex w-full min-w-0 divide-x divide-[#e0e7e5] overflow-hidden rounded-[8px] border border-[#e0e7e5] bg-[#f6f8f8]"
      >
        <span
          v-for="celula in linha.celulas"
          :id="`card-${celula.chave}-${processo.id}`"
          :key="celula.chave"
          class="relative flex min-w-0 items-center gap-1.5 px-[9px] py-1"
          :class="[
            celula.estreita ? 'flex-none' : 'flex-auto',
            celula.prioritaria ? 'max-w-[45%] shrink-0' : '',
            celula.perigo ? 'text-danger' : 'text-[#44585f]',
          ]"
          :title="celula.titulo"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0"
            :class="celula.perigo ? undefined : 'text-[#6b7f87]'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path v-for="(d, i) in ICONES_INFO[celula.chave]" :key="i" :d="d" />
          </svg>
          <span class="sr-only">{{ celula.rotulo }}: </span>
          <!-- Na célula aérea, só a cia corta com "…": a AWB fica inteira (só corta se sozinha passar da célula). -->
          <span
            class="flex min-h-4 min-w-0 items-baseline overflow-hidden text-[12px] leading-4"
            :class="celula.perigo ? 'font-semibold' : 'font-medium'"
          >
            <span v-if="celula.texto" class="min-w-0 truncate">{{ celula.texto }}</span>
            <span v-if="celula.texto && celula.awb" class="shrink-0 whitespace-pre"> · </span>
            <span v-if="celula.awb" class="max-w-full shrink-0 truncate font-mono text-[11.5px] leading-4 font-normal">{{ celula.awb }}</span>
          </span>
        </span>
      </span>
    </span>
    <span v-if="movendo" :id="`card-movendo-${processo.id}`" class="text-[11.5px] font-semibold text-accent-dark">Movendo…</span>
  </article>
</template>
