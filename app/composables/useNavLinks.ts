import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
import { useAuth } from "./useAuth";
import type { Section } from "#shared/utils/rbac";
import { podeLer, type UsuarioRbac } from "#shared/utils/permissoesPagina";

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

export interface NavLinksVisiveis {
  links: NavLink[];
  showConfigLink: boolean;
  allLinks: NavLink[];
}

const SEM_LINKS: NavLinksVisiveis = { links: [], showConfigLink: false, allLinks: [] };

/**
 * Itens de navegação que o usuário pode ver: só as seções que ele LÊ (mapa de permissões por página da conta ou,
 * sem mapa, o cargo — a mesma decisão do servidor e do guarda de rotas, via `podeLer`), mais Configurações
 * (lida por todos os cargos) por último. Função pura: sem usuário, nenhum item.
 */
export function filtrarNavLinks(user: UsuarioRbac | null | undefined): NavLinksVisiveis {
  if (!user) return SEM_LINKS;
  const links = MAIN_LINKS.filter((link) => podeLer(user, link.section));
  const showConfigLink = podeLer(user, CONFIG_LINK.section);
  return { links, showConfigLink, allLinks: showConfigLink ? [...links, CONFIG_LINK] : links };
}

/**
 * Fonte única dos itens de navegação e de quais o usuário atual pode ver —
 * SidebarNav.vue e BottomNav.vue consomem daqui, nunca duplicam a lista nem a
 * regra (que é a de `filtrarNavLinks`, a mesma de shared/utils/permissoesPagina.ts).
 *
 * O cargo só é conhecido no client (via /api/auth/me), então a lista some fica
 * vazia até montar — o HTML do SSR (sem links) bate com o primeiro render do
 * client, sem hydration mismatch. Mesmo padrão que SidebarNav.vue já usava.
 */
export function useNavLinks(): UseNavLinksReturn {
  const { user } = useAuth();

  const ready = ref(false);
  onMounted(() => {
    ready.value = true;
  });

  const visiveis = computed<NavLinksVisiveis>(() => (ready.value ? filtrarNavLinks(user.value) : SEM_LINKS));

  const links = computed<NavLink[]>(() => visiveis.value.links);
  const showConfigLink = computed<boolean>(() => visiveis.value.showConfigLink);
  const allLinks = computed<NavLink[]>(() => visiveis.value.allLinks);

  return { ready, links, showConfigLink, allLinks };
}
