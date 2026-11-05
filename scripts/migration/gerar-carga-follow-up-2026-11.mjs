// GERA (não executa) o payload e o SQL da recarga do Follow-Up de 2026-11-05.
// NÃO acessa o banco: usa o último backup em scripts/migration/backups/ e a fonte nova.
// Saída (ignorada pelo git — contém dados de pacientes), em scripts/migration/backups/:
//   carga-follow-up-2026-11-05.payload.json   linhas completas (37 colunas) na ordem do Doc
//   carga-follow-up-2026-11-05.sql            função + chamada (+ DROP comentado) para aplicar via MCP
//
// Rodar com vite-node (alias #shared):
//   npx vite-node -c vitest.config.ts scripts/migration/gerar-carga-follow-up-2026-11.mjs [opções]
//
// Opções (todas OPCIONAIS; o padrão segue exatamente a instrução da Cris):
//   --manter "2026 - 11|Ordem 1"   não apaga esse processo do banco (pasta|ordem); repetível
//   --regra-mandado-todos          aplica a regra da migration 20261028 também aos que permanecem
//   --marcar-fornecedor-novos      alerta_fornecedor_resolvido=true nos novos que hoje disparariam alerta

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PASTAS_DEMO, chaveDe, montarPlano, regraMandadoNovo } from "./followUpPlano.mjs";
import { COLUNAS_FOLLOW_UP } from "./followUpRows.mjs";
import { calcularNotificacoesFornecedor } from "../../app/utils/prazoFornecedor.ts";
import { isValidProcessoPayload } from "../../server/utils/processoValidation.ts";

const args = process.argv.slice(2);
const manter = args.flatMap((a, i) => (a === "--manter" ? [args[i + 1]] : []));
const REGRA_TODOS = args.includes("--regra-mandado-todos");
const MARCAR_FORN = args.includes("--marcar-fornecedor-novos");

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR_BK = join(CRM, "scripts", "migration", "backups");
const FONTE = join(CRM, "scripts", "migration", "follow-up-source-2026-11-05.txt");
const HOJE = new Date("2026-11-05T15:00:00.000Z");

function falha(msg) {
  console.error(`\nABORTADO: ${msg}\nNada foi gerado.`);
  process.exit(1);
}

