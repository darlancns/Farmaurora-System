// Migração one-time: data/pagamentos-*-pix.json  →  tabela pagamento_pix_chaves.
//
// Lê os 2 JSON de override de chave PIX (despachante e transportadora), valida
// contra a lista de nomes conhecidos e faz upsert por (tipo, nome) — idempotente.
//
// Uso:
//   node scripts/migration/migrate-pix-to-supabase.mjs --dry-run   (só imprime o que faria)
//   node scripts/migration/migrate-pix-to-supabase.mjs --commit     (grava de verdade)
//
// Sem flag: não faz nada (evita execução acidental). Segue o padrão dos
// scripts/integration/* (.env lido na mão + createRequire).

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

// ── flags ────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const COMMIT = args.has("--commit");
if (DRY_RUN === COMMIT) {
  console.error("Escolha exatamente um modo: --dry-run  ou  --commit");
  process.exit(1);
}

// ── espelho de shared/constants/pagamentos.ts (lista de nomes conhecidos) ──
const DESPACHANTES_PAGAMENTO = ["Andreza Faconi", "Bruno Lopes", "Marcelo Lima"];
const TRANSPORTADORAS_PAGAMENTO = ["AJC", "Doctor"];

const FONTES = [
  { tipo: "DESPACHANTE", nomes: DESPACHANTES_PAGAMENTO, file: join(CRM, "data", "pagamentos-despachante-pix.json") },
  { tipo: "TRANSPORTADORA", nomes: TRANSPORTADORAS_PAGAMENTO, file: join(CRM, "data", "pagamentos-transportadora-pix.json") },
];

// ── ler + validar ────────────────────────────────────────────────────────
function lerJson(file) {
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const redigir = (chave) => {
  const digs = String(chave).replace(/\D/g, "");
  return `****${digs.slice(-4) || "????"}`;
};

const registros = []; // { tipo, nome, chave_pix }
const invalidos = []; // { tipo, nome, motivo }

for (const { tipo, nomes, file } of FONTES) {
  const obj = lerJson(file);
  for (const [nome, valor] of Object.entries(obj)) {
    if (!nomes.includes(nome)) {
      invalidos.push({ tipo, nome, motivo: "nome fora da lista conhecida" });
      continue;
    }
    const chave = typeof valor === "string" ? valor.trim() : "";
    if (!chave) {
      invalidos.push({ tipo, nome, motivo: "chave PIX vazia / não-string" });
      continue;
    }
    registros.push({ tipo, nome, chave_pix: chave });
  }
}

if (invalidos.length) {
  console.error(`\n✗ ${invalidos.length} entrada(s) inválida(s) — migração ABORTADA (nada foi gravado):`);
  for (const i of invalidos) console.error(`  - [${i.tipo}] "${i.nome}": ${i.motivo}`);
  process.exit(1);
}

if (!registros.length) {
  console.log("Nenhum override de PIX nos JSON — nada a migrar.");
  process.exit(0);
}

// ── client Supabase ──────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(`${CRM}/.env`, "utf-8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// A partir daqui nunca chamamos process.exit() — o client supabase-js mantém
// um handle aberto e sair no meio do fechamento dispara um assert do libuv no
// Windows. Fluxo cai até o fim; o resultado vai em `process.exitCode`.
async function run() {
  // linhas já existentes, p/ decidir insert / update / skip
  const { data: existentesData, error: selErr } = await db
    .from("pagamento_pix_chaves").select("tipo, nome, chave_pix");
  if (selErr) {
    console.error(`✗ falha ao ler pagamento_pix_chaves: ${selErr.message}`);
    return 1;
  }
  const existentes = new Map((existentesData ?? []).map((r) => [`${r.tipo}|${r.nome}`, r.chave_pix]));

  const acaoDe = (r) => {
    if (!existentes.has(`${r.tipo}|${r.nome}`)) return "insert";
    return existentes.get(`${r.tipo}|${r.nome}`) === r.chave_pix ? "skip" : "update";
  };

  console.log(`\nModo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "COMMIT (upsert real)"}`);
  console.log("\n  tipo            | nome              | chave (redigida) | ação");
  console.log("  ----------------+-------------------+------------------+-------");
  const contagem = { insert: 0, update: 0, skip: 0 };
  for (const r of registros) {
    const acao = acaoDe(r);
    contagem[acao]++;
    console.log(
      `  ${r.tipo.padEnd(15)} | ${r.nome.padEnd(17)} | ${redigir(r.chave_pix).padEnd(16)} | ${acao}`,
    );
  }
  console.log(
    `\n  Total: ${registros.length}  (insert: ${contagem.insert}, update: ${contagem.update}, skip: ${contagem.skip})`,
  );

  if (DRY_RUN) {
    console.log("\nDry-run: nenhuma escrita feita.");
    return 0;
  }

  const nowIso = new Date().toISOString();
  const rows = registros.map((r) => ({ ...r, updated_at: nowIso }));
  const { error: upErr } = await db.from("pagamento_pix_chaves").upsert(rows, { onConflict: "tipo,nome" });
  if (upErr) {
    console.error(`\n✗ upsert falhou: ${upErr.message}`);
    return 1;
  }

  // verificação pós-escrita
  const { data: verifData, error: verifErr } = await db
    .from("pagamento_pix_chaves").select("tipo, nome, chave_pix");
  if (verifErr) {
    console.error(`\n✗ falha ao verificar pós-escrita: ${verifErr.message}`);
    return 1;
  }
  const pos = new Map((verifData ?? []).map((r) => [`${r.tipo}|${r.nome}`, r.chave_pix]));
  let okAll = true;
  for (const r of registros) {
    if (pos.get(`${r.tipo}|${r.nome}`) !== r.chave_pix) {
      okAll = false;
      console.error(`  ✗ divergência em [${r.tipo}] ${r.nome}`);
    }
  }
  console.log(okAll ? "\n✓ Migração concluída e verificada." : "\n✗ Migração com divergências.");
  return okAll ? 0 : 1;
}

process.exitCode = await run();
