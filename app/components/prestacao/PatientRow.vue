<script setup lang="ts">
import { ref, computed } from "vue";
import type { PatientComputed } from "#shared/types/Patient";
import { formatCurrency } from "../../utils/formatters";
import ConfirmDialog from "../ConfirmDialog.vue";

const props = withDefaults(
  defineProps<{
    patient: PatientComputed;
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  delete: [id: string];
  edit: [patient: PatientComputed];
  "generate-word": [patient: PatientComputed];
  "copy-whatsapp": [patient: PatientComputed];
}>();

const generating = ref(false);
const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(
  () => `Excluir o lançamento de ${props.patient.paciente}? Essa ação não pode ser desfeita.`
);

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  emit("delete", props.patient.id);
}
const isFarmaurora = computed(() => props.patient.empresa === "FARMAURORA");
const stripeClass = computed(() => (isFarmaurora.value ? "bg-farm-blue" : "bg-mainz-gold"));
const badgeLabel = computed(() => props.patient.consultor ?? "");
const hasDespesaOuTransporte = computed(
  () => props.patient.despesaTotal > 0 || props.patient.transporteTotal > 0
);

// "PREJUÍZO" é só rótulo de tela: o cálculo em calculations.ts continua produzindo
// o valor numérico real (inclusive negativo) e o .docx segue usando esse número.
// Aqui, quando a nota não é cheia e o valor apurado ficou negativo (custo + despesa
// + transporte maior que o alvará), a tela mostra "PREJUÍZO" no lugar do valor.
const notaEhPrejuizo = computed(
  () => !props.patient.isNotaCheia && props.patient.valorNota < 0
);
const impostoEhPrejuizo = computed(() => props.patient.imposto < 0);
const notaDisplay = computed(() => {
  if (props.patient.isNotaCheia) return "CHEIA";
  if (notaEhPrejuizo.value) return "PREJUÍZO";
  return `R$${formatCurrency(props.patient.valorNota)}`;
});
const impostoDisplay = computed(() =>
  impostoEhPrejuizo.value ? "PREJUÍZO" : `R$${formatCurrency(props.patient.imposto)}`
);
// Largura mínima do container pra cada célula caber "Label R$valor" numa linha só,
// sem truncar. Maior com despesa/transporte porque a grade passa de 4 pra 6 colunas.
// As duas strings completas precisam existir literalmente aqui pro Tailwind gerar o CSS.
const cellRowClass = computed(() =>
  hasDespesaOuTransporte.value
    ? "@[1080px]:flex-row @[1080px]:items-baseline @[1080px]:gap-1"
    : "@[620px]:flex-row @[620px]:items-baseline @[620px]:gap-1"
);

async function handleGenerateWord(): Promise<void> {
  generating.value = true;
  try {
    emit("generate-word", props.patient);
  } finally {
    setTimeout(() => {
      generating.value = false;
    }, 600);
  }
}
</script>

