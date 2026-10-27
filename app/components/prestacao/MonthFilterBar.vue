<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { PatientComputed } from "#shared/types/Patient";
import { monthKeyLabel, monthShortLabel, splitMonthPills, type MonthGroup } from "../../utils/monthGroups";
import { LINHA_BUSCA_ALTURA_CLASS, LINHA_BUSCA_QUADRADO_CLASS } from "../../utils/prestacaoLinhaBusca";

const props = defineProps<{
  months: Array<MonthGroup<PatientComputed>>;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

// Chips: só o mês corrente e o anterior (Brasília), mesmo sem prestações; os demais meses ficam no "Mais meses".
const monthSplit = computed(() => splitMonthPills(props.months));
const visibleMonths = computed(() => monthSplit.value.pills);
const overflowMonths = computed(() => monthSplit.value.overflow);

const isOverflowSelected = computed(() =>
  overflowMonths.value.some((group) => group.key === props.modelValue)
);

const dropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

function selectMonth(key: string | null): void {
  emit("update:modelValue", key);
  dropdownOpen.value = false;
}

function toggleDropdown(): void {
  dropdownOpen.value = !dropdownOpen.value;
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (dropdownRef.value?.contains(target) || triggerRef.value?.contains(target)) return;
  dropdownOpen.value = false;
}

onMounted(() => document.addEventListener("mousedown", handleDocumentClick));
onBeforeUnmount(() => document.removeEventListener("mousedown", handleDocumentClick));
</script>

<template>
  <!-- Abaixo de lg os chips (e o "Mais meses") somem: o mês vira um seletor no painel de filtros da
       página (ícone dentro da busca). Em lg+ a barra fica na MESMA linha da busca (entre a busca e o botão
       "+ Nova prestação"), sem margem própria: o espaçamento é do contêiner da página. -->
  <div id="month-filter-bar" class="relative hidden shrink-0 flex-wrap items-center gap-2 lg:flex">
    <button
      id="month-filter-all"
      type="button"
      class="rounded-md border px-3 text-[13.5px] font-semibold transition-colors"
      :class="[
        LINHA_BUSCA_ALTURA_CLASS,
        modelValue === null
          ? 'border-transparent bg-accent-dark text-white'
          : 'border-hairline bg-paper text-ink-soft hover:border-accent-dark hover:text-accent-dark',
      ]"
      @click="selectMonth(null)"
    >
      Todos
    </button>

    <button
      v-for="group in visibleMonths"
      :id="`month-filter-${group.key}`"
      :key="group.key"
      type="button"
      class="rounded-md border px-3 text-[13.5px] font-semibold transition-colors"
      :class="[
        LINHA_BUSCA_ALTURA_CLASS,
        modelValue === group.key
          ? 'border-transparent bg-accent-dark text-white'
          : 'border-hairline bg-paper text-ink-soft hover:border-accent-dark hover:text-accent-dark',
      ]"
      @click="selectMonth(group.key)"
    >
      {{ monthShortLabel(group) }} ({{ group.patients.length }})
    </button>

    <button
      v-if="overflowMonths.length > 0"
      id="month-filter-more-toggle"
      ref="triggerRef"
      type="button"
      title="Mais meses"
      aria-label="Mais meses"
      class="flex items-center justify-center rounded-md border transition-colors"
      :class="[
        LINHA_BUSCA_QUADRADO_CLASS,
        isOverflowSelected
          ? 'border-transparent bg-accent-dark text-white'
          : 'border-hairline bg-paper text-ink-soft hover:border-accent-dark hover:text-accent-dark',
      ]"
      @click="toggleDropdown"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <div
      v-if="dropdownOpen"
      id="month-filter-dropdown"
      ref="dropdownRef"
      class="absolute top-full right-0 z-10 mt-1.5 w-56 rounded-md border border-hairline bg-paper-raised py-1.5 shadow-lg"
    >
      <button
        v-for="group in overflowMonths"
        :id="`month-filter-dropdown-${group.key}`"
        :key="group.key"
        type="button"
        class="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] transition-colors"
        :class="modelValue === group.key ? 'font-semibold text-accent-dark' : 'text-ink-soft hover:text-accent-dark'"
        @click="selectMonth(group.key)"
      >
        <span>{{ monthKeyLabel(group) }}</span>
        <span>({{ group.patients.length }})</span>
      </button>
    </div>
  </div>
</template>
