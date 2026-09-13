import { defineNuxtRouteMiddleware, navigateTo } from "#app";
import { useAuth } from "../composables/useAuth";
import { sectionForPageRoute, canReadSection, defaultRouteForRole, landsOnProcessos } from "#shared/utils/rbac";

/**
 * Guarda global de autorização por cargo (client-side).
 *
 * Roda depois de `auth.global.ts` (ordem alfabética) — quando chega aqui a
 * sessão já foi validada. Redireciona quem tenta abrir uma página fora do seu
 * cargo, e leva `consultor`/`operacional` direto pro Follow-up.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;
  if (to.path === "/login") return;

  const { load } = useAuth();
  const user = await load();
  if (!user) return; // sem sessão — auth.global.ts já redirecionou pra /login

  const section = sectionForPageRoute(to.path);
  if (section && !canReadSection(user.role, section)) {
    return navigateTo(defaultRouteForRole(user.role));
  }

  // Rota de entrada por cargo: consultor e operacional não param em /inicio.
  const isLanding = to.path === "/" || to.path === "/inicio";
  if (isLanding && landsOnProcessos(user.role)) {
    return navigateTo("/processos");
  }
});
