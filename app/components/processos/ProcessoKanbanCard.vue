<script setup lang="ts">
import { computed } from "vue";
import type { Processo } from "#shared/types/processo";
import { resumoMedicamentos } from "../../utils/processoFormatters";

// Card de um processo no Kanban do Follow-Up. <article> com UM <button> (abre o painel); a etiqueta de pagamento é
// só indicador (span), nada de botão dentro de botão. Linhas: (1) Pasta · PO e, à direita, Pago/Pendente (só com
// valor); (2) paciente; (3) medicamento; (4) consultor e, à direita, o alerta de pendências com a quantidade.
const props = withDefaults(
  defineProps<{
    processo: Processo;
    // Realce temporário (chegou aqui por ?processo=<id>).
    destaque?: boolean;
  }>(),
  { destaque: false },
);

const emit = defineEmits<{
  abrir: [processo: Processo];
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
</script>

<template>
  <article
    :id="`processo-card-${processo.id}`"
    :data-testid="`processo-card-${processo.id}`"
    class="rounded-lg border bg-paper-raised transition-colors hover:border-accent-dark"
    :class="destaque ? 'border-accent-dark bg-accent-dark/10 outline-2 -outline-offset-2 outline-accent-dark' : 'border-hairline'"
  >
    <button
      :id="`btn-abrir-processo-${processo.id}`"
      type="button"
      class="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
      :aria-label="`Abrir processo de ${processo.paciente}`"
      @click="emit('abrir', processo)"
    >
      <span class="flex w-full items-center justify-between gap-2">
        <span
          :id="`card-pasta-po-${processo.id}`"
          class="min-w-0 truncate font-mono text-[11.5px] text-ink-soft"
          :title="pastaPo"
          >{{ pastaPo }}</span
        >
        <span
          v-if="etiquetaPagamento"
          :id="`card-pagamento-${processo.id}`"
          class="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] leading-none font-semibold"
          :class="etiquetaPagamento.classe"
          >{{ etiquetaPagamento.texto }}</span
        >
      </span>

      <span
        :id="`card-paciente-${processo.id}`"
        class="line-clamp-2 text-[13.5px] leading-snug font-medium break-words text-ink"
        >{{ processo.paciente }}</span
      >

      <span :id="`card-medicamento-${processo.id}`" class="block truncate text-[12px] text-ink-soft" :title="medicamento">{{
        medicamento
      }}</span>

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
    </button>
  </article>
</template>
