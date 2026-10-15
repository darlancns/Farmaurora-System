// CARGA one-time do Follow-Up: chama a função carga_follow_up (apaga + insere numa
// ÚNICA transação) com a service role. Script único — NÃO é importado por nenhuma
// rota/botão da aplicação.
//
// Uso:
//   node scripts/migration/carga-follow-up.mjs            → só valida (não chama a função)
//   node scripts/migration/carga-follow-up.mjs --commit   → executa a carga
//
// Pré-condições checadas antes de chamar a função (qualquer falha → aborta, nada muda):
//   * tabela com exatamente ESPERADO_ATUAL registros e max(updated_at) = o do briefing;
//   * existe um backup RECENTE (<15 min) com a mesma contagem e o mesmo max(updated_at);
//   * o parser gera exatamente ESPERADO_NOVO registros válidos.
// Se a função abortar, NÃO há retry: o erro é impresso e o script termina.
// p_max_updated_at é enviado como a STRING EXATA devolvida pelo banco (sem Date).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFollowUpSource } from "./followUpParser.mjs";
import { COLUNAS_FOLLOW_UP, idCarga, registroParaLinha } from "./followUpRows.mjs";
import { CONSULTORES_PROCESSO, EMPRESAS_PROCESSO, STATUS_PROCESSO_ORDER } from "../../shared/constants/processos.ts";

const ESPERADO_ATUAL = 44;
const ESPERADO_NOVO = 58;
const MAX_UPDATED_AT_BRIEFING = "2026-09-08T23:40:28.648Z"; // 2026-09-08 23:40:28.648+00

const COMMIT = process.argv.includes("--commit");
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

function falha(msg) {
  console.error(`\nABORTADO: ${msg}\nNada foi alterado no banco.`);
  process.exit(1);
}

function lerEnv() {
  const env = {};
  for (const linha of readFileSync(join(CRM, ".env"), "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !linha.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = lerEnv();
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`Projeto: ${new URL(env.NUXT_PUBLIC_SUPABASE_URL).hostname}   modo: ${COMMIT ? "COMMIT" : "validação (sem chamar a função)"}`);

// 1) estado atual da tabela (string de timestamp EXATAMENTE como o banco devolve)
const { data: topo, error: eTopo } = await db.from("follow_up").select("updated_at").order("updated_at", { ascending: false }).limit(1);
if (eTopo) falha(`leitura do max(updated_at): ${eTopo.message}`);
const { count, error: eCount } = await db.from("follow_up").select("*", { count: "exact", head: true });
if (eCount) falha(`contagem: ${eCount.message}`);
const maxUpdatedAt = topo?.[0]?.updated_at;
console.log(`Tabela: ${count} registros, max(updated_at) = ${maxUpdatedAt}`);
if (count !== ESPERADO_ATUAL) falha(`tabela tem ${count} registros, esperado ${ESPERADO_ATUAL}`);
if (new Date(maxUpdatedAt).toISOString() !== MAX_UPDATED_AT_BRIEFING) {
  falha(`max(updated_at)=${maxUpdatedAt} difere do esperado (${MAX_UPDATED_AT_BRIEFING}) — pode ter havido edição`);
}

// 2) backup recente, íntegro e igual ao estado atual
const dirBk = join(CRM, "scripts", "migration", "backups");
const backups = readdirSync(dirBk)
  .filter((f) => /^follow_up-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f))
  .map((f) => ({ f, t: statSync(join(dirBk, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
if (!backups.length) falha("nenhum backup encontrado");
const bk = backups[0];
if (Date.now() - bk.t > 15 * 60 * 1000) falha(`o backup mais recente (${bk.f}) tem mais de 15 min — gere um novo`);
const bkLinhas = JSON.parse(readFileSync(join(dirBk, bk.f), "utf-8"));
const bkMax = bkLinhas.map((r) => r.updated_at).sort().at(-1);
console.log(`Backup: ${bk.f} → ${bkLinhas.length} registros, max(updated_at) = ${bkMax}`);
if (bkLinhas.length !== count) falha(`backup tem ${bkLinhas.length} registros, tabela ${count}`);
if (bkMax !== maxUpdatedAt) falha(`max(updated_at) do backup (${bkMax}) difere da tabela (${maxUpdatedAt})`);

// 3) registros novos
const { entradas } = parseFollowUpSource(readFileSync(join(CRM, "scripts", "migration", "follow-up-source.txt"), "utf-8"));
const criar = entradas.filter((e) => e.record).map((e) => e.record);
if (criar.length !== ESPERADO_NOVO) falha(`parser gerou ${criar.length} registros, esperado ${ESPERADO_NOVO}`);
const ms = Date.now();
const agora = new Date(ms).toISOString();
const linhas = criar.map((rec, i) => registroParaLinha(rec, { id: idCarga(ms, i), agora }));
for (const l of linhas) {
  const id = `${l.paciente} (${l.pasta})`;
  if (Object.keys(l).join() !== COLUNAS_FOLLOW_UP.join()) falha(`${id}: colunas fora do esperado`);
  if (!CONSULTORES_PROCESSO.includes(l.consultor)) falha(`${id}: consultor inválido`);
  if (!EMPRESAS_PROCESSO.includes(l.empresa)) falha(`${id}: empresa inválida`);
  if (!STATUS_PROCESSO_ORDER.includes(l.status)) falha(`${id}: status inválido`);
  if (l.status === "outro" && !l.status_outro) falha(`${id}: status outro sem texto`);
}
if (new Set(linhas.map((l) => l.id)).size !== linhas.length) falha("ids duplicados");
console.log(`Registros novos validados: ${linhas.length}`);

if (!COMMIT) {
  console.log("\nValidação OK. Rode com --commit para executar a carga.");
  process.exit(0);
}

// 4) UMA chamada à função. Sem retry.
console.log("\nChamando carga_follow_up (transação única)...");
const { data, error } = await db.rpc("carga_follow_up", {
  p_rows: linhas,
  p_esperado_atual: ESPERADO_ATUAL,
  p_max_updated_at: maxUpdatedAt,
  p_esperado_novo: ESPERADO_NOVO,
});
if (error) {
  console.error(`\nA FUNÇÃO ABORTOU: ${error.message}${error.details ? ` | ${error.details}` : ""}${error.hint ? ` | ${error.hint}` : ""}`);
  console.error("Sem retry e sem contorno. A função roda numa transação: nada deve ter sido apagado — confira a contagem.");
  const { count: depois } = await db.from("follow_up").select("*", { count: "exact", head: true });
  console.error(`Contagem atual da tabela: ${depois}`);
  process.exit(2);
}
console.log("Resultado da função:", JSON.stringify(data));
const { count: final } = await db.from("follow_up").select("*", { count: "exact", head: true });
console.log(`Contagem final da tabela: ${final}`);
