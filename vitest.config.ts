import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./shared", import.meta.url)),
      // Runtime do Nuxt: só um substituto mínimo (ver o arquivo) para specs em DOM de teste.
      "#app": fileURLToPath(new URL("./tests/unit/helpers/nuxtAppStub.ts", import.meta.url)),
    },
  },
  test: {
    // Só tests/unit/ — tests/e2e/ usa o test runner do @playwright/test, que
    // tem sua própria assinatura de test()/expect() e não deve ser varrido
    // por aqui.
    include: ["tests/unit/**/*.spec.ts"],
  },
});
