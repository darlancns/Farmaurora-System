import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes de INTEGRAÇÃO contra o Supabase REAL do .env (código real do servidor,
// sem espelho). Ficam FORA do `npm run test:unit` (que só varre tests/unit/) de
// propósito: escrevem no banco. Rodar com `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "#imports": fileURLToPath(new URL("./scripts/integration/_stubs/nuxtImports.ts", import.meta.url)),
    },
  },
  test: {
    include: ["scripts/integration/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Um arquivo por vez e testes em sequência: todos mexem nas mesmas tabelas.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
