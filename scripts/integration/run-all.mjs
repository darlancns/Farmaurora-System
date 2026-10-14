// Runner dos smoke tests de integração (npm run test:integration).
//
// Roda os smoke tests e a integração do store real em sequência, CONTRA O BANCO
// SUPABASE REAL configurado no .env deste projeto. Cada um cria e apaga
// registros com prefixo de teste (TESTE_...) — não encosta em dado real — e
// verifica no fim que não sobrou lixo. Exit code != 0 se qualquer um falhar.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = join(HERE, "..", "..");
const VITEST_BIN = join(ROOT, "node_modules", "vitest", "vitest.mjs");

// [nome, rótulo, argumentos do node]. Os smoke .mjs reimplementam a lógica do
// store ("espelho"); o último chama o código REAL do servidor via vitest.
const SUITES = [
  ["Prestações (prestacao_pacientes)", "smoke-patients-supabase.mjs", [join(HERE, "smoke-patients-supabase.mjs")]],
  ["Processos (follow_up)", "smoke-processos-supabase.mjs", [join(HERE, "smoke-processos-supabase.mjs")]],
  [
    "Pagamentos — espelho (pagamento_lotes_banco / _lancamentos_banco / _grupos)",
    "smoke-pagamentos-supabase.mjs",
    [join(HERE, "smoke-pagamentos-supabase.mjs")],
  ],
  ["Chaves PIX (pagamento_pix_chaves)", "smoke-pix-supabase.mjs", [join(HERE, "smoke-pix-supabase.mjs")]],
  [
    "Pagamentos — câmbio com o STORE REAL (bancoStore + handler PATCH cotação)",
    "pagamentos-store-real.spec.ts",
    [VITEST_BIN, "run", "--config", join(ROOT, "vitest.integration.config.ts")],
  ],
];

console.log("");
console.log("┌─────────────────────────────────────────────────────────────────────────┐");
console.log("│  SMOKE TESTS DE INTEGRAÇÃO                                               │");
console.log("│                                                                         │");
console.log("│  ⚠  Rodam contra o BANCO SUPABASE REAL do .env (não há banco de teste    │");
console.log("│     separado — decisão consciente, ver scripts/integration/README.md).   │");
console.log("│  ⚠  Criam e APAGAM registros com id de prefixo TESTE_ (nunca dado real; │");
console.log("│     cada suíte confere no fim que não sobrou nada TESTE_%).             │");
console.log("└─────────────────────────────────────────────────────────────────────────┘");
console.log("");

let falhou = 0;
for (const [nome, arquivo, args] of SUITES) {
  console.log(`\n━━━ ${nome} ━━━ (${arquivo})\n`);
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    falhou++;
    console.log(`\n✗ ${arquivo} FALHOU (exit ${r.status})`);
  }
}

console.log("");
if (falhou) {
  console.log(`RESULTADO: ${falhou} de ${SUITES.length} suíte(s) falharam.`);
  process.exit(1);
}
console.log(`RESULTADO: todas as ${SUITES.length} suítes passaram.`);
