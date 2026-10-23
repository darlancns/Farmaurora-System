import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guarda de segurança dos specs e2e: eles criam, editam e APAGAM dados (inclusive com a
// service role). O .env do projeto aponta para PRODUÇÃO, então nada disso pode rodar contra
// ele. A suíte só prossegue quando a URL do Supabase em uso é de loopback (o Supabase falso
// do harness local); qualquer outra coisa ABORTA antes de qualquer escrita.
//
// URL "em uso" = a mesma que o `nuxt dev` enxerga: a variável de ambiente
// NUXT_PUBLIC_SUPABASE_URL (tem precedência) ou, na falta dela, a do .env do diretório atual.

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function urlEhLocal(url: string): boolean {
  try {
    return HOSTS_LOCAIS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function urlDoDotEnv(): string {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    for (const linha of raw.split(/\r?\n/)) {
      if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
      const i = linha.indexOf("=");
      if (linha.slice(0, i).trim() === "NUXT_PUBLIC_SUPABASE_URL") return linha.slice(i + 1).trim();
    }
  } catch {
    // sem .env: cai no retorno vazio (e a guarda aborta)
  }
  return "";
}

function supabaseUrlEmUso(): string {
  return process.env.NUXT_PUBLIC_SUPABASE_URL?.trim() || urlDoDotEnv();
}

export function assertSupabaseLocal(): void {
  const url = supabaseUrlEmUso();
  if (urlEhLocal(url)) return;
  let alvo = "(não definida)";
  try {
    if (url) alvo = new URL(url).host;
  } catch {
    alvo = "(inválida)";
  }
  throw new Error(
    `E2E abortado: a URL do Supabase em uso é ${alvo}, que não é local. Estes specs escrevem e apagam ` +
      "dados e NUNCA devem rodar contra produção. Rode-os só no harness local (Supabase falso em " +
      "localhost/127.0.0.1) definindo NUXT_PUBLIC_SUPABASE_URL para ele.",
  );
}
