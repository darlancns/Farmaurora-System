<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "#app";
import { CONFIG_LINK, useNavLinks } from "../composables/useNavLinks";
import LogoutButton from "./LogoutButton.vue";
import SidebarNavLink from "./SidebarNavLink.vue";

const route = useRoute();
const { links, showConfigLink } = useNavLinks();

const activePath = computed<string>(() => route.path);
</script>

<template>
  <nav
    id="sidebar-nav"
    class="hidden w-48 shrink-0 flex-col gap-1 border-r border-hairline bg-accent-dark px-3 py-6 md:flex"
  >
    <img
      src="/images/logo_branca.png"
      alt="Farmaurora"
      class="mb-8 h-[50px] w-auto self-center"
    />
    <SidebarNavLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      :icon="link.icon"
      :label="link.label"
      :active="activePath === link.to"
    />

    <div class="mt-auto flex flex-col gap-1">
      <SidebarNavLink
        v-if="showConfigLink"
        :to="CONFIG_LINK.to"
        :icon="CONFIG_LINK.icon"
        :label="CONFIG_LINK.label"
        :active="activePath === CONFIG_LINK.to"
      />
      <LogoutButton />
    </div>
  </nav>
</template>
