<script setup lang="ts">
import { computed } from "vue";
import type { Processo } from "#shared/types/processo";
import { resumoMedicamentos } from "../../utils/processoFormatters";

// Card de um processo no Kanban do Follow-Up. O <article> INTEIRO é o controle que abre o painel: role="button",
// tabindex="0", Enter/Espaço abrem, foco visível — e NENHUM <button> dentro dele (a etiqueta de pagamento é só um
// span). O arrastar também é no próprio <article> (draggable), o que evita o problema do Firefox de não iniciar o
// arrasto a partir de um <button> dentro de um elemento arrastável.
//
// Mudar de coluna: arrastar (mouse/caneta, com confirmação) ou o menu "Mover para…" do CABEÇALHO DO PAINEL — o
// único caminho em toque e por teclado (Enter/Espaço no card abre o painel; Tab chega ao "Mover para…").
//
// Linhas: (1) Pasta · PO e, à direita, Pago/Pendente (só com valor); (2) paciente (até 2 linhas); (3) medicamento
// (até 2 linhas); (4) consultor e, à direita, o alerta de pendências com a quantidade.
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
const qtdPendencias = computed(() => props.processo.pendencias.length);

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
    class="flex min-h-11 flex-col gap-1 rounded-lg border bg-paper-raised px-3 py-2.5 text-left transition-colors hover:border-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
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
      <span :id="`card-pasta-po-${processo.id}`" class="min-w-0 truncate font-mono text-[11.5px] text-ink-soft" :title="pastaPo">{{
        pastaPo
      }}</span>
      <span
        v-if="etiquetaPagamento"
        :id="`card-pagamento-${processo.id}`"
        class="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] leading-none font-semibold"
        :class="etiquetaPagamento.classe"
        >{{ etiquetaPagamento.texto }}</span
      >
    </span>

    <span :id="`card-paciente-${processo.id}`" class="line-clamp-2 text-[13.5px] leading-snug font-medium break-words text-ink">{{
      processo.paciente
    }}</span>

    <span
      :id="`card-medicamento-${processo.id}`"
      class="line-clamp-2 text-[12px] leading-snug break-words text-ink-soft"
      :title="medicamento"
      >{{ medicamento }}</span
    >

    <span class="flex w-full items-center justify-between gap-2 text-[12px] text-ink-soft">
      <span :id="`card-consultor-${processo.id}`" class="flex min-w-0 items-center gap-1.5">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
          />
        </svg>
        <span class="truncate">{{ processo.consultor }}</span>
      </span>
      <span
        v-if="qtdPendencias > 0"
        :id="`card-pendencias-${processo.id}`"
        class="flex shrink-0 items-center gap-1 font-semibold text-danger"
        :title="`${qtdPendencias} ${qtdPendencias === 1 ? 'pendência' : 'pendências'}`"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <span>{{ qtdPendencias }}</span>
        <span class="sr-only">{{ qtdPendencias === 1 ? " pendência" : " pendências" }}</span>
      </span>
    </span>
    <span v-if="movendo" :id="`card-movendo-${processo.id}`" class="text-[11.5px] font-semibold text-accent-dark">Movendo…</span>
  </article>
</template>
