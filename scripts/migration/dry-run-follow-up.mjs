// DRY-RUN da carga do Follow-Up: lê scripts/migration/follow-up-source.txt, roda o
// parser e IMPRIME um relatório. NÃO acessa o banco, NÃO grava nada no Supabase.
//
// Única escrita em disco: o JSON dos registros planejados em
// scripts/migration/backups/ (pasta ignorada pelo git — contém dados de pacientes),
// para conferência manual por amostragem. Nunca commitar.
//
// Uso: node scripts/migration/dry-run-follow-up.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFollowUpSource } from "./followUpParser.mjs";
import {
  CONSULTORES_PROCESSO,
  DESPACHANTES_PROCESSO,
  EMPRESAS_PROCESSO,
  FORNECEDORES_PROCESSO,
  STATUS_PROCESSO_ORDER,
} from "../../shared/constants/processos.ts";
import { exigirAllowRealDbOuSair } from "../integration/_guardBancoReal.mjs";

// Script de migração/backup de dados REAIS (produção): só roda com ALLOW_REAL_DB=1, e a checagem
// vem antes de ler o .env ou abrir qualquer conexão (sai com código 1 e mensagem clara).
exigirAllowRealDbOuSair("dry-run-follow-up");

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONTE = join(CRM, "scripts", "migration", "follow-up-source.txt");

const { entradas, secoes, erros } = parseFollowUpSource(readFileSync(FONTE, "utf-8"));

const criar = entradas.filter((e) => e.record);
const puladas = entradas.filter((e) => !e.record);
const titulo = (s) => console.log(`\n${"=".repeat(78)}\n${s}\n${"=".repeat(78)}`);
const nomeSecao = (s) => (s.kind === "consultor" ? s.consultor : s.titulo);

titulo("DRY-RUN — NADA FOI GRAVADO NO BANCO");
console.log(`Arquivo-fonte: scripts/migration/follow-up-source.txt`);
console.log(`Seções: ${secoes.map((s) => `${s.titulo} [${s.kind}]`).join(" | ")}`);
if (erros.length) {
  console.log("\nERROS DE PARSING:");
  for (const e of erros) console.log(`  - ${e}`);
}

titulo("1. ENTRADAS ENCONTRADAS × SERÃO CRIADAS (por seção)");
for (const s of secoes) {
  const doS = entradas.filter((e) => e.secao === s);
  console.log(`  ${s.titulo.padEnd(34)} encontradas=${String(doS.length).padStart(2)}  criadas=${String(doS.filter((e) => e.record).length).padStart(2)}  puladas=${doS.filter((e) => !e.record).length}`);
}
console.log(`  ${"TOTAL".padEnd(34)} encontradas=${String(entradas.length).padStart(2)}  criadas=${String(criar.length).padStart(2)}  puladas=${puladas.length}`);

titulo("2. REGISTROS A CRIAR — por consultor");
for (const c of CONSULTORES_PROCESSO) {
  const n = criar.filter((e) => e.record.consultor === c).length;
  console.log(`  ${c.padEnd(18)} ${n}`);
}
console.log(`  ${"(sem consultor)".padEnd(18)} 0  — nenhum registro é criado sem consultor; os que ficariam sem estão em "puladas"`);
const semConsultor = puladas.filter((e) => e.motivos.some((m) => /consultor|Entregues/.test(m)));
for (const s of secoes) {
  const n = semConsultor.filter((e) => e.secao === s).length;
  if (n) console.log(`    sem consultor/ pasta na seção "${s.titulo}": ${n}`);
}

titulo("3. ENTRADAS PULADAS (cadastro manual / decisão sua)");
for (const e of puladas) {
  console.log(`\n  • ${e.paciente}  ${e.pasta ? `(${e.pasta})` : "(sem pasta)"}  — seção "${nomeSecao(e.secao)}", linha ${e.linha}`);
  for (const m of e.motivos) console.log(`      motivo: ${m}`);
  console.log(`      texto:  ${e.cabecalho}`);
  const st = e.corpo.find((l) => /^\s*Status\s*:/i.test(l));
  if (st) console.log(`      ${st.trim()}`);
}

titulo("4. COURIER SEM MODAL (modalEnvio VAZIO — você classifica Simples/Formal)");
const couriersTodos = entradas.filter((e) => e.courier);
const couriersClassificados = couriersTodos.filter((e) => e.recordParcial.modalEnvio);
const couriers = couriersTodos.filter((e) => !e.recordParcial.modalEnvio);
for (const e of couriers) {
  const r = e.recordParcial;
  const status = e.record ? "será criado" : "PULADO";
  console.log(`  • ${r.paciente} (${r.pasta}) — consultor ${r.consultor ?? "?"} — ${status}`);
  console.log(`      fornecedor="${r.fornecedor ?? ""}" modalEnvio="${r.modalEnvio ?? ""}" codigoRastreio="${r.codigoRastreio ?? ""}"`);
  for (const ev of e.courierEvidencia) console.log(`      texto: ${ev}`);
}
console.log(`  Total sem modal: ${couriers.length}`);
console.log(`  (courier JÁ classificado pelo texto: ${couriersClassificados.map((e) => `${e.recordParcial.paciente} (${e.recordParcial.pasta}) → ${e.recordParcial.modalEnvio}`).join("; ") || "nenhum"})`);