<template>
  <div :id="`patient-row-${patient.id}`" class="relative shrink-0 overflow-hidden rounded-lg border border-hairline bg-paper-raised">
    <div class="absolute inset-y-0 left-0 w-1" :class="stripeClass" />

    <div class="flex flex-col gap-1.5 py-2.5 pr-3.5 pl-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[12px] text-ink-soft">{{ patient.data }}</span>
          <span class="text-[13px] text-ink-soft">{{ badgeLabel }}</span>
        </div>

        <div class="flex shrink-0 gap-1.5">
          <button
            :id="`btn-generate-word-${patient.id}`"
            type="button"
            title="Gerar Word"
            aria-label="Gerar Word"
            :disabled="generating"
            class="flex h-[33px] w-[33px] items-center justify-center rounded-md bg-[#2B579A] text-white transition-opacity hover:opacity-90 disabled:opacity-55"
            @click="handleGenerateWord"
          >
            <svg viewBox="0 0 384 512" class="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
              <path d="M369.9 97.9L286 14C277 5 264.8-.1 252.1-.1H48C21.5 0 0 21.5 0 48v416c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V131.9c0-12.7-5.1-25-14.1-34zM332.1 128H256V51.9l76.1 76.1zM48 464V48h160v104c0 13.3 10.7 24 24 24h104v288H48z" />
            </svg>
          </button>
          <button
            :id="`btn-copy-whatsapp-${patient.id}`"
            type="button"
            title="Copiar mensagem do WhatsApp"
            aria-label="Copiar mensagem do WhatsApp"
            class="flex h-[33px] w-[33px] items-center justify-center rounded-md bg-[#25D366] text-white transition-opacity hover:opacity-90"
            @click="emit('copy-whatsapp', patient)"
          >
            <svg viewBox="0 0 448 512" class="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
            </svg>
          </button>
          <button
            v-if="!readonly"
            :id="`btn-edit-patient-${patient.id}`"
            type="button"
            title="Editar"
            aria-label="Editar"
            class="flex h-[33px] w-[33px] items-center justify-center rounded-md border border-hairline bg-paper text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
            @click="emit('edit', patient)"
          >
            <svg viewBox="0 0 24 24" class="h-[15px] w-[15px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
            </svg>
          </button>
          <button
            v-if="!readonly"
            :id="`btn-delete-patient-${patient.id}`"
            type="button"
            title="Excluir"
            aria-label="Excluir"
            class="flex h-[33px] w-[33px] items-center justify-center rounded-md border border-hairline bg-paper text-ink-soft transition-colors hover:border-danger hover:text-danger"
            @click="showDeleteConfirm = true"
          >
            <svg viewBox="0 0 24 24" class="h-[15px] w-[15px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      <div>
        <span class="block text-[15px] font-medium text-ink">{{ patient.paciente }}</span>
        <span class="block text-[13px] text-ink-soft">{{ patient.descricaoResumo }}</span>
      </div>

      <div class="@container border-t border-hairline pt-2 text-[12.5px]">
        <div
          class="grid items-start gap-x-2.5 gap-y-1"
          :class="
            hasDespesaOuTransporte
              ? 'grid-flow-col grid-rows-2 grid-cols-3 @[520px]:grid-flow-row @[520px]:grid-rows-none @[520px]:grid-cols-6'
              : 'grid-cols-4'
          "
        >
          <div :class="['flex flex-col gap-0.5', cellRowClass]">
            <span class="min-w-0 truncate text-ink-soft">Alvará</span>
            <span class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)] text-ink">R${{ formatCurrency(patient.alvara) }}</span>
          </div>
          <div :class="['flex flex-col gap-0.5', cellRowClass]">
            <span class="min-w-0 truncate text-ink-soft">Custo</span>
            <span class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)] text-ink">R${{ formatCurrency(patient.custoImportacao) }}</span>
          </div>
          <template v-if="hasDespesaOuTransporte">
            <div :class="['flex flex-col gap-0.5', cellRowClass]">
              <span class="min-w-0 truncate text-ink-soft">Despachante</span>
              <span class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)] text-ink">R${{ formatCurrency(patient.despesaTotal) }}</span>
            </div>
            <div :class="['flex flex-col gap-0.5', cellRowClass]">
              <span class="min-w-0 truncate text-ink-soft">Transporte</span>
              <span class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)] text-ink">R${{ formatCurrency(patient.transporteTotal) }}</span>
            </div>
          </template>
          <div :class="['flex flex-col gap-0.5', cellRowClass]">
            <span class="min-w-0 truncate text-ink-soft">Nota</span>
            <span
              class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)]"
              :class="notaEhPrejuizo ? 'font-semibold text-danger' : 'text-ink'"
            >{{ notaDisplay }}</span>
          </div>
          <div :class="['flex flex-col gap-0.5', cellRowClass]">
            <span class="min-w-0 truncate text-ink-soft">Imposto</span>
            <span
              class="min-w-0 truncate font-mono text-[clamp(11px,1.1vw,13px)]"
              :class="impostoEhPrejuizo ? 'font-semibold text-danger' : 'text-ink'"
            >{{ impostoDisplay }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="showDeleteConfirm"
    title="Excluir lançamento"
    :message="deleteConfirmMessage"
    confirm-label="Sim, excluir"
    cancel-label="Cancelar"
    danger
    @confirm="confirmDelete"
    @close="showDeleteConfirm = false"
  />
</template>
