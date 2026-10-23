<script setup lang="ts">
import { useEscapeToClose } from "../composables/useEscapeToClose";
import { useLockBodyScroll } from "../composables/useLockBodyScroll";
import type { NavLink } from "../composables/useNavLinks";
import NavIcon from "./NavIcon.vue";

// Sheet do botão "Mais" do BottomNav — só aparece quando um cargo tem mais de
// 5 itens de navegação (ver splitBottomNavLinks em utils/bottomNavLinks.ts);
// nenhum cargo atual chega lá, mas o mecanismo precisa existir.
defineProps<{ links: NavLink[] }>();

const emit = defineEmits<{ close: []; navigate: [] }>();

useEscapeToClose(() => emit("close"));
useLockBodyScroll();
</script>

<template>
  <div
    id="nav-more-sheet-overlay"
    class="fixed inset-0 z-[950] flex items-end justify-center bg-ink/40 lg:hidden"
    @click.self="emit('close')"
  >
    <div
      id="nav-more-sheet"
      class="w-full max-w-[520px] rounded-t-2xl border-t border-hairline bg-paper-raised shadow-lg"
      style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    >
      <div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-hairline" />
      <nav class="flex flex-col gap-0.5 p-3">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-ink transition-colors hover:bg-paper"
          @click="emit('navigate')"
        >
          <NavIcon :name="link.icon" class="h-5 w-5 shrink-0 text-ink-soft" />
          {{ link.label }}
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
