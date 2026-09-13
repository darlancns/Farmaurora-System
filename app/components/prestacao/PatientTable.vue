<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { PatientComputed } from "#shared/types/Patient";
import PatientRow from "./PatientRow.vue";

const props = withDefaults(
  defineProps<{
    patients: PatientComputed[];
    searchQuery?: string;
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

const VISIBLE_CARDS = 4;
const GAP_PX = 8;
const FALLBACK_MAX_HEIGHT_PX = 560;

const listRef = ref<HTMLElement | null>(null);
const cardHeightPx = ref<number | null>(null);
let resizeObserver: ResizeObserver | null = null;

const listMaxHeightPx = computed(() =>
  cardHeightPx.value !== null
    ? cardHeightPx.value * VISIBLE_CARDS + GAP_PX * (VISIBLE_CARDS - 1)
    : FALLBACK_MAX_HEIGHT_PX
);

function measureCardHeight(): void {
  const firstCard = listRef.value?.firstElementChild as HTMLElement | null;
  if (firstCard) {
    cardHeightPx.value = firstCard.getBoundingClientRect().height;
  }
}

function attachObserver(): void {
  const firstCard = listRef.value?.firstElementChild as HTMLElement | null;
  resizeObserver?.disconnect();
  if (!firstCard) return;

  measureCardHeight();
  resizeObserver ??= new ResizeObserver(measureCardHeight);
  resizeObserver.observe(firstCard);
}

onMounted(attachObserver);
onBeforeUnmount(() => resizeObserver?.disconnect());

watch(
  () => props.patients,
  async () => {
    await nextTick();
    attachObserver();
  }
);
</script>

<template>
  <div id="patient-table-wrap" class="flex flex-col gap-2">
    <div
      v-if="patients.length === 0"
      class="rounded-[10px] border border-hairline bg-paper-raised p-10 text-center text-[13.5px] text-ink-soft"
    >
      <template v-if="searchQuery?.trim()">
        Nenhum lançamento encontrado para "{{ searchQuery.trim() }}".
      </template>
      <template v-else> Nenhum lançamento ainda. Preencha o formulário ao lado para começar. </template>
    </div>

    <div
      v-else
      id="patient-table-scroll"
      ref="listRef"
      class="flex flex-col gap-2 overflow-y-auto pr-1"
      :style="{ maxHeight: `${listMaxHeightPx}px` }"
    >
      <PatientRow
        v-for="patient in patients"
        :key="patient.id"
        :patient="patient"
        :readonly="readonly"
        @delete="emit('delete', $event)"
        @edit="emit('edit', $event)"
        @generate-word="emit('generate-word', $event)"
        @copy-whatsapp="emit('copy-whatsapp', $event)"
      />
    </div>
  </div>
</template>
