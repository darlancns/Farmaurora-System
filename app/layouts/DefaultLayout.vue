<script setup lang="ts">
import ToastNotice from "../components/ToastNotice.vue";
import SidebarNav from "../components/SidebarNav.vue";
</script>

<template>
  <div id="default-layout" class="flex h-screen bg-paper">
    <SidebarNav />
    <main class="min-w-0 flex-1 overflow-y-auto px-6 pt-3.5 pb-10">
      <slot />
    </main>
    <ToastNotice />
  </div>
</template>
