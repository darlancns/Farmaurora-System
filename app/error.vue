<script setup lang="ts">
import { computed } from "vue";
import { clearError } from "#app";

const props = defineProps<{
  error: { statusCode: number; statusMessage?: string; message?: string };
}>();

const description = computed(
  () => props.error.statusMessage || props.error.message || "Algo deu errado."
);

function handleReload(): void {
  clearError({ redirect: "/" });
}
</script>

<template>
  <div id="error-page" class="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
    <p class="font-mono text-[11px] tracking-wider text-ink-soft uppercase">
      Erro {{ error.statusCode }}
    </p>
    <h1 class="font-display text-2xl font-semibold text-ink">{{ description }}</h1>
    <button
      id="btn-error-back"
      type="button"
      class="mt-2 rounded-lg bg-accent-dark px-4 py-2 text-[13px] font-semibold text-white"
      @click="handleReload"
    >
      Voltar ao painel
    </button>
  </div>
</template>
