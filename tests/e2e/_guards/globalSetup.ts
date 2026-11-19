import { createClient } from "@supabase/supabase-js";
import { CONSULTORES_E2E, linhaConsultorE2E } from "../../../scripts/lib/e2eUsuarios.mjs";
import { assertSupabaseLocal } from "./supabaseLocal";

// Roda uma vez antes de toda a suíte e2e (playwright.config.ts): aborta tudo se o Supabase
// em uso não for o local do harness. Protege também os specs que escrevem só pela UI.
//
// Depois da guarda, garante no Cadastro do Supabase LOCAL os consultores que os specs usam (cadastro_consultores): o servidor só
// aceita consultor ATIVO como valor novo de processo, prestação e PO. Idempotente (quem já existe é mantido). Se a tabela ainda não
// existe no banco local (migration 20261118210000_cadastro_consultores.sql), só avisa: os specs que dependem dela vão falhar.
export default async function globalSetup(): Promise<void> {
  assertSupabaseLocal();

  const url = process.env.NUXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) return;

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin
    .from("cadastro_consultores")
    .upsert(CONSULTORES_E2E.map((nome) => linhaConsultorE2E(nome)), { onConflict: "nome_chave", ignoreDuplicates: true });
  if (error) {
    console.warn(
      `[e2e] não consegui garantir os consultores no Cadastro local (${error.message}). ` +
        "Aplique a migration 20261118210000_cadastro_consultores.sql no Supabase local.",
    );
  }
}
