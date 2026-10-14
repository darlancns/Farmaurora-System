// Stub de `#imports` (auto-imports do Nuxt/Nitro) para rodar o código REAL do
// servidor (server/utils/*Store.ts) fora do Nitro, no vitest de integração.
// Só implementa o que o store usa: `useRuntimeConfig`, lendo o .env do projeto.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_PATH = fileURLToPath(new URL("../../../.env", import.meta.url));

function lerEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const env: Record<string, string> = {};
  for (const linha of readFileSync(ENV_PATH, "utf-8").split(/\r?\n/)) {
    if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
    const i = linha.indexOf("=");
    env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return env;
}

const env = lerEnv();

export function temCredenciaisSupabase(): boolean {
  return Boolean(env.NUXT_PUBLIC_SUPABASE_URL && env.NUXT_SUPABASE_SERVICE_ROLE_KEY);
}

export function useRuntimeConfig() {
  return {
    public: {
      supabaseUrl: env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    supabaseServiceRoleKey: env.NUXT_SUPABASE_SERVICE_ROLE_KEY,
  };
}
