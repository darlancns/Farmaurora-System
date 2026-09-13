import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCookies, setCookie, type H3Event } from "h3";
import { useRuntimeConfig } from "#imports";

/**
 * Client Supabase server-side ligado à sessão do usuário.
 *
 * Lê os cookies de sessão do próprio H3 event e escreve de volta (refresh de
 * token) via `setCookie`, além dos headers de no-cache que a lib pede. Deve
 * ser criado uma vez por request — nunca compartilhado entre requests.
 */
export function createSupabaseServerClient(event: H3Event): SupabaseClient {
  const config = useRuntimeConfig(event);
  const url = String(config.public.supabaseUrl ?? "");
  const anonKey = String(config.public.supabaseAnonKey ?? "");

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        const cookies = parseCookies(event);
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(event, name, value, options);
        }
        for (const [key, headerValue] of Object.entries(headers ?? {})) {
          event.node.res.setHeader(key, headerValue);
        }
      },
    },
  });
}

/**
 * Client Supabase com a service role key — bypassa RLS e permite operações
 * administrativas (ex.: criar contas da equipe). NUNCA deve ser exposto ao
 * client: a chave só existe em runtimeConfig server-only.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const config = useRuntimeConfig();
  const url = String(config.public.supabaseUrl ?? "");
  const serviceRoleKey = String(config.supabaseServiceRoleKey ?? "");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin não configurado: defina NUXT_PUBLIC_SUPABASE_URL e " +
        "NUXT_SUPABASE_SERVICE_ROLE_KEY no .env.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
