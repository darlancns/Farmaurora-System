import { assertSupabaseLocal } from "./supabaseLocal";

// Roda uma vez antes de toda a suíte e2e (playwright.config.ts): aborta tudo se o Supabase
// em uso não for o local do harness. Protege também os specs que escrevem só pela UI.
export default function globalSetup(): void {
  assertSupabaseLocal();
}
