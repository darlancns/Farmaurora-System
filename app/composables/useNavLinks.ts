import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
import { useAuth } from "./useAuth";
import type { Section } from "#shared/utils/rbac";

export interface NavLink {
  label: string;
  to: string;
  icon: string;
  section: Section;
}

// Ordem = prioridade de exibição (histórica do SidebarNav) — é também a ordem
// que o BottomNav usa pra decidir quais itens ficam fixos quando sobra pro
// "Mais" (ver splitBottomNavLinks em utils/bottomNavLinks.ts).
const MAIN_LINKS: readonly NavLink[] = [
  { label: "Follow-Up", to: "/processos", icon: "list", section: "processos" },
  { label: "Recados", to: "/recados", icon: "chat", section: "recados" },
  { label: "Pagamentos", to: "/pagamentos", icon: "cash", section: "pagamentos" },
  { label: "Prestações", to: "/prestacao", icon: "clipboard", section: "patients" },
];

export const CONFIG_LINK: NavLink = { label: "Configurações", to: "/configuracoes", icon: "cog", section: "config" };

export interface UseNavLinksReturn {
  ready: Ref<boolean>;
  links: ComputedRef<NavLink[]>;
  showConfigLink: ComputedRef<boolean>;
  /** links + configLink (se visível) — usado pelo BottomNav, que não separa "config" do resto. */
  allLinks: ComputedRef<NavLink[]>;
}

/**
 * Fonte única dos itens de navegação e de quais o cargo atual pode ver —
 * SidebarNav.vue e BottomNav.vue consomem daqui, nunca duplicam a lista nem a
 * regra (que é a mesma de shared/utils/rbac.ts via useAuth().canRead).
 *
 * O cargo só é conhecido no client (via /api/auth/me), então a lista some fica
 * vazia até montar — o HTML do SSR (sem links) bate com o primeiro render do
 * client, sem hydration mismatch. Mesmo padrão que SidebarNav.vue já usava.
 */
export function useNavLinks(): UseNavLinksReturn {
  const { role, canRead } = useAuth();

  const ready = ref(false);
  onMounted(() => {
    ready.value = true;
  });

  const canShowLink = (link: NavLink): boolean => {
    if (!ready.value || !role.value) return false;
    return canRead(link.section);
  };

  const links = computed<NavLink[]>(() => MAIN_LINKS.filter(canShowLink));
  const showConfigLink = computed<boolean>(() => canShowLink(CONFIG_LINK));
  const allLinks = computed<NavLink[]>(() =>
    showConfigLink.value ? [...links.value, CONFIG_LINK] : links.value,
  );

  return { ready, links, showConfigLink, allLinks };
}
