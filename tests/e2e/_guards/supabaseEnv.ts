import { assertSupabaseLocal } from "./supabaseLocal";

// Fonte ÚNICA da URL e da service role key usadas pelos specs e2e que falam direto com o Supabase
// (semear, limpar, criar contas). Lê SÓ o ambiente do processo — o playwright.config.ts põe lá o
// conteúdo do `.env.e2e`. NUNCA lê o `.env`, que aponta para produção.
//
// Confere a guarda sobre a MESMA URL que devolve: não existe caminho em que a URL ou a chave venham
// de um lugar e a checagem de loopback de outro. URL não local → lança antes de devolver qualquer
// credencial. Chave ausente → devolve vazio (o spec marca `runnable = false` e se pula).
export function lerEnv(): { url: string; serviceKey: string } {
  assertSupabaseLocal();
  return {
    url: process.env.NUXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    serviceKey: process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  };
}