const bk = readdirSync(DIR_BK)
  .filter((f) => /^follow_up-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f))
  .map((f) => ({ f, t: statSync(join(DIR_BK, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!bk) falha("nenhum backup encontrado — rode backup-follow-up.mjs");
const backup = JSON.parse(readFileSync(join(DIR_BK, bk.f), "utf-8"));
const maxUpdatedAt = backup.map((r) => r.updated_at).sort().at(-1);

const ms = Date.now();
const agora = new Date(ms).toISOString();
const plano = montarPlano({ texto: readFileSync(FONTE, "utf-8"), backup, ms, agora });
const { itens, linhas, reais, apagados } = plano;

// ── validações ───────────────────────────────────────────────────────────
if (plano.puladas.length) falha(`${plano.puladas.length} item(ns) sem registro (não interpretados)`);
if (plano.duplicadas.length) falha(`chaves pasta+ordem duplicadas: ${plano.duplicadas.join(", ")}`);
if (plano.parsed.erros.length) falha(`erros de parsing: ${plano.parsed.erros.join(" ; ")}`);
for (const l of linhas) {
  if (Object.keys(l).join() !== COLUNAS_FOLLOW_UP.join()) falha(`${l.paciente}: colunas fora do esperado`);
  if (PASTAS_DEMO.includes(l.pasta)) falha(`${l.pasta}: pasta demo no payload`);
}
for (const e of itens) if (!isValidProcessoPayload(e.record)) falha(`${e.record.pasta}: registro reprovado pela validação da API`);
if (new Set(linhas.map((l) => l.id)).size !== linhas.length) falha("ids duplicados");

// ── opções ───────────────────────────────────────────────────────────────
if (REGRA_TODOS) itens.forEach((e, i) => { if (regraMandadoNovo(e.record)) linhas[i].alerta_mandado_resolvido = true; });
if (MARCAR_FORN) {
  const procs = itens.map((e, i) => ({ id: String(i), paciente: e.record.paciente, pasta: e.record.pasta, fornecedor: e.record.fornecedor, datas: e.record.datas, alertaFornecedorResolvido: linhas[i].alerta_fornecedor_resolvido }));
  for (const n of calcularNotificacoesFornecedor(procs, HOJE)) {
    const i = Number(n.processoId);
    if (plano.novos.includes(itens[i])) linhas[i].alerta_fornecedor_resolvido = true;
  }
}

const preservarIds = [];
for (const k of manter) {
  const row = reais.find((r) => chaveDe(r.pasta, r.ordem) === k);
  if (!row) falha(`--manter "${k}": não existe no banco`);
  if (!apagados.includes(row)) falha(`--manter "${k}": esse processo já permanece (está no Doc)`);
  preservarIds.push(row.id);
}
const esperadoApagar = apagados.length - preservarIds.length;

// ── saída ────────────────────────────────────────────────────────────────
const payloadJson = JSON.stringify(linhas);
const tag = "carga_json";
if (payloadJson.includes(`$${tag}$`)) falha("payload contém o delimitador do dollar-quote");

const funcao = readFileSync(join(CRM, "scripts", "migration", "carga-follow-up-2026-11.sql"), "utf-8");
const sql = `-- GERADO em ${agora} por gerar-carga-follow-up-2026-11.mjs — NÃO versionar (dados de pacientes).
-- Backup de referência: ${bk.f} (${backup.length} registros, max(updated_at) ${maxUpdatedAt}).
-- Opções: manter=${JSON.stringify(manter)} regra-mandado-todos=${REGRA_TODOS} marcar-fornecedor-novos=${MARCAR_FORN}
-- Se QUALQUER pessoa editar o Follow-Up antes de aplicar, a função aborta (trava de max(updated_at)): gere de novo.

${funcao}

select public.carga_follow_up_2026_11(
  $${tag}$${payloadJson}$${tag}$::jsonb,
  ${backup.length},
  '${maxUpdatedAt}'::timestamptz,
  ${esperadoApagar},
  ${linhas.length},
  array[${preservarIds.map((id) => `'${id}'`).join(", ")}]::text[]
);

-- Conferência depois (somente leitura):
-- select count(*) as total, count(*) filter (where pasta in ('2026 - 901','2026 - 902','2026 - 903','2026 - 904')) as demo from public.follow_up;
-- Remover a função (rode DEPOIS de conferir):
-- drop function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]);
`;

writeFileSync(join(DIR_BK, "carga-follow-up-2026-11-05.payload.json"), JSON.stringify(linhas, null, 2), "utf-8");
writeFileSync(join(DIR_BK, "carga-follow-up-2026-11-05.sql"), sql, "utf-8");

console.log("Gerado (NADA executado):");
console.log(`  scripts/migration/backups/carga-follow-up-2026-11-05.sql          (${(sql.length / 1024).toFixed(0)} KB)`);
console.log(`  scripts/migration/backups/carga-follow-up-2026-11-05.payload.json`);
console.log(`Backup de referência: ${bk.f} → ${backup.length} registros (reais ${reais.length} + demo ${plano.demo.length}), max(updated_at) ${maxUpdatedAt}`);
console.log(`Apaga ${esperadoApagar} | preserva ${preservarIds.length} extra(s) | insere ${linhas.length} | demo intactos ${plano.demo.length} | total final esperado ${plano.demo.length + preservarIds.length + linhas.length}`);
console.log(`Flags no payload: fornecedor=true em ${linhas.filter((l) => l.alerta_fornecedor_resolvido).length}, mandado=true em ${linhas.filter((l) => l.alerta_mandado_resolvido).length}`);
