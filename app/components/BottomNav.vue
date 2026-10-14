<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "#app";
import { useNavLinks } from "../composables/useNavLinks";
import { splitBottomNavLinks } from "../utils/bottomNavLinks";
import NavIcon from "./NavIcon.vue";
import NavMoreSheet from "./NavMoreSheet.vue";

// Substitui a SidebarNav abaixo de md (ver DefaultLayout.vue) — mesma fonte de
// itens/regra de visibilidade por cargo que a sidebar usa (useNavLinks.ts),
// só reorganizada em ícones fixos + "Mais" quando não cabem 5.
const route = useRoute();
const { allLinks } = useNavLinks();

const split = computed(() => splitBottomNavLinks(allLinks.value));
const activePath = computed<string>(() => route.path);
const isOverflowActive = computed(() => split.value.overflow.some((link) => link.to === activePath.value));

const showMore = ref(false);
</script>

<template>
  <nav
    id="bottom-nav"
    class="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-hairline bg-paper-raised md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  >
    <NuxtLink
      v-for="link in split.primary"
      :key="link.to"
      :to="link.to"
      class="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-medium transition-colors"
      :class="activePath === link.to ? 'text-accent-dark' : 'text-ink-soft'"
    >
      <NavIcon :name="link.icon" class="h-[22px] w-[22px] shrink-0" />
      {{ link.label }}
    </NuxtLink>

    <button
      v-if="split.overflow.length > 0"
      id="btn-bottom-nav-more"
      type="button"
      class="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-medium transition-colors"
      :class="isOverflowActive ? 'text-accent-dark' : 'text-ink-soft'"
      @click="showMore = true"
    >
      <NavIcon name="more" class="h-[22px] w-[22px] shrink-0" />
      Mais
    </button>
  </nav>

  <NavMoreSheet v-if="showMore" :links="split.overflow" @close="showMore = false" @navigate="showMore = false" />
</template>
