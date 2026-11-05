// DRY-RUN da carga definitiva do Follow-Up (fonte de 2026-11-05). SOMENTE LEITURA:
//   * NÃO acessa o banco — compara com o ÚLTIMO BACKUP em scripts/migration/backups/ (gerado por
//     backup-follow-up.mjs, que só faz SELECT);
//   * NÃO grava nada além do relatório em scripts/migration/backups/ (pasta ignorada pelo git).
//
// Usa app/utils/prazoFornecedor.ts e prazoMandado.ts (alias #shared) → rodar com vite-node:
//   npx vite-node -c vitest.config.ts scripts/migration/dry-run-follow-up-2026-11.mjs
//
// Nenhum dado de paciente vai para o git: a saída é para o terminal e para backups/.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PASTAS_DEMO, chaveDe, linhaNoDoc, montarPlano, regraMandadoNovo } from "./followUpPlano.mjs";
import { norm } from "./followUpParser.mjs";
import { calcularNotificacoesFornecedor } from "../../app/utils/prazoFornecedor.ts";
import { calcularNotificacoesMandado } from "../../app/utils/prazoMandado.ts";
import {
  CONSULTORES_PROCESSO,
  DESPACHANTES_PROCESSO,
  FORNECEDORES_PROCESSO,
  STATUS_PROCESSO_ORDER,
} from "../../shared/constants/processos.ts";

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR_BK = join(CRM, "scripts", "migration", "backups");
const FONTE = join(CRM, "scripts", "migration", "follow-up-source-2026-11-05.txt");
const HOJE = new Date("2026-11-05T15:00:00.000Z"); // 05/11/2026 12:00 em Brasília

