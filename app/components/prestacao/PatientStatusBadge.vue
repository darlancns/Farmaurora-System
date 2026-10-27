<script setup lang="ts">
import { computed } from "vue";
import type { PatientStatus } from "#shared/types/Patient";
import { PATIENT_STATUS_LABEL, proximoPatientStatus } from "#shared/constants/prestacaoStatus";

// Selo (pílula) do status da prestação. Com `interactive` vira um botão que pede a troca
// (em_andamento ↔ concluida) — a página decide se grava; sem ele é só uma marca, sem ação.
const props = withDefaults(
  defineProps<{
    status: PatientStatus;
    /** Quem pode escrever em Prestação (mesma regra dos botões editar/excluir). */
    interactive?: boolean;
    /** Troca em andamento: o botão fica travado até o servidor responder. */
    pending?: boolean;
  }>(),
  { interactive: false, pending: false },
);

const emit = defineEmits<{
  toggle: [];
}>();

// Largura fixa (os dois rótulos ocupam o mesmo espaço): as colunas de valores do card largo ficam alinhadas
// entre os cards. Abaixo de md o botão ganha uma área de toque de 44px sem aumentar o selo (pseudo-elemento).
const concluida = computed(() => props.status === "concluida");
const label = computed(() => PATIENT_STATUS_LABEL[props.status]);
const ariaLabel = computed(
  () => `Status: ${label.value}. Alterar para ${PATIENT_STATUS_LABEL[proximoPatientStatus(props.status)]}`
);
const colorClass = computed(() => (concluida.value ? "bg-green-100 text-green-800" : "bg-farm-blue-soft text-farm-blue"));

function handleClick(): void {
  if (props.pending) return;
  emit("toggle");
}
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    :aria-label="ariaLabel"
    :aria-busy="pending"
    :disabled="pending"
    class="inline-flex w-[8.25rem] items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:opacity-60 max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-[7px]"
    :class="colorClass"
    @click="handleClick"
  >
    <svg v-if="concluida" viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
    <svg v-else viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
    {{ label }}
  </button>
  <span
    v-else
    class="inline-flex w-[8.25rem] items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap"
    :class="colorClass"
  >
    <svg v-if="concluida" viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
    <svg v-else viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
    {{ label }}
  </span>
</template>
