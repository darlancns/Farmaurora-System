// Smoke test do processosStore (tabela única follow_up). Espelha colunasDeDTO /
// montarProcesso do store e roda contra o banco real. Usa id "TESTE_..." e
// apaga tudo no final — não deixa lixo junto dos 45 processos reais.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Raiz do projeto (crm/) — 2 níveis acima de scripts/integration/.
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(`${CRM}/.env`, "utf-8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const T = "follow_up";

let failures = 0;
const check = (label, cond) => { console.log(`${cond ? "  ok " : "FAIL"} ${label}`); if (!cond) failures++; };
function must(label, { error }) {
  if (error) { console.log(`FAIL ${label}: ${error.message}`); failures++; throw new Error(error.message); }
}
// normaliza p/ comparar (ordena chaves recursivamente)
function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
  }
  return v;
}
const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ── espelho de colunasDeDTO ──────────────────────────────────────────────
function colunasDeDTO(src) {
  const col = {};
  const S = ["paciente", "pasta", "empresa", "consultor", "status"];
  for (const k of S) if (k in src) col[k] = src[k];
  const M = {
    ordem: "ordem", responsavelOperacional: "responsavel_operacional", despachante: "despachante",
    fornecedor: "fornecedor", modalEnvio: "modal_envio", companhiaAerea: "companhia_aerea",
    numeroAwb: "numero_awb", codigoRastreio: "codigo_rastreio", localEntrega: "local_entrega",
    numeroProcesso: "numero_processo", statusPagamento: "status_pagamento",
  };
  for (const [k, c] of Object.entries(M)) if (k in src) col[c] = src[k] ?? null;
  if ("alertaFornecedorResolvido" in src) col.alerta_fornecedor_resolvido = src.alertaFornecedorResolvido ?? false;
  if ("medicamentos" in src) col.medicamentos = src.medicamentos ?? [];
  if ("pendencias" in src) col.pendencias = src.pendencias ?? [];
  if ("atualizacoes" in src) col.atualizacoes = src.atualizacoes ?? [];
  if ("datas" in src) {
    const d = src.datas ?? {};
    col.data_compra_po = d.dataCompraPO ?? null;
    col.data_embarque = d.dataEmbarque ?? null;
    col.abertura_thread = d.aberturaThread ?? null;
    col.data_chegada_brasil = d.dataChegadaBrasil ?? null;
    col.registro_radar = d.registroRadar ?? null;
    col.registro_duimp = d.registroDuimp ?? null;
    col.registro_lpco = d.registroLpco ?? null;
    col.previsao_entrega = d.previsaoEntrega ?? null;
    col.suposta_estimativa = d.supostaEstimativa ?? null;
  }
  if ("transportadoraNacional" in src) {
    const t = src.transportadoraNacional;
    col.transportadora_nacional_nome = t?.nome ?? null;
    col.transportadora_nacional_cotacao = t?.cotacao ?? null;
    col.transportadora_nacional_valor = t?.valor ?? null;
  }
  return col;
}
// ── espelho de montarProcesso ───────────────────────────────────────────
function montarProcesso(row) {
  const datas = {};
  const D = {
    data_compra_po: "dataCompraPO", data_embarque: "dataEmbarque", abertura_thread: "aberturaThread",
    data_chegada_brasil: "dataChegadaBrasil", registro_radar: "registroRadar", registro_duimp: "registroDuimp",
    registro_lpco: "registroLpco", previsao_entrega: "previsaoEntrega", suposta_estimativa: "supostaEstimativa",
  };
  for (const [c, k] of Object.entries(D)) if (row[c] != null) datas[k] = row[c];
  const p = {
    id: row.id, paciente: row.paciente, pasta: row.pasta, empresa: row.empresa, consultor: row.consultor,
    medicamentos: (row.medicamentos ?? []).map((m) => ({ ...m })),
    status: row.status, datas,
    pendencias: row.pendencias ?? [],
    atualizacoes: (row.atualizacoes ?? []).map((a) => ({ ...a })),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
  const O = {
    ordem: "ordem", responsavel_operacional: "responsavelOperacional", despachante: "despachante",
    fornecedor: "fornecedor", modal_envio: "modalEnvio", companhia_aerea: "companhiaAerea",
    numero_awb: "numeroAwb", codigo_rastreio: "codigoRastreio", local_entrega: "localEntrega",
    numero_processo: "numeroProcesso", status_pagamento: "statusPagamento",
  };
  for (const [c, k] of Object.entries(O)) if (row[c] != null) p[k] = row[c];
  if (row.alerta_fornecedor_resolvido === true) p.alertaFornecedorResolvido = true;
  if (row.transportadora_nacional_nome != null) {
    const tn = { nome: row.transportadora_nacional_nome };
    if (row.transportadora_nacional_cotacao != null) tn.cotacao = row.transportadora_nacional_cotacao;
    if (row.transportadora_nacional_valor != null) tn.valor = Number(row.transportadora_nacional_valor);
    p.transportadoraNacional = tn;
  }
  return p;
}

async function lerRow(id) {
  const { data, error } = await db.from(T).select("*").eq("id", id).maybeSingle();
  must("select", { error });
  return data;
}
async function insert(id, dto) {
  const now = new Date().toISOString();
  return db.from(T).insert({ id, ...colunasDeDTO(dto), created_at: now, updated_at: now });
}
async function patch(id, p) {
  return db.from(T).update({ ...colunasDeDTO(p), updated_at: new Date().toISOString() }).eq("id", id).select("*");
}

const idA = `TESTE_${Date.now()}_A`;
const idB = `TESTE_${Date.now()}_B`;
const idC = `TESTE_${Date.now()}_C`;

try {
  // ── A: completo (datas parciais, transportadora, 2 med, 2 atu, 1 pend) ───
  const dtoA = {
    paciente: "TESTE Processo Completo", pasta: "2026 - T01",
    empresa: "FARMAURORA", consultor: "Mateus Morais", status: "em_transito",
    responsavelOperacional: "Bruno", despachante: "Bruno Lopes", fornecedor: "Pharyx",
    modalEnvio: "Courier", localEntrega: "SP",
    transportadoraNacional: { nome: "AJC", cotacao: "USD/BRL 5,10", valor: 1234.56 },
    medicamentos: [
      { nome: "MED A", dosagem: "10mg", quantidade: "2" },
      { nome: "MED B", quantidade: "1" },
    ],
    datas: { dataCompraPO: "01/08/2026", previsaoEntrega: "20/08/2026" }, // parcial (2 de 9)
    pendencias: ["conferir invoice"],
    atualizacoes: [
      { data: "02/08", texto: "PO enviada" },
      { data: "05/08", texto: "em trânsito" },
    ],
  };
  must("insert A", await insert(idA, dtoA));
  let pA = montarProcesso(await lerRow(idA));

  check("A: datas parcial só com as 2 chaves", eq(pA.datas, { dataCompraPO: "01/08/2026", previsaoEntrega: "20/08/2026" }));
  check("A: 2 medicamentos com shape preservado", eq(pA.medicamentos, dtoA.medicamentos));
  check("A: 2 atualizacoes preservadas", eq(pA.atualizacoes, dtoA.atualizacoes));
  check("A: 1 pendencia", eq(pA.pendencias, ["conferir invoice"]));
  check("A: transportadoraNacional completa", eq(pA.transportadoraNacional, { nome: "AJC", cotacao: "USD/BRL 5,10", valor: 1234.56 }));
  check("A: modalEnvio legado migra literal", pA.modalEnvio === "Courier");
  check("A: fornecedor legado migra literal", pA.fornecedor === "Pharyx");
  check("A: sem statusPagamento (chave omitida)", !("statusPagamento" in pA));
  check("A: sem alertaFornecedorResolvido (false → omitido)", !("alertaFornecedorResolvido" in pA));

  // ── editar (muda qtd de itens: 3 med, 1 atu, datas trocada) ─────────────
  const patchA = {
    paciente: "TESTE Processo Completo", pasta: "2026 - T01",
    empresa: "FARMAURORA", consultor: "Mateus Morais", status: "desembaraco",
    responsavelOperacional: "Bruno", despachante: "Bruno Lopes", fornecedor: "Pharyx",
    modalEnvio: "Courier", localEntrega: "SP",
    transportadoraNacional: { nome: "AJC", cotacao: "USD/BRL 5,10", valor: 1234.56 },
    medicamentos: [
      { nome: "MED A", dosagem: "10mg", quantidade: "5" },
      { nome: "MED B", quantidade: "1" },
      { nome: "MED C" },
    ],
    datas: { aberturaThread: "10/08/2026" }, // substitui a datas inteira
    pendencias: [],
    // (atualizacoes fora do patch de propósito — form manda Omit<..,"atualizacoes">)
  };
  const upd = await patch(idA, patchA);
  must("patch A", upd);
  check("patch A: retornou 1 linha", (upd.data ?? []).length === 1);

  pA = montarProcesso(await lerRow(idA));
  const esperadoA = {
    ...patchA,
    id: idA,
    atualizacoes: dtoA.atualizacoes, // não foi tocada pelo patch → preservada
    createdAt: pA.createdAt, updatedAt: pA.updatedAt,
  };
  check("reabrir A == versão editada (campo a campo)", eq(pA, esperadoA));
  check("patch A: status novo", pA.status === "desembaraco");
  check("patch A: 3 medicamentos", pA.medicamentos.length === 3 && pA.medicamentos[2].nome === "MED C");
  check("patch A: datas substituída (só aberturaThread)", eq(pA.datas, { aberturaThread: "10/08/2026" }));
  check("patch A: pendencias vazia", eq(pA.pendencias, []));
  check("patch A: atualizacoes NÃO tocada", eq(pA.atualizacoes, dtoA.atualizacoes));

  // ── patch esparso: só alertaFornecedorResolvido ────────────────────────
  const before = await lerRow(idA);
  must("patch esparso", await patch(idA, { alertaFornecedorResolvido: true }));
  const after = await lerRow(idA);
  check("patch esparso: alerta virou true", after.alerta_fornecedor_resolvido === true);
  check("patch esparso: status intacto", after.status === before.status);
  check("patch esparso: medicamentos intactos", eq(after.medicamentos, before.medicamentos));
  check("patch esparso: datas intacta", after.data_compra_po === before.data_compra_po && after.abertura_thread === before.abertura_thread);
  check("patch esparso: updated_at mudou", after.updated_at !== before.updated_at);
  check("montarProcesso: alertaFornecedorResolvido === true aparece", montarProcesso(after).alertaFornecedorResolvido === true);

  // ── B: sem transportadoraNacional e sem nenhuma data ───────────────────
  const dtoB = {
    paciente: "TESTE Processo Minimo", pasta: "2026 - T02",
    empresa: "MAINZFARMA", consultor: "Paulo Braga", status: "elaboracao_fornecedores",
    medicamentos: [{ nome: "MED Z" }],
    datas: {}, // objeto vazio
    pendencias: [],
    atualizacoes: [],
    // sem transportadoraNacional
  };
  must("insert B", await insert(idB, dtoB));
  const pB = montarProcesso(await lerRow(idB));
  check("B: datas volta como {} (não null, não com chaves)", eq(pB.datas, {}) && pB.datas && typeof pB.datas === "object");
  check("B: sem chave transportadoraNacional", !("transportadoraNacional" in pB));
  check("B: sem chave despachante/fornecedor/modalEnvio/ordem", !("despachante" in pB) && !("fornecedor" in pB) && !("modalEnvio" in pB) && !("ordem" in pB));
  check("B: sem statusPagamento", !("statusPagamento" in pB));
  check("B: medicamentos = [{nome:'MED Z'}]", eq(pB.medicamentos, [{ nome: "MED Z" }]));
  check("B: pendencias/atualizacoes = []", eq(pB.pendencias, []) && eq(pB.atualizacoes, []));

  // ── C: campos que alimentam app/utils/prazoFornecedor.ts sobrevivem ao ──
  //     round-trip do store. NÃO reimplementa o cálculo do alerta aqui — só
  //     garante que fornecedor + datas.dataCompraPO chegam certos, e que
  //     aberturaThread / alertaFornecedorResolvido ficam AUSENTES (o que faria
  //     a regra suprimir o alerta). Cenário: prazo vencido, sem supressão.
  const dtoC = {
    paciente: "TESTE Processo Alerta Fornecedor", pasta: "2026 - T03",
    empresa: "FARMAURORA", consultor: "André Vitório", status: "elaboracao_fornecedores",
    fornecedor: "Poros - Turquia", // está na tabela de prazos (3 dias)
    medicamentos: [],
    datas: { dataCompraPO: "01/01/2026" }, // bem vencida; sem aberturaThread
    pendencias: [],
    atualizacoes: [],
    // sem alertaFornecedorResolvido
  };
  must("insert C", await insert(idC, dtoC));
  const pC = montarProcesso(await lerRow(idC));
  check("C: fornecedor sobrevive exato ('Poros - Turquia')", pC.fornecedor === "Poros - Turquia");
  check("C: datas.dataCompraPO sobrevive exato", pC.datas.dataCompraPO === "01/01/2026");
  check("C: sem datas.aberturaThread (não suprime o alerta)", !("aberturaThread" in pC.datas));
  check("C: sem alertaFornecedorResolvido (não suprime o alerta)", !("alertaFornecedorResolvido" in pC));
  check("C: status/paciente/pasta intactos", pC.status === "elaboracao_fornecedores" && pC.paciente === dtoC.paciente && pC.pasta === "2026 - T03");

  // ── ordenação created_at desc, id asc ─────────────────────────────────
  const ord = await db.from(T).select("id,created_at").order("created_at", { ascending: false }).order("id", { ascending: true }).like("id", "TESTE_%");
  must("select ordenado", ord);
  check("ordenação: A, B e C presentes na consulta ordenada", (ord.data ?? []).length === 3);

  // ── delete ───────────────────────────────────────────────────────────
  const delA = await db.from(T).delete().eq("id", idA).select("id");
  const delB = await db.from(T).delete().eq("id", idB).select("id");
  const delC = await db.from(T).delete().eq("id", idC).select("id");
  must("delete A", delA); must("delete B", delB); must("delete C", delC);
  check("delete: A, B e C removidos", (delA.data ?? []).length === 1 && (delB.data ?? []).length === 1 && (delC.data ?? []).length === 1);
  check("delete: sumiram", (await lerRow(idA)) === null && (await lerRow(idB)) === null && (await lerRow(idC)) === null);
  const delMissing = await db.from(T).delete().eq("id", "TESTE_nao_existe").select("id");
  check("delete inexistente → 0 linhas", (delMissing.data ?? []).length === 0);
} catch (e) {
  console.log("EXCEÇÃO:", e.message);
  failures++;
} finally {
  await db.from(T).delete().eq("id", idA);
  await db.from(T).delete().eq("id", idB);
  await db.from(T).delete().eq("id", idC);
}

const sobra = await db.from(T).select("id").like("id", "TESTE_%");
check(`nenhum registro TESTE_ sobrou (achou ${(sobra.data ?? []).length})`, (sobra.data ?? []).length === 0);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
process.exitCode = failures === 0 ? 0 : 1;
