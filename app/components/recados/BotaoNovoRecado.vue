<script setup lang="ts">
defineProps<{
  label: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    id="btn-novo-recado"
    type="button"
    class="rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
