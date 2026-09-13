import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRuntimeConfig } from "#app";

/**
 * Client Supabase para uso no browser (autenticação apenas).
 *
 * `createBrowserClient` já persiste a sessão em cookies e é singleton por
 * padrão, mas guardamos a instância aqui também para não reprocessar a
 * runtimeConfig a cada chamada. Import explícito — o projeto não usa
 * auto-import.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const config = useRuntimeConfig();
  const url = String(config.public.supabaseUrl ?? "");
  const anonKey = String(config.public.supabaseAnonKey ?? "");

  if (!url || !anonKey) {
    throw new Error(
      "Supabase não configurado: defina NUXT_PUBLIC_SUPABASE_URL e " +
        "NUXT_PUBLIC_SUPABASE_ANON_KEY no .env.",
    );
  }

  client = createBrowserClient(url, anonKey);
  return client;
}
