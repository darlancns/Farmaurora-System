<script setup lang="ts">
import NavIcon from "./NavIcon.vue";

interface Props {
  to: string;
  icon: string;
  label: string;
  active: boolean;
}

defineProps<Props>();
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-2 rounded-md px-2 py-1.5 font-display text-[13.5px] font-medium transition-colors"
    :class="
      active
        ? 'bg-white/15 text-white'
        : 'text-white/70 hover:bg-white/10 hover:text-white'
    "
  >
    <NavIcon :name="icon" class="h-[15px] w-[15px] shrink-0" />
    {{ label }}
  </NuxtLink>
</template>
