<script setup lang="ts" generic="T extends string">
import { computed, nextTick, ref } from "vue";
import type { AppSelectOption } from "../types/appSelect";

// Escolha única entre poucas opções (2–3), sempre visíveis: radiogroup com tabindex
// rotativo (só o marcado entra no Tab; setas/Home/End movem e marcam). Abaixo de lg
// cada opção tem 44px e fonte de 16px (sem zoom no iOS); em lg+ volta à altura dos
// campos (~38px). O contorno é um ring inset, que não soma altura.
const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: AppSelectOption<T>[];
    id: string;
    label: string;
    disabled?: boolean;
    // Quantas colunas a grade tem. Sem ela, 2 (o de sempre). Com 3 opções (ex.: as abas da página Compras), passe 3.
    colunas?: number;
  }>(),
  { disabled: false, colunas: undefined }
);

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();

const radioRefs = ref<(HTMLButtonElement | null)[]>([]);

// Sem nenhuma opção escolhida (valor vazio), a 1ª entra no Tab: o grupo continua alcançável pelo teclado.
const temEscolhido = computed(() => props.options.some((option) => option.value === props.modelValue));

function selecionar(index: number, focar: boolean): void {
  const option = props.options[index];
  if (!option || props.disabled) return;
  emit("update:modelValue", option.value);
  if (focar) nextTick(() => radioRefs.value[index]?.focus());
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const total = props.options.length;
  let destino: number;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      destino = (index + 1) % total;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      destino = (index - 1 + total) % total;
      break;
    case "Home":
      destino = 0;
      break;
    case "End":
      destino = total - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  selecionar(destino, true);
}
</script>

<template>
  <div
    :id="id"
    role="radiogroup"
    :aria-label="label"
    :aria-disabled="disabled ? 'true' : undefined"
    class="grid w-full gap-0.5 rounded-md bg-paper p-0 ring-1 ring-hairline ring-inset"
    :class="colunas === undefined ? 'grid-cols-2' : undefined"
    :style="colunas === undefined ? undefined : { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }"
  >
    <button
      v-for="(option, index) in options"
      :id="`${id}-${option.value}`"
      :key="option.value"
      :ref="(el) => (radioRefs[index] = el as HTMLButtonElement | null)"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :tabindex="option.value === modelValue || (!temEscolhido && index === 0) ? 0 : -1"
      :disabled="disabled"
      class="min-h-11 rounded-md px-3 text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-[38px] lg:text-[13.5px]"
      :class="
        option.value === modelValue
          ? 'bg-accent-dark text-white'
          : 'text-ink-soft hover:text-ink'
      "
      @click="selecionar(index, false)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
