import { defineNuxtRouteMiddleware, navigateTo } from "#app";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../utils/supabaseClient";
import { useAuth } from "../composables/useAuth";

/**
 * Guarda global de sessão (client-side).
 *
 * No SSR não faz nada — deixa a página renderizar e o client refaz a checagem
 * após a hidratação, evitando erro de SSR antes de os cookies estarem
 * disponíveis no contexto do browser.
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
  if (import.meta.server) return;

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
