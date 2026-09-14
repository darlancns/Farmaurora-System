<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "#app";
import { landsOnProcessos, type Section } from "#shared/utils/rbac";
import { useAuth } from "../composables/useAuth";
import LogoutButton from "./LogoutButton.vue";
import SidebarNavLink from "./SidebarNavLink.vue";

const route = useRoute();
const { role, canRead } = useAuth();

// O cargo só é conhecido no client (via /api/auth/me). Renderizamos a lista de
// links apenas depois de montado — assim o HTML do SSR (nenhum link) bate com o
// primeiro render do client, sem hydration mismatch; os links entram logo em
// seguida, num update pós-hidratação.
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

interface NavLink {
  label: string;
  to: string;
  icon: string;
  section: Section | null;
}

const mainLinks: NavLink[] = [
  { label: "Início", to: "/inicio", icon: "home", section: null },
  { label: "Follow-Up", to: "/processos", icon: "list", section: "processos" },
  { label: "Pagamentos", to: "/pagamentos", icon: "cash", section: "pagamentos" },
  { label: "Prestações", to: "/prestacao", icon: "clipboard", section: "patients" },
];

const configLink: NavLink = { label: "Configurações", to: "/configuracoes", icon: "cog", section: "config" };

const canShowLink = (link: NavLink): boolean => {
  if (!ready.value || !role.value) return false;
  if (link.section === null) {
    // "Início" só pra quem não cai direto no Follow-up.
    return !landsOnProcessos(role.value);
  }
  return canRead(link.section);
};

// Enquanto o cargo não carregou (role === null), não renderiza nenhum item —
// evita flash de link que o usuário não pode acessar.
const links = computed<NavLink[]>(() => mainLinks.filter(canShowLink));
const showConfigLink = computed<boolean>(() => canShowLink(configLink));

const activePath = computed<string>(() => route.path);
</script>

<template>
  <nav
    id="sidebar-nav"
    class="flex w-48 shrink-0 flex-col gap-1 border-r border-hairline bg-accent-dark px-3 py-6"
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
        :to="configLink.to"
        :icon="configLink.icon"
        :label="configLink.label"
        :active="activePath === configLink.to"
      />
      <LogoutButton />
    </div>
  </nav>
</template>
