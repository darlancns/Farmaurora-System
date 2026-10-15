// Backup one-time da tabela follow_up (SOMENTE LEITURA) →
// scripts/migration/backups/follow_up-AAAA-MM-DD-HHMM.json
//
// Exporta TODAS as colunas de TODOS os registros e confere a contagem do arquivo
// contra a contagem exata da tabela. Os arquivos contêm dados de pacientes: a
// pasta backups/ está no .gitignore — nunca commitar.
//
// Uso: node scripts/migration/backup-follow-up.mjs
// Segue o padrão dos demais scripts (.env lido na mão + createRequire).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

function lerEnv() {
  const env = {};
  for (const linha of readFileSync(join(CRM, ".env"), "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !linha.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = lerEnv();
const url = env.NUXT_PUBLIC_SUPABASE_URL;
const key = env.NUXT_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SERVICE_ROLE_KEY ausentes no .env");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { count, error: errCount } = await db.from("follow_up").select("*", { count: "exact", head: true });
if (errCount) {
  console.error("Falha ao contar:", errCount.message);
  process.exit(1);
}

const PAGINA = 1000;
const linhas = [];
for (let from = 0; ; from += PAGINA) {
  const { data, error } = await db
    .from("follow_up")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + PAGINA - 1);
  if (error) {
    console.error("Falha ao ler:", error.message);
    process.exit(1);
  }
  linhas.push(...data);
  if (data.length < PAGINA) break;
}

if (linhas.length !== count) {
  console.error(`CONTAGEM DIVERGENTE: tabela=${count} lidos=${linhas.length}. Backup NÃO gravado.`);
  process.exit(1);
}

const agora = new Date();
const p = (n) => String(n).padStart(2, "0");
const carimbo = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}`;
const dir = join(CRM, "scripts", "migration", "backups");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const arquivo = join(dir, `follow_up-${carimbo}.json`);
writeFileSync(arquivo, JSON.stringify(linhas, null, 2), "utf-8");

// Releitura: confere que o arquivo é JSON válido e tem o mesmo número de registros.
const relido = JSON.parse(readFileSync(arquivo, "utf-8"));
const colunas = linhas.length ? Object.keys(linhas[0]).length : 0;
console.log(`Projeto: ${new URL(url).hostname}`);
console.log(`Registros na tabela: ${count}`);
console.log(`Registros no backup: ${relido.length}  (colunas por registro: ${colunas})`);
console.log(`Arquivo: ${arquivo}`);
if (relido.length !== count) {
  console.error("RELEITURA DIVERGENTE — não confie neste backup.");
  process.exit(1);
}
console.log("OK: backup íntegro.");
