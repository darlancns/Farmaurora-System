<script setup lang="ts">
// Chave "Ativo" de uma linha dos Cadastros: botão role="switch" (aria-checked), aplicado na hora pelo pai. O clique NÃO
// sobe para a linha (clicar na linha abre o painel de edição; clicar na chave só liga/desliga). Alvo de toque de 44px
// abaixo de lg (o desenho da chave em si fica menor, centralizado).

defineProps<{
  /** Estado atual (ligado = ativo). */
  modelValue: boolean;
  /** aria-label com o nome do item, ex.: "Ativo: Poros". */
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  /** O novo valor pedido (o oposto do atual). O pai grava e decide o que mostrar. */
  alternar: [valor: boolean];
}>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-60 lg:h-8"
    @click.stop="emit('alternar', !modelValue)"
  >
    <span
      aria-hidden="true"
      class="relative inline-block h-5 w-9 rounded-full transition-colors"
      :class="modelValue ? 'bg-accent-dark' : 'bg-ink-soft/40'"
    >
      <span
        class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
        :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
      />
    </span>
  </button>
</template>
