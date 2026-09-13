import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",

  devtools: { enabled: false },

  // Supabase Auth cuida da autenticação; os dados de negócio (Pacientes,
  // Processos, Pagamentos) ficam em tabelas Postgres do mesmo projeto Supabase,
  // acessadas server-side com a service role key. Os valores reais vêm do .env
  // via as env vars NUXT_* (Nuxt faz o mapeamento automático):
  //   NUXT_PUBLIC_SUPABASE_URL       -> public.supabaseUrl
  //   NUXT_PUBLIC_SUPABASE_ANON_KEY  -> public.supabaseAnonKey
  //   NUXT_SUPABASE_SERVICE_ROLE_KEY -> supabaseServiceRoleKey (server-only)
  //   NUXT_ADMIN_EMAILS             -> adminEmails (server-only)
  runtimeConfig: {
    supabaseServiceRoleKey: "",
    adminEmails: "",
    public: {
      supabaseUrl: "",
      supabaseAnonKey: "",
    },
  },

  // Convenção do projeto: sem auto-import de componentes/composables.
  // Todo import deve ser explícito em cada arquivo.
  imports: {
    autoImport: false,
  },
  components: false,

  css: ["~/assets/css/main.css"],

  routeRules: {
    "/": { redirect: "/inicio" },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  alias: {
    "#shared": fileURLToPath(new URL("./shared", import.meta.url)),
  },

  typescript: {
    strict: true,
  },

  app: {
    head: {
      title: "Farmaurora System",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "stylesheet",
          // `crossorigin` é obrigatório para a exportação de imagem: sem ele a
          // folha do Google Fonts é opaca e `cssRules` lança SecurityError, então
          // a captura não enxerga nenhuma @font-face daqui (Inter ou JetBrains
          // Mono) e cai no fallback do sistema, distorcendo os cartões
          // exportados. Com o atributo a folha é buscada em modo CORS e fica
          // legível — a proteção vale pro <link> inteiro, não por família.
          crossorigin: "anonymous",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
        },
      ],
    },
  },
});
