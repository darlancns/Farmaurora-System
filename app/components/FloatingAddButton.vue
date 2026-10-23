<script setup lang="ts">
// Botão flutuante "+" compartilhado (Processos e Recados), só abaixo de lg: canto
// inferior direito, acima do BottomNav (+ safe-area). Em lg+ some (`lg:hidden`) e
// cada página volta ao botão com texto de sempre. z-30 fica abaixo do BottomNav
// (z-40), do menu da conta (z-60) e do overlay dos modais (z-900).
defineProps<{
  id: string;
  label: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    :id="id"
    type="button"
    :title="label"
    :aria-label="label"
    class="fixed right-4 bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom,0px)_+_1rem)] z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dark text-white shadow-lg transition-colors hover:opacity-90 lg:hidden"
    @click="emit('click')"
  >
    <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  </button>
</template>
