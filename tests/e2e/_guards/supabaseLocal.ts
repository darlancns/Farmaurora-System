// Guarda de segurança dos specs e2e: eles criam, editam e APAGAM dados (inclusive com a
// service role, e alguns esvaziam tabelas inteiras). O .env do projeto aponta para PRODUÇÃO,
// então nada disso pode rodar contra ele. A suíte só prossegue quando a URL do Supabase em uso é
// de loopback (o Supabase local do harness); qualquer outra coisa ABORTA antes de qualquer escrita.
//
// URL "em uso" = SÓ a variável de ambiente NUXT_PUBLIC_SUPABASE_URL do processo. O `.env` NÃO é
// lido de propósito: o playwright.config.ts carrega o `.env.e2e` (nunca o `.env`) pra dentro do
// ambiente e repassa o mesmo ambiente ao dev server, então a URL que a guarda confere é, por
// construção, a mesma que o app e os specs usam. Antes, a guarda olhava o ambiente e os specs
// liam a URL e a service key do `.env` — bastava exportar uma URL local no shell pra a guarda
// passar enquanto os specs apagavam dados da produção.

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function urlEhLocal(url: string): boolean {
  try {
    return HOSTS_LOCAIS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function supabaseUrlEmUso(): string {
  return process.env.NUXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
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
      "dados e NUNCA devem rodar contra produção. Rode-os só no Supabase local: copie " +
      ".env.e2e.example para .env.e2e (NUXT_PUBLIC_SUPABASE_URL em localhost/127.0.0.1) — o " +
      "playwright.config.ts o carrega. O .env de produção nunca é lido pela suíte.",
  );
}
