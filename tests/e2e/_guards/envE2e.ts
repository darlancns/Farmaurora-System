import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { urlEhLocal } from "./supabaseLocal";

// Carrega o ambiente da suíte e2e a partir do arquivo `.env.e2e` (nunca do `.env`). Usado pelo
// playwright.config.ts ANTES de subir o dev server, pra que o app, os specs e a guarda enxerguem o
// mesmo Supabase local. Falha cedo e alto: sem arquivo, sem as chaves ou com URL não local, a
// suíte nem começa (e o dev server nem sobe).

export const CHAVES_SUPABASE_OBRIGATORIAS = [
  "NUXT_PUBLIC_SUPABASE_URL",
  "NUXT_PUBLIC_SUPABASE_ANON_KEY",
  "NUXT_SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const ARQUIVO_ENV_E2E_PADRAO = ".env.e2e";

export function carregarEnvE2E(arquivo: string = ARQUIVO_ENV_E2E_PADRAO): Record<string, string> {
  const caminho = resolve(process.cwd(), arquivo);
  if (!existsSync(caminho)) {
    throw new Error(
      `E2E abortado: ${arquivo} não existe. A suíte e2e só roda contra o Supabase LOCAL e nunca lê o ` +
        ".env (produção). Copie .env.e2e.example para .env.e2e, preencha com as chaves do `supabase " +
        "status` e rode `npm run e2e:setup-users` (ver README, seção Testes).",
    );
  }

  const bruto = parseEnv(readFileSync(caminho, "utf-8"));
  const env: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (typeof valor === "string") env[chave] = valor.trim();
  }

  const faltando = CHAVES_SUPABASE_OBRIGATORIAS.filter((chave) => !env[chave]);
  if (faltando.length > 0) {
    throw new Error(`E2E abortado: ${arquivo} não define ${faltando.join(", ")}.`);
  }

  const url = env.NUXT_PUBLIC_SUPABASE_URL ?? "";
  if (!urlEhLocal(url)) {
    let alvo = "(inválida)";
    try {
      alvo = new URL(url).host;
    } catch {
      // mantém "(inválida)"
    }
    throw new Error(
      `E2E abortado: NUXT_PUBLIC_SUPABASE_URL em ${arquivo} é ${alvo}, que não é local ` +
        "(localhost / 127.0.0.1 / [::1]). Estes specs escrevem e apagam dados.",
    );
  }

  return env;
}