titulo("4b. REGISTROS COM STATUS 'outro' (statusOutro = texto literal do doc)");
for (const e of criar.filter((x) => x.record.status === "outro")) {
  const r = e.record;
  console.log(`  • ${r.paciente} (${r.pasta}) — consultor ${r.consultor}: status=outro  statusOutro="${r.statusOutro}"  pendências=${JSON.stringify(r.pendencias)}`);
}

titulo("5. OBSERVAÇÕES POR REGISTRO (decisões do parser que merecem conferência)");
for (const e of entradas.filter((x) => x.notas.length)) {
  console.log(`  • ${e.paciente} (${e.pasta ?? "sem pasta"})${e.record ? "" : "  [PULADO]"}`);
  for (const n of e.notas) console.log(`      - ${n}`);
}

titulo("6. LINHAS SEM CAMPO CORRESPONDENTE (foram para `atualizacoes`, nada descartado)");
const agreg = new Map();
for (const e of criar) {
  for (const f of e.fallback) {
    const chave = f.linha.replace(/\s+/g, " ").trim();
    if (/^mandado de seguran[cç]a/i.test(chave)) {
      agreg.set("(Mandado de segurança…)", (agreg.get("(Mandado de segurança…)") ?? 0) + 1);
      continue;
    }
    agreg.set(chave, (agreg.get(chave) ?? 0) + 1);
  }
}
for (const [linha, n] of agreg) console.log(`  ${String(n).padStart(2)}×  ${linha}`);

titulo("7. VALIDAÇÃO INTERNA DOS REGISTROS A CRIAR");
const problemas = [];
for (const e of criar) {
  const r = e.record;
  const id = `${r.paciente} (${r.pasta})`;
  if (!CONSULTORES_PROCESSO.includes(r.consultor)) problemas.push(`${id}: consultor inválido ${r.consultor}`);
  if (!EMPRESAS_PROCESSO.includes(r.empresa)) problemas.push(`${id}: empresa inválida ${r.empresa}`);
  if (!STATUS_PROCESSO_ORDER.includes(r.status)) problemas.push(`${id}: status inválido ${r.status}`);
  if (r.status === "outro" && !String(r.statusOutro ?? "").trim()) problemas.push(`${id}: status outro sem statusOutro`);
  if (r.status !== "outro" && r.statusOutro !== undefined) problemas.push(`${id}: statusOutro com status ${r.status}`);
  if (!r.paciente || !r.pasta) problemas.push(`${id}: paciente/pasta vazio`);
  if (JSON.stringify(r).includes('"ASD"')) problemas.push(`${id}: contém "ASD" como valor`);
}
const pk = new Map();
for (const e of criar) pk.set(`${e.record.pasta}|${e.record.ordem ?? ""}|${e.record.paciente}`, (pk.get(`${e.record.pasta}|${e.record.ordem ?? ""}|${e.record.paciente}`) ?? 0) + 1);
for (const [k, n] of pk) if (n > 1) problemas.push(`duplicado (pasta|ordem|paciente): ${k} ×${n}`);
console.log(problemas.length ? problemas.map((p) => `  - ${p}`).join("\n") : "  OK: consultor/empresa/status válidos, sem \"ASD\" gravado, sem duplicatas.");

const fornFora = [...new Set(criar.map((e) => e.record.fornecedor).filter((f) => f && !FORNECEDORES_PROCESSO.includes(f)))];
const despFora = [...new Set(criar.map((e) => e.record.despachante).filter((d) => d && !DESPACHANTES_PROCESSO.includes(d)))];
console.log(`  Fornecedores FORA do enum (literal): ${fornFora.length ? fornFora.join(", ") : "nenhum"}`);
console.log(`  Despachantes FORA do enum (literal): ${despFora.length ? despFora.join(", ") : "nenhum"}`);
const modais = {};
for (const e of criar) modais[e.record.modalEnvio ?? "(vazio)"] = (modais[e.record.modalEnvio ?? "(vazio)"] ?? 0) + 1;
console.log(`  modalEnvio: ${JSON.stringify(modais)}`);
const porStatus = {};
for (const e of criar) porStatus[e.record.status] = (porStatus[e.record.status] ?? 0) + 1;
console.log(`  status: ${JSON.stringify(porStatus)}`);

// JSON para conferência manual (pasta ignorada pelo git)
const dir = join(CRM, "scripts", "migration", "backups");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const agora = new Date();
const p = (n) => String(n).padStart(2, "0");
const carimbo = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}`;
const saida = join(dir, `follow_up-dryrun-${carimbo}.json`);
writeFileSync(saida, JSON.stringify(criar.map((e) => e.record), null, 2), "utf-8");
console.log(`\nRegistros planejados (para conferência, NÃO versionado): ${saida}`);
console.log("\nNADA foi gravado no banco. Aguardando sua confirmação.");
