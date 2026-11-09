<script setup lang="ts">
// Checkbox CONTROLADO da DIR (usado na lista, no cartão, no checklist e na seção "Situação"):
// quem manda no valor é a prop. Ao clicar, só avisa (`toggle`); o checkbox volta ao valor da
// prop na hora e só muda de fato quando o pai atualiza o registro — assim, se o PATCH falhar,
// a tela continua mostrando o que está gravado.
const props = withDefaults(
  defineProps<{
    id: string;
    modelValue: boolean;
    label: string;
    // Mostra o rótulo ao lado (checklist/modal). Sem ele, só a caixa (rótulo vai no aria-label).
    mostrarRotulo?: boolean;
    // Desabilitado: não clica, não foca e fica esmaecido (quem usa explica o motivo por perto).
    desabilitado?: boolean;
  }>(),
  { mostrarRotulo: false, desabilitado: false },
);

const emit = defineEmits<{ toggle: [] }>();

function onChange(event: Event): void {
  emit("toggle");
  (event.target as HTMLInputElement).checked = props.modelValue;
}
</script>

<template>
  <label
    class="inline-flex min-h-11 min-w-11 items-center gap-2 lg:min-h-0 lg:min-w-0"
    :class="[mostrarRotulo ? 'justify-start' : 'justify-center', desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer']"
    @click.stop
  >
    <input
      :id="id"
      type="checkbox"
      :checked="modelValue"
      :disabled="desabilitado"
      :aria-label="mostrarRotulo ? undefined : label"
      class="h-[18px] w-[18px] shrink-0 accent-accent-dark"
      :class="desabilitado ? 'cursor-not-allowed' : 'cursor-pointer'"
      @change="onChange"
    />
    <span v-if="mostrarRotulo" class="text-[14px] text-ink lg:text-[13px]">{{ label }}</span>
  </label>
</template>