const saida = [];
const out = (s = "") => {
  console.log(s);
  saida.push(s);
};
const titulo = (s) => out(`\n${"=".repeat(78)}\n${s}\n${"=".repeat(78)}`);
const tabela = (cab, linhas) => {
  out(`| ${cab.join(" | ")} |`);
  out(`|${cab.map(() => "---").join("|")}|`);
  for (const l of linhas) out(`| ${l.map((c) => String(c ?? "").replace(/\|/g, "/")).join(" | ")} |`);
};
const contar = (arr, fn) => {
  const m = new Map();
  for (const x of arr) m.set(fn(x), (m.get(fn(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

// ── backup mais recente ──────────────────────────────────────────────────
const bks = readdirSync(DIR_BK)
  .filter((f) => /^follow_up-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f))
  .map((f) => ({ f, t: statSync(join(DIR_BK, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
const arquivoBackup = bks[0].f;
const backup = JSON.parse(readFileSync(join(DIR_BK, arquivoBackup), "utf-8"));

const texto = readFileSync(FONTE, "utf-8");
const plano = montarPlano({ texto, backup, ms: 1, agora: HOJE.toISOString() });
const { entradas, itens, puladas, reais, demo, permanecem, novos, apagados, duplicadas } = plano;

// ── 1. backup ────────────────────────────────────────────────────────────
titulo("1. BACKUP (somente leitura)");
out(`Arquivo: scripts/migration/backups/${arquivoBackup}`);
out(`Registros no backup: ${backup.length}  (reais: ${reais.length} | demo 901–904: ${demo.length})`);
out(`max(updated_at) do backup: ${backup.map((r) => r.updated_at).sort().at(-1)}`);

// ── 2. contagens ─────────────────────────────────────────────────────────
titulo("2. CONTAGENS");
out(`Seções: ${plano.parsed.secoes.map((s) => `${s.titulo} [${s.kind}]`).join(" | ")}`);
out(`Erros de parsing: ${plano.parsed.erros.length ? plano.parsed.erros.join(" ; ") : "nenhum"}`);
out(`Itens no Doc: ${entradas.length} | processos gerados: ${itens.length} | não interpretados (sem registro): ${puladas.length}`);
out(`Pastas distintas no Doc: ${new Set(entradas.map((e) => e.pasta)).size}`);
out(`Pastas repetidas (pasta+ordem diferentes): ${[...new Set(contar(entradas, (e) => e.pasta).filter(([, n]) => n > 1).map(([p]) => p))].join(", ") || "nenhuma"}`);
out(`Chaves (pasta+ordem) duplicadas: ${duplicadas.length ? duplicadas.join(", ") : "nenhuma"}`);
out("\nPor seção do Doc:");
tabela(["Seção", "Itens"], contar(entradas, (e) => e.secao.titulo));
out("\nPor consultor:");
tabela(["Consultor", "Processos"], contar(itens, (e) => e.record.consultor));
out("\nPor status:");
tabela(["Status", "Processos"], contar(itens, (e) => e.record.status));
out("\nPor empresa:");
tabela(["Empresa", "Processos"], contar(itens, (e) => e.record.empresa));
out("\nPor modal de envio:");
tabela(["Modal", "Processos"], contar(itens, (e) => e.record.modalEnvio ?? "(vazio)"));

// ── 3. comparação com o banco ────────────────────────────────────────────
titulo("3. COMPARAÇÃO COM O BANCO (chave = pasta + ordem; demo 901–904 fora)");
const pastasDb = new Set(reais.map((r) => r.pasta));
const pastasDoc = new Set(itens.map((e) => e.record.pasta));
tabela(
  ["", "pasta+ordem (processos)", "pastas distintas"],
  [
    ["Banco (reais)", reais.length, pastasDb.size],
    ["Doc", itens.length, pastasDoc.size],
    ["Permanecem (atualizados pelo Doc)", permanecem.length, new Set(permanecem.map((e) => e.record.pasta)).size],
    ["Novos", novos.length, new Set(novos.map((e) => e.record.pasta)).size],
    ["Serão apagados", apagados.length, new Set(apagados.map((r) => r.pasta)).size],
  ],
);
const fmt = (pasta, ordem) => `${pasta.replace("2026 - ", "")}${ordem ? ` (${ordem})` : ""}`;
out(`\nNovos (${novos.length}): ${novos.map((e) => fmt(e.record.pasta, e.record.ordem)).join(", ")}`);
out(`\nApagados (${apagados.length}): ${apagados.map((r) => `${fmt(r.pasta, r.ordem)} ${r.paciente}`).join(" | ")}`);
const esperadosApagar = ["234", "296", "313", "320", "326", "330", "332", "333", "334", "340", "341", "344", "345", "348", "349", "352", "360", "365", "372"];
const apagadosPastas = apagados.map((r) => r.pasta.replace("2026 - ", ""));
out(`\nLista esperada pela Cris (19): ${esperadosApagar.join(", ")}`);
out(`  fora do esperado (apagados pela chave pasta+ordem mas NÃO na lista): ${apagadosPastas.filter((p) => !esperadosApagar.includes(p)).map((p) => { const r = apagados.find((x) => x.pasta === `2026 - ${p}`); return fmt(r.pasta, r.ordem) + " " + r.paciente; }).join(", ") || "nenhum"}`);
out(`  esperados que NÃO serão apagados: ${esperadosApagar.filter((p) => !apagadosPastas.includes(p)).join(", ") || "nenhum"}`);
const pastasPermanecem = new Set(permanecem.map((e) => e.record.pasta));
out(`\nPastas do Doc que já existem no banco (por pasta, ignorando ordem): ${[...pastasDoc].filter((p) => pastasDb.has(p)).length}`);
out(`Pastas do Doc novas (por pasta): ${[...pastasDoc].filter((p) => !pastasDb.has(p)).length}`);

out("\nMudanças entre banco e Doc nos que permanecem (o Doc manda):");
const mud = [];
for (const e of permanecem) {
  const db = plano.dbPorChave.get(chaveDe(e.record.pasta, e.record.ordem));
  const r = e.record;
  const difs = [];
  if (db.status !== r.status) difs.push(`status ${db.status} → ${r.status}`);
  if (db.consultor !== r.consultor) difs.push(`consultor ${db.consultor} → ${r.consultor}`);
  if (db.paciente !== r.paciente) difs.push(`paciente "${db.paciente}" → "${r.paciente}"`);
  if (db.empresa !== r.empresa) difs.push(`empresa ${db.empresa} → ${r.empresa}`);
  if ((db.fornecedor ?? "") !== (r.fornecedor ?? "")) difs.push(`fornecedor "${db.fornecedor ?? ""}" → "${r.fornecedor ?? ""}"`);
  if ((db.despachante ?? "") !== (r.despachante ?? "")) difs.push(`despachante "${db.despachante ?? ""}" → "${r.despachante ?? ""}"`);
  if (difs.length) mud.push([fmt(r.pasta, r.ordem), r.paciente, difs.join("; ")]);
}
tabela(["Pasta", "Paciente", "O que muda"], mud);

out("\nEdições feitas NO SISTEMA depois da 1ª carga (updated_at ≠ created_at) — o Doc sobrescreve tudo, exceto as flags (que a carga preserva):");
const editados = reais.filter((r) => r.updated_at !== r.created_at);
const linhasEd = editados.map((r) => {
  const e = permanecem.find((x) => chaveDe(x.record.pasta, x.record.ordem) === chaveDe(r.pasta, r.ordem));
  if (!e) return [fmt(r.pasta, r.ordem), r.paciente, r.updated_at.slice(0, 16), "APAGADO (não está no Doc)"];
  const rec = e.record;
  const difs = [];
  const docAtt = new Set(rec.atualizacoes.map((a) => a.texto));
  const perdidas = (r.atualizacoes ?? []).filter((a) => !docAtt.has(a.texto));
  if (perdidas.length) difs.push(`${perdidas.length} atualização(ões) do banco que o Doc não tem: ${perdidas.map((a) => `"${a.texto}"`).join(", ")}`);
  const pend = new Set(rec.pendencias);
  const pp = (r.pendencias ?? []).filter((p) => !pend.has(p));
  if (pp.length) difs.push(`pendências do banco ausentes no Doc: ${pp.join(" ; ")}`);
  difs.push("flags preservadas: " + `fornecedor=${r.alerta_fornecedor_resolvido} mandado=${r.alerta_mandado_resolvido}`);
  return [fmt(r.pasta, r.ordem), r.paciente, r.updated_at.slice(0, 16), difs.join(" | ")];
});
tabela(["Pasta", "Paciente", "Última edição (UTC)", "Efeito da carga"], linhasEd);

// ── 4. itens/linhas sem interpretação segura ─────────────────────────────
titulo("4. NÃO INTERPRETADO COM SEGURANÇA");
out(`Itens SEM registro (motivos): ${puladas.length ? "" : "nenhum — todos os 82 itens geraram registro"}`);
for (const e of puladas) out(`  - linha ${e.linha}: ${e.cabecalho} → ${e.motivos.join("; ")}`);
out("\nLinhas que não casaram com campo (foram para `atualizacoes`, texto ORIGINAL; nada foi inventado):");
const loose = [];
for (const e of itens) {
  for (const f of e.fallback) {
    loose.push([linhaNoDoc(e, f.linha) ?? "?", fmt(e.pasta, e.record.ordem), e.record.paciente, f.motivo, f.linha]);
  }
}
tabela(["Linha Doc", "Pasta", "Paciente", "Motivo", "Texto"], loose);
out(`\nTotal: ${loose.length} linhas em ${new Set(loose.map((l) => l[1] + l[2])).size} itens`);
out("\nNotas do parser por item (decisões que merecem conferência):");
for (const e of entradas.filter((x) => x.notas.length)) {
  out(`  • ${fmt(e.pasta, e.record?.ordem)} ${e.paciente} (linha ${e.linha})`);
  for (const n of e.notas) out(`      - ${n}`);
}

// ── 5. valores novos ─────────────────────────────────────────────────────
titulo("5. VALORES FORA DAS LISTAS DO SISTEMA");
const usadosBanco = (campo) => contar(reais, (r) => r[campo] ?? "(vazio)");
out("Consultores (rótulo no título do item ou seção):");
tabela(
  ["Consultor usado", "Itens no Doc", "Na lista do app/enum do Postgres?"],
  contar(itens, (e) => e.record.consultor).map(([c, n]) => [c, n, CONSULTORES_PROCESSO.includes(c) ? "sim" : "NÃO"]),
);
out(`Rótulos do cabeçalho do grupo: ${plano.parsed.secoes.filter((s) => s.kind === "grupo").map((s) => s.pessoas.join(" / ")).join(" || ")}`);
out(`  → "Rodrigão" e "Daniel" estão só no cabeçalho (nenhum item usa); itens usam "Dani". Paulinho não tem item.`);

out("\nFornecedores (valor que será gravado):");
const fornFixos = FORNECEDORES_PROCESSO.filter((f) => f !== "Outro");
const fornDoc = contar(itens, (e) => e.record.fornecedor ?? "(vazio)");
const fornBanco = new Map(usadosBanco("fornecedor"));
tabela(
  ["Fornecedor", "Itens no Doc", "Na lista fixa?", "Já usado no banco (reais)?"],
  fornDoc.map(([f, n]) => [f, n, fornFixos.includes(f) ? "sim" : f === "(vazio)" ? "-" : 'NÃO (cai em "Outro" + texto)', fornBanco.get(f) ? `sim (${fornBanco.get(f)})` : "não"]),
);

out("\nDespachantes (valor que será gravado):");
const despBanco = new Map(usadosBanco("despachante"));
tabela(
  ["Despachante", "Itens no Doc", "Na lista fixa?", "Já usado no banco (reais)?"],
  contar(itens, (e) => e.record.despachante ?? "(vazio)").map(([d, n]) => [d, n, DESPACHANTES_PROCESSO.includes(d) ? "sim" : d === "(vazio)" ? "-" : "NÃO", despBanco.get(d) ? `sim (${despBanco.get(d)})` : "não"]),
);
out("\nDespachante — texto cru do Doc (variantes com texto extra e grafias):");
const despCru = [];
for (const e of entradas) for (const l of e.corpo) { const m = l.trim().match(/^Despachante\s*:\s*(.*)$/i); if (m) despCru.push(m[1].trim()); }
tabela(["Texto no Doc", "Itens"], contar(despCru, (x) => x));
out("\nFornecedor — texto cru do Doc:");
const fornCru = [];
for (const e of entradas) for (const l of e.corpo) { const m = l.trim().match(/^Fornecedor[^:]*:\s*(.*)$/i); if (m) fornCru.push(m[1].trim()); }
tabela(["Texto no Doc", "Itens"], contar(fornCru, (x) => x));

// possíveis erros de grafia: fornecedores literais parecidos entre si (Levenshtein ≤ 2)
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const literais = [...new Set([...fornDoc.map(([f]) => f), ...fornBanco.keys()])].filter((f) => f !== "(vazio)");
out("\nPossíveis erros de grafia (nomes parecidos):");
const suspeitos = [];
for (let i = 0; i < literais.length; i++) for (let j = i + 1; j < literais.length; j++) {
  if (lev(norm(literais[i]), norm(literais[j])) <= 2) suspeitos.push(`"${literais[i]}" x "${literais[j]}"`);
}
out(`  fornecedores: ${suspeitos.join(", ") || "nenhum"}`);
out(`  despachantes: "Andreza" / "Andreza Faconi" (mesma pessoa pela regra aprovada) x "Andreza Bernardes" (outra pessoa? mantido literal)`);
out(`  rótulos: ${entradas.flatMap((e) => e.notas.filter((n) => /DUMP/.test(n)).map((n) => `${e.paciente} (${e.pasta}): ${n}`)).join(" ; ") || "nenhum"}`);

// ── 6. campos do Doc sem coluna ──────────────────────────────────────────
titulo("6. CAMPOS DO DOC E ONDE CAEM");
const linhasDe = (re) => {
  const r = [];
  for (const e of entradas) for (const l of e.corpo) if (re.test(l.trim().replace(/^\*+\s*/, ""))) r.push({ e, l: l.trim() });
  return r;
};
const resumo = (nome, re, destino) => {
  const r = linhasDe(re);
  out(`  ${nome.padEnd(34)} linhas=${String(r.length).padStart(2)}  itens=${String(new Set(r.map((x) => x.e.linha)).size).padStart(2)}  → ${destino}`);
  return r;
};
resumo("Obs.:", /^Obs\.?\s*:/i, "atualizacoes {data:'', texto:'Obs.: …'}");
resumo("Protocolo:", /^Protocolo\s*:/i, "atualizacoes (texto com o rótulo)");
resumo("Protocolo solto (data Protocolo: n)", /^\d{1,2}\/\d{1,2}\s+Protocolo\s*:/i, "atualizacoes (linha solta com data)");
resumo("Documentos de embarque[ X]:", /^Documentos de embarque/i, "atualizacoes (texto original com o rótulo)");
resumo("Suposta estimativa:", /^Suposta estimativa\s*:/i, "COLUNA suposta_estimativa (existe)");
resumo("Data de embarque:", /^Data de embarque\s*:/i, "COLUNA data_embarque (existe)");
resumo("Status <medicamento>:", /^Status\s+\S+.*:/i, "coluna status (sufixo descartado após conferir que é o medicamento do item)");
resumo("Fornecedor <medicamento>:", /^Fornecedor\s+\S+.*:/i, "coluna fornecedor (idem)");
resumo("Previsão de entrega <medicamento>:", /^Previs[ãa]o de entrega\s+\S+.*:/i, "coluna previsao_entrega (idem)");
resumo("Medicamento 1/2/3:", /^Medicamento\s+\d+\s*:/i, "medicamentos[] (jsonb)");
out("\nItens com 2+ medicamentos: " + itens.filter((e) => e.record.medicamentos.length > 1).length);
out("Itens com Obs. em mais de uma linha: " + [...contar(linhasDe(/^Obs\.?\s*:/i), (x) => x.e.linha).filter(([, n]) => n > 1)].length);
out("\nItens com rótulo de medicamento (Status/Fornecedor/Previsão/Docs …):");
for (const e of entradas.filter((x) => x.notas.some((n) => /sufixo = nome do medicamento/.test(n)))) {
  out(`  • ${fmt(e.pasta, e.record?.ordem)} ${e.paciente}: ${e.notas.filter((n) => /sufixo/.test(n)).join(" | ")}`);
}
out("\nLinhas soltas logo após o Nº do processo (ou fora do padrão) — textos distintos:");
const soltas = loose.map((l) => l[4]);
tabela(["Texto", "Ocorrências"], contar(soltas, (x) => x.replace(/\d{1,2}\/\d{1,2}/g, "DD/MM")).slice(0, 80));

// ── 7. status ────────────────────────────────────────────────────────────
titulo("7. STATUS — variantes do Doc e mapeamento");
const stRaw = [];
for (const e of entradas) {
  const l = e.corpo.find((x) => /^\s*Status\b[^:]*:/i.test(x));
  if (l) stRaw.push({ cru: l.trim().replace(/^Status[^:]*:\s*/i, ""), rec: e.record });
}
tabela(
  ["Texto no Doc", "Itens", "→ status", "status_outro", "pendência gerada"],
  contar(stRaw, (x) => x.cru).map(([cru, n]) => {
    const rec = stRaw.find((x) => x.cru === cru).rec;
    const st = rec.status;
    const pend = rec.pendencias.find((p) => cru.toLowerCase().includes(p.toLowerCase().slice(0, 12))) ?? "";
    return [cru, n, st, rec.statusOutro ?? "", pend];
  }),
);

// ── 8. flags ─────────────────────────────────────────────────────────────
titulo("8. FLAGS DE ALERTA");
out("Processos REAIS do banco com marca (os 'apagados' perdem a marca junto com o processo):");
tabela(
  ["Pasta", "Ordem", "Paciente", "alerta_fornecedor_resolvido", "alerta_mandado_resolvido", "Situação"],
  plano.flagsReais.map((f) => [f.pasta, f.ordem, f.paciente, f.fornecedor, f.mandado, f.permanece ? "PERMANECE → marca devolvida" : "apagado"]),
);
out(`\nTotais no banco (reais): fornecedor=${plano.flagsReais.filter((f) => f.fornecedor).length} | mandado=${plano.flagsReais.filter((f) => f.mandado).length}`);
out(`Que permanecem: fornecedor=${plano.flagsReais.filter((f) => f.fornecedor && f.permanece).length} | mandado=${plano.flagsReais.filter((f) => f.mandado && f.permanece).length}`);
out("\nNovos com alerta_mandado_resolvido = true pela regra (desembaraço + LPCO + 'mandado' no texto):");
const novosMandado = novos.filter((e) => plano.flagsDe(e).mandado);
tabela(["Pasta", "Paciente", "Registro LPCO"], novosMandado.map((e) => [fmt(e.record.pasta, e.record.ordem), e.record.paciente, e.record.datas.registroLpco]));
out(`Novos: ${novos.length} | mandado=true: ${novosMandado.length} | demais: false (fornecedor=false em todos)`);

// ── 9. simulação dos alertas ─────────────────────────────────────────────
titulo("9. SIMULAÇÃO DOS ALERTAS — hoje = 05/11/2026 (lógica atual de prazoFornecedor.ts e prazoMandado.ts)");
const comoProcesso = (rec, id, flags) => ({
  id,
  paciente: rec.paciente,
  pasta: rec.pasta,
  fornecedor: rec.fornecedor,
  status: rec.status,
  datas: rec.datas ?? {},
  responsavelOperacional: rec.responsavelOperacional,
  alertaFornecedorResolvido: flags.fornecedor,
  alertaMandadoResolvido: flags.mandado,
});
// Se o payload gerado existe, a simulação usa AS LINHAS DO PAYLOAD (o que será de fato carregado, com as
// flags e opções escolhidas); senão usa o plano padrão.
const ARQ_PAYLOAD = join(DIR_BK, "carga-follow-up-2026-11-05.payload.json");
let payloadCarga = null;
try {
  payloadCarga = JSON.parse(readFileSync(ARQ_PAYLOAD, "utf-8"));
} catch {}
if (payloadCarga) {
  const confere = payloadCarga.length === itens.length && payloadCarga.every((l, i) => l.pasta === itens[i].record.pasta && (l.ordem ?? "") === (itens[i].record.ordem ?? ""));
  if (!confere) throw new Error("payload gerado não corresponde à fonte atual — rode gerar-carga-follow-up-2026-11.mjs de novo");
}
out(payloadCarga ? "Fonte da simulação: payload gerado (carga-follow-up-2026-11-05.payload.json)" : "Fonte da simulação: plano padrão (payload não encontrado)");
const apos = payloadCarga
  ? payloadCarga.map((l, i) => ({
      id: `n${i}`,
      paciente: l.paciente,
      pasta: l.pasta,
      fornecedor: l.fornecedor ?? undefined,
      status: l.status,
      datas: { dataCompraPO: l.data_compra_po ?? undefined, aberturaThread: l.abertura_thread ?? undefined, registroLpco: l.registro_lpco ?? undefined },
      responsavelOperacional: l.responsavel_operacional ?? undefined,
      alertaFornecedorResolvido: l.alerta_fornecedor_resolvido === true,
      alertaMandadoResolvido: l.alerta_mandado_resolvido === true,
    }))
  : itens.map((e, i) => comoProcesso(e.record, `n${i}`, plano.flagsDe(e)));
const porId = new Map(apos.map((p, i) => [p.id, itens[i]]));
const fornAlertas = calcularNotificacoesFornecedor(apos, HOJE);
const mandAlertas = calcularNotificacoesMandado(apos, HOJE);
out(`DEPOIS da carga — fornecedor: ${fornAlertas.length} | Mandado: ${mandAlertas.length}`);
out("\nAlertas de FORNECEDOR (visíveis a quem tem acesso de escrita em Processos — NotificacaoBell: canWrite('processos'); não filtram por responsável):");
tabela(
  ["Pasta", "Paciente", "Responsável (op.)", "Motivo"],
  fornAlertas.map((n) => {
    const r = porId.get(n.processoId).record;
    return [fmt(r.pasta, r.ordem), n.paciente, r.responsavelOperacional ?? "-", `${n.fornecedor}: compra ${r.datas.dataCompraPO}, sem abertura de thread, ${n.diasDeAtraso} dia(s) de atraso`];
  }),
);
out("\nAlertas de MANDADO (visíveis: administrador = todos; operacional = só os dele):");
tabela(
  ["Pasta", "Paciente", "Responsável (op.)", "Motivo"],
  mandAlertas.map((n) => {
    const r = porId.get(n.processoId).record;
    return [fmt(r.pasta, r.ordem), n.paciente, n.responsavel || "(sem responsável)", `LPCO registrado em ${n.registroDDMM} (${n.diasDecorridos} dias), status desembaraço, sem marca de resolvido`];
  }),
);
out("\nPor responsável (Mandado): " + contar(mandAlertas, (n) => n.responsavel || "(sem)").map(([r, n]) => `${r}=${n}`).join(", "));

// "antes": estado do sino HOJE com o banco atual (mesma lógica)
const antes = reais.map((r) => ({
  id: r.id,
  paciente: r.paciente,
  pasta: r.pasta,
  fornecedor: r.fornecedor ?? undefined,
  status: r.status,
  datas: { dataCompraPO: r.data_compra_po ?? undefined, aberturaThread: r.abertura_thread ?? undefined, registroLpco: r.registro_lpco ?? undefined },
  responsavelOperacional: r.responsavel_operacional ?? undefined,
  alertaFornecedorResolvido: r.alerta_fornecedor_resolvido === true,
  alertaMandadoResolvido: r.alerta_mandado_resolvido === true,
}));
out(`\nANTES (banco atual, mesma lógica, hoje) — fornecedor: ${calcularNotificacoesFornecedor(antes, HOJE).length} | Mandado: ${calcularNotificacoesMandado(antes, HOJE).length}`);

out("\nDos alertas de DEPOIS, quais são de processos NOVOS e quais de que permanecem:");
const ehNovo = (n) => novos.includes(porId.get(n.processoId));
out(`  fornecedor: novos=${fornAlertas.filter(ehNovo).length} | permanecem=${fornAlertas.filter((n) => !ehNovo(n)).length}`);
out(`  Mandado:    novos=${mandAlertas.filter(ehNovo).length} | permanecem=${mandAlertas.filter((n) => !ehNovo(n)).length}`);

// Alternativas para não inundar o sino (NÃO aplicadas no payload padrão):
out("\nALTERNATIVAS (para decidir; o payload padrão segue a instrução original):");
const mandadoRegraTodos = apos.map((p, i) => ({
  ...p,
  alertaMandadoResolvido: p.alertaMandadoResolvido || regraMandadoNovo(itens[i].record),
}));
const mandB = calcularNotificacoesMandado(mandadoRegraTodos, HOJE);
out(`  B) aplicar a regra da migration 20261028 TAMBÉM aos que permanecem com flag false → Mandado: ${mandB.length} (${contar(mandB, (n) => n.responsavel).map(([r, n]) => `${r}=${n}`).join(", ")})`);
for (const n of mandB) out(`       ${porId.get(n.processoId).record.pasta.replace("2026 - ", "")} ${n.paciente} — ${n.responsavel} — LPCO ${n.registroDDMM}`);
out(`     (a regra marcaria como resolvidos ${mandadoRegraTodos.filter((p, i) => p.alertaMandadoResolvido && !apos[i].alertaMandadoResolvido).length} processos que permanecem, além dos ${apos.filter((p) => p.alertaMandadoResolvido).length} já marcados)`);
out(`  C) marcar alerta_fornecedor_resolvido=true nos ${fornAlertas.length} novos com alerta → fornecedor: 0 (os prazos voltam a valer só se alguém reabrir)`);

// ── 10. validação interna ────────────────────────────────────────────────
titulo("VALIDAÇÃO INTERNA");
const probs = [];
for (const e of itens) {
  const r = e.record;
  const id = `${r.paciente} (${r.pasta}${r.ordem ? " " + r.ordem : ""})`;
  if (!CONSULTORES_PROCESSO.includes(r.consultor)) probs.push(`${id}: consultor inválido ${r.consultor}`);
  if (!STATUS_PROCESSO_ORDER.includes(r.status)) probs.push(`${id}: status inválido ${r.status}`);
  if (r.status === "outro" && !String(r.statusOutro ?? "").trim()) probs.push(`${id}: outro sem texto`);
  if (PASTAS_DEMO.includes(r.pasta)) probs.push(`${id}: pasta demo`);
  if (JSON.stringify(r).includes('"ASD"')) probs.push(`${id}: ASD como valor`);
}
for (const k of duplicadas) probs.push(`chave duplicada ${k}`);
out(probs.length ? probs.map((p) => "  - " + p).join("\n") : "  OK: consultor/status válidos, sem demo, sem ASD gravado, sem chave duplicada.");

writeFileSync(join(DIR_BK, "relatorio-dry-run-follow-up-2026-11-05.txt"), saida.join("\n"), "utf-8");
out("\nRelatório salvo em scripts/migration/backups/relatorio-dry-run-follow-up-2026-11-05.txt (ignorado pelo git). NADA foi gravado no banco.");
