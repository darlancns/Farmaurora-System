import { defineNuxtRouteMiddleware, navigateTo, useRequestEvent } from "#app";
import { useAuth } from "../composables/useAuth";
import { sectionForPageRoute } from "#shared/utils/rbac";
import { paginaInicial, podeLer } from "#shared/utils/permissoesPagina";
import { redirectForRemovedPage } from "#shared/utils/legacyRoutes";
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
 * /login). Redireciona quem tenta abrir uma página fora do seu cargo (ou do seu
 * mapa de permissões por página) para a página inicial DO USUÁRIO — a primeira
 * legível, ou /recados — que nunca é uma página que ele não possa abrir, então
 * não há loop de redirecionamento.
 */
function redirectForRole(to: { path: string }, user: AuthUser): ReturnType<typeof navigateTo> | void {
  // Páginas removidas (ex.: /inicio) vão pro destino padrão em vez de 404.
  const removedTarget = redirectForRemovedPage(to.path, user);
  if (removedTarget) return navigateTo(removedTarget, { replace: true });

  const section = sectionForPageRoute(to.path);
  if (section && !podeLer(user, section)) {
    return navigateTo(paginaInicial(user));
  }

  // "/" é a landing — cada um cai na sua página inicial (Follow-up, salvo mapa que o impeça).
  if (to.path === "/") {
    return navigateTo(paginaInicial(user));
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
