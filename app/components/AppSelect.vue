<script setup lang="ts" generic="T extends string">
import { ref, computed, nextTick, onBeforeUnmount, watch } from "vue";
import type { AppSelectOption } from "../types/appSelect";

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: AppSelectOption<T>[];
    id?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    id: undefined,
    placeholder: "Selecione",
    disabled: false,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();

const open = ref(false);
const highlightedIndex = ref(-1);
const rootRef = ref<HTMLDivElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);
const optionRefs = ref<(HTMLLIElement | null)[]>([]);

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue));
const listboxId = computed(() => `${props.id ?? "app-select"}-listbox`);

function optionId(index: number): string {
  return `${listboxId.value}-option-${index}`;
}

function scrollHighlightedIntoView(): void {
  nextTick(() => {
    optionRefs.value[highlightedIndex.value]?.scrollIntoView({ block: "nearest" });
  });
}

function openList(): void {
  if (props.disabled || !props.options.length) return;
  optionRefs.value = [];
  const currentIndex = props.options.findIndex((option) => option.value === props.modelValue);
  highlightedIndex.value = currentIndex >= 0 ? currentIndex : 0;
  open.value = true;
  scrollHighlightedIntoView();
}

function closeList(focusButton = false): void {
  open.value = false;
  highlightedIndex.value = -1;
  if (focusButton) buttonRef.value?.focus();
}

function toggleList(): void {
  if (open.value) {
    closeList();
  } else {
    openList();
  }
}

function selectOption(index: number): void {
  const option = props.options[index];
  if (!option) return;
  emit("update:modelValue", option.value);
  closeList(true);
}

function moveHighlight(delta: number): void {
  if (!props.options.length) return;
  highlightedIndex.value = Math.min(Math.max(highlightedIndex.value + delta, 0), props.options.length - 1);
  scrollHighlightedIntoView();
}

function onButtonKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (!open.value) openList();
      else moveHighlight(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      if (!open.value) openList();
      else moveHighlight(-1);
      break;
    case "Home":
      if (open.value) {
        event.preventDefault();
        highlightedIndex.value = 0;
        scrollHighlightedIntoView();
      }
      break;
    case "End":
      if (open.value) {
        event.preventDefault();
        highlightedIndex.value = props.options.length - 1;
        scrollHighlightedIntoView();
      }
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      if (open.value) {
        selectOption(highlightedIndex.value);
      } else {
        openList();
      }
      break;
    case "Escape":
      if (open.value) {
        event.preventDefault();
        closeList(true);
      }
      break;
    case "Tab":
      closeList();
      break;
  }
}

function onClickOutside(event: MouseEvent): void {
  if (!rootRef.value?.contains(event.target as Node)) {
    closeList();
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("mousedown", onClickOutside);
  } else {
    document.removeEventListener("mousedown", onClickOutside);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onClickOutside);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      :id="id"
      ref="buttonRef"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined"
      :disabled="disabled"
      class="flex w-full items-center justify-between gap-2 rounded-md border border-hairline bg-paper px-2.5 py-2 text-left text-[13.5px] transition-colors focus:bg-white focus:outline-2 focus:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
      @click="toggleList"
      @keydown="onButtonKeydown"
    >
      <span class="truncate" :class="selectedOption ? 'text-ink' : 'text-ink-soft'">
        {{ selectedOption ? selectedOption.label : placeholder }}
      </span>
      <svg
        viewBox="0 0 20 20"
        class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
        :class="{ 'rotate-180': open }"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 7.5l5 5 5-5" />
      </svg>
    </button>

    <ul
      v-if="open"
      :id="listboxId"
      role="listbox"
      class="absolute z-50 mt-1 w-max min-w-full max-w-[min(20rem,90vw)] max-h-56 overflow-y-auto rounded-md border border-hairline bg-paper-raised py-1 text-[13.5px] shadow-lg"
    >
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.value"
        :ref="(el) => (optionRefs[index] = el as HTMLLIElement | null)"
        role="option"
        :aria-selected="option.value === modelValue"
        class="cursor-pointer px-2.5 py-2 whitespace-nowrap transition-colors"
        :class="[
          index === highlightedIndex ? 'bg-paper text-accent-dark' : 'text-ink',
          option.value === modelValue ? 'font-semibold' : '',
        ]"
        @mousedown.prevent="selectOption(index)"
        @mouseenter="highlightedIndex = index"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>
