import { defineNuxtRouteMiddleware, navigateTo, useRequestEvent } from "#app";
import { useAuth } from "../composables/useAuth";
import { sectionForPageRoute, canReadSection, defaultRouteForRole, landsOnProcessos } from "#shared/utils/rbac";
import type { AuthUser } from "#shared/types/auth";

/**
 * Guarda global de autorização por cargo.
 *
 * No SSR, lê `event.context.user` — já populado por server/middleware/auth.ts,
 * com `role` resolvido sem consulta extra ao Supabase — e aplica a mesma
 * checagem usada no client. Antes, o SSR não fazia nada aqui e deixava a
 * página fora do cargo renderizar inteira; só o client (depois da hidratação)
 * redirecionava, gerando o mesmo tipo de "Hydration completed but contains
 * mismatches" que `auth.global.ts` tinha para sessão ausente (commit
 * 17c83cc) — só que aqui para sessão válida com cargo sem permissão.
 *
 * Roda depois de `auth.global.ts` (ordem alfabética) — quando chega aqui a
 * sessão já foi validada (ou, no SSR, `auth.global.ts` já redirecionou pra
 * /login). Redireciona quem tenta abrir uma página fora do seu cargo, e leva
 * `consultor`/`operacional` direto pro Follow-up.
 */
function redirectForRole(to: { path: string }, user: AuthUser): ReturnType<typeof navigateTo> | void {
  const section = sectionForPageRoute(to.path);
  if (section && !canReadSection(user.role, section)) {
    return navigateTo(defaultRouteForRole(user.role));
  }

  // Rota de entrada por cargo: consultor e operacional não param em /inicio.
  const isLanding = to.path === "/" || to.path === "/inicio";
  if (isLanding && landsOnProcessos(user.role)) {
    return navigateTo("/processos");
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return;

  if (import.meta.server) {
    const user = useRequestEvent()?.context.user;
    if (!user) return; // sem sessão — auth.global.ts já redirecionou pra /login
    return redirectForRole(to, user);
  }

  const { load } = useAuth();
  const user = await load();
  if (!user) return; // sem sessão — auth.global.ts já redirecionou pra /login

  return redirectForRole(to, user);
});
