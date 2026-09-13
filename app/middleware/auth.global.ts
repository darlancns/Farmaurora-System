import { defineNuxtRouteMiddleware, navigateTo, useRequestEvent } from "#app";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../utils/supabaseClient";
import { useAuth } from "../composables/useAuth";

/**
 * Guarda global de sessão.
 *
 * No SSR, lê `event.context.user` — já populado por server/middleware/auth.ts
 * a partir do cookie via @supabase/ssr — e redireciona ali mesmo quando não
 * há sessão. Antes, o SSR não fazia nada aqui e deixava a página protegida
 * renderizar inteira; só o client (depois da hidratação) redirecionava, e o
 * Vue acabava hidratando a página errada contra o DOM da página protegida,
 * disparando "Hydration completed but contains mismatches" em produção.
 *
 * No client, refaz a checagem (getSession) pra cobrir navegação client-side
 * (SPA) entre páginas, onde não há um novo request/middleware de servidor.
 *
 * A autorização por cargo fica no `authz.global.ts` (roda depois deste).
 *
 * `/redefinir-senha` também fica isenta do redirect por falta de sessão:
 * quem chega lá pelo link do e-mail só tem uma sessão de recovery, que o
 * client Supabase leva um instante pra processar a partir do hash da URL —
 * sem essa isenção, esse instante sem sessão mandaria a pessoa pro /login
 * antes de conseguir trocar a senha.
 */
const PUBLIC_ROUTES = ["/login", "/redefinir-senha"];

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    if (PUBLIC_ROUTES.includes(to.path)) return;
    const event = useRequestEvent();
    if (!event?.context.user) return navigateTo("/login");
    return;
  }

  let session: Session | null = null;
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    // Supabase não configurado (.env vazio) — mantém só as rotas públicas acessíveis.
    useAuth().clear();
    if (!PUBLIC_ROUTES.includes(to.path)) return navigateTo("/login");
    return;
  }

  if (!session) {
    useAuth().clear();
    if (!PUBLIC_ROUTES.includes(to.path)) return navigateTo("/login");
    return;
  }

  if (session && to.path === "/login") {
    return navigateTo("/");
  }
});
