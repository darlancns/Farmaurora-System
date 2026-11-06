import { defineConfig, devices } from "@playwright/test";
import { ARQUIVO_ENV_E2E_PADRAO, carregarEnvE2E } from "./tests/e2e/_guards/envE2e";

// A suíte e2e roda SÓ contra o Supabase local. O ambiente vem do `.env.e2e` (ou do arquivo apontado
// por E2E_ENV_FILE) — NUNCA do `.env`, que aponta para produção. Se o arquivo não existir, faltar
// chave ou a URL não for loopback, a config lança aqui e nada sobe (nem o dev server).
//
// O conteúdo do arquivo VAI PARA o ambiente do processo (sobrescreve variáveis do shell, que podem
// apontar pra produção): specs e guarda (workers herdam o ambiente) e o dev server (webServer.env)
// enxergam o mesmo Supabase. O Nuxt dá precedência ao ambiente sobre o `.env`.
const envE2E = carregarEnvE2E(process.env.E2E_ENV_FILE?.trim() || ARQUIVO_ENV_E2E_PADRAO);
Object.assign(process.env, envE2E);

// Porta própria: um `npm run dev` normal (porta 3000, apontando pra produção) nunca é reaproveitado.
const PORTA = Number(process.env.E2E_PORT) || 3100;
const BASE_URL = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Reconfere o Supabase em uso antes de qualquer teste (defesa em profundidade; a config já checou).
  globalSetup: "./tests/e2e/_guards/globalSetup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx nuxt dev --port ${PORTA}`,
    url: BASE_URL,
    // Nunca reaproveita um servidor já aberto: ele poderia estar apontando para a produção.
    reuseExistingServer: false,
    timeout: 90_000,
    env: envE2E,
  },
});
