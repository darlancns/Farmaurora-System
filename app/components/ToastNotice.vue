<script setup lang="ts">
import { useToast } from "../composables/useToast";

const { message } = useToast();
</script>

<template>
  <div
    id="toast-notice"
    class="fixed bottom-6 left-1/2 z-[999] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-white transition-all duration-250"
    :class="message ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'"
  >
    {{ message }}
  </div>
</template>
