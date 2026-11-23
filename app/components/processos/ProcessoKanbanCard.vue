<script setup lang="ts">
import { computed } from "vue";
import type { Processo } from "#shared/types/processo";
import { rotuloPastaPo } from "#shared/utils/rotuloPasta";
import { resumoMedicamentos } from "../../utils/processoFormatters";
import { ICONES_CARD, ICONES_ESTADO, type ChaveIconeCard } from "../../utils/processoIcones";
import { linhasInfoKanban, type CelulaInfoKanban } from "../../utils/processoKanbanInfo";
import { etiquetaPagamentoDe } from "../../utils/processoPagamento";

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
// [Fornecedor][Despachante] e [Cia. aérea · AWB | previsão de entrega] (em Entregue, a DATA DE ENTREGA no lugar da previsão
// e, com valor, uma linha a mais com os controles: [AJC pendente | Pegar DIR e Protocolo]). Só a ALTURA do card cresce: os bloquinhos cabem na largura dele.
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

// "Pasta · PO", só um dos dois, ou "" (a linha continua existindo, com a mesma altura: ver min-h-lh no template).
const pastaPo = computed(() => rotuloPastaPo(props.processo.pasta, props.processo.numeroPo));

// Pagamento ao FORNECEDOR: etiqueta só quando há valor (vazio = nenhuma etiqueta).
const etiquetaPagamento = computed(() => etiquetaPagamentoDe(props.processo.statusPagamento));

const medicamento = computed(() => resumoMedicamentos(props.processo.medicamentos));
const linhasInfo = computed(() => linhasInfoKanban(props.processo));

// Ícone da célula: o de estado (relógio/check) nos controles do Entregue; nos demais, o do registro do card. As células da data
// (fixas) não têm ícone.
function caminhosIcone(celula: CelulaInfoKanban): string[] {
  if (celula.estado) return ICONES_ESTADO[celula.estado];
  return ICONES_CARD[celula.chave as ChaveIconeCard] ?? [];
}

// Cor do controle do Entregue: pendente = âmbar (#7a5a12), concluído = verde (#1d6234). O estado também vai pelo ícone e pelo texto.
const COR_ESTADO = { pendente: "text-[#7a5a12]", concluido: "text-[#1d6234]" } as const;

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
      <!-- min-h-lh: sem pasta e sem PO o texto fica vazio, mas a linha mantém a altura de uma linha de texto (o nome do
           paciente não sobe e a etiqueta Pago/Pendente fica no mesmo lugar). -->
      <span
        :id="`card-pasta-po-${processo.id}`"
        class="min-h-lh min-w-0 truncate font-mono text-[11.5px] text-[#5c6d74]"
        :title="pastaPo || undefined"
        >{{ pastaPo }}</span
      >
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
            celula.estreita || celula.fixa ? 'flex-none' : 'flex-auto',
            celula.prioritaria ? 'max-w-[45%] shrink-0' : '',
            celula.estado ? COR_ESTADO[celula.estado] : celula.perigo ? 'text-danger' : 'text-[#44585f]',
          ]"
          :title="celula.titulo"
        >
          <svg
            v-if="!celula.fixa"
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0"
            :class="celula.perigo || celula.estado ? undefined : 'text-[#6b7f87]'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path v-for="(d, i) in caminhosIcone(celula)" :key="i" :d="d" />
          </svg>
          <span class="sr-only">{{ celula.rotulo }}: </span>
          <!-- A célula da previsão ou da data de entrega (fixa) é sempre "DD/MM", sem ícone, e nunca encolhe nem corta: quem corta é a Cia · AWB. -->
          <!-- Na célula aérea, só a cia corta com "…": a AWB fica inteira (só corta se sozinha passar da célula). -->
          <span
            class="flex min-h-4 min-w-0 items-baseline overflow-hidden text-[12px] leading-4"
            :class="[celula.perigo ? 'font-semibold' : 'font-medium', celula.fixa ? 'whitespace-nowrap tabular-nums' : '']"
          >
            <span v-if="celula.texto" :class="celula.fixa ? undefined : 'min-w-0 truncate'">{{ celula.texto }}</span>
            <span v-if="celula.texto && celula.awb" class="shrink-0 whitespace-pre"> · </span>
            <span v-if="celula.awb" class="max-w-full shrink-0 truncate font-mono text-[11.5px] leading-4 font-normal">{{ celula.awb }}</span>
          </span>
        </span>
      </span>
    </span>
    <span v-if="movendo" :id="`card-movendo-${processo.id}`" class="text-[11.5px] font-semibold text-accent-dark">Movendo…</span>
  </article>
</template>
