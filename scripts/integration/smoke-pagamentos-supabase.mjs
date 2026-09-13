// Smoke test do pagamentosStore (Supabase). Espelha a lógica do store e roda
// contra o banco real. Todos os ids têm prefixo TESTE_ e são apagados no fim.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Raiz do projeto (crm/) — 2 níveis acima de scripts/integration/.
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(
  readFileSync(`${CRM}/.env`, "utf-8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";
const T_GRUPOS = "pagamento_grupos";
const BANCOS = ["XP", "RENDIMENTO", "INTEX"];
const COL = {
  XP: { c: "xp_taxa_corretagem", t: "xp_taxa" },
  RENDIMENTO: { c: "rendimento_taxa_corretagem", t: "rendimento_taxa" },
  INTEX: { c: "intex_taxa_corretagem", t: "intex_taxa" },
};

let failures = 0;
const check = (label, cond) => { console.log(`${cond ? "  ok " : "FAIL"} ${label}`); if (!cond) failures++; };
function must(label, { error }) { if (error) { console.log(`FAIL ${label}: ${error.message}`); failures++; throw new Error(error.message); } }
const rid = (p) => `TESTE_${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const numN = (v) => (v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

function montarLote(row) {
  return {
    id: row.id, data: row.data, empresa: row.empresa, moeda: row.moeda, numeroLote: Number(row.numero_lote) || 1,
    opcoes: BANCOS.map((b) => ({ banco: b, taxaCorretagem: Number(row[COL[b].c]), taxa: numN(row[COL[b].t]) })),
    bancoEscolhido: row.banco_escolhido, taxaEscolhida: numN(row.taxa_escolhida),
    realizado: row.realizado, pagoEm: row.pago_em, createdAt: row.created_at,
  };
}
async function lerLote(id) { const { data, error } = await db.from(T_LOTES).select("*").eq("id", id).maybeSingle(); must("select lote", { error }); return data ? montarLote(data) : null; }
async function lancsDoLote(id) {
  const { data, error } = await db.from(T_LANC).select("*").eq("lote_id", id).order("created_at", { ascending: true });
  must("select lancs", { error });
  return (data ?? []).map((r) => ({ id: r.id, valorMoeda: Number(r.valor_moeda), valorReais: numN(r.valor_reais) }));
}

async function invalidar(loteId) {
  must("invalidar lote", await db.from(T_LOTES).update({ banco_escolhido: null, taxa_escolhida: null, xp_taxa: null, rendimento_taxa: null, intex_taxa: null }).eq("id", loteId));
  must("invalidar lancs", await db.from(T_LANC).update({ valor_reais: null, taxa: null }).eq("lote_id", loteId));
}

// espelho de calcularNumeroLote / proximoNumeroLote (server/utils/*)
function calcularNumeroLote(numerosAbertos) {
  return numerosAbertos.length === 0 ? 1 : Math.max(...numerosAbertos) + 1;
}
async function proximoNumeroLote(empresa, moeda) {
  const res = await db.from(T_LOTES).select("numero_lote").eq("empresa", empresa).eq("moeda", moeda).eq("realizado", false);
  must("buscar numeração", res);
  return calcularNumeroLote((res.data ?? []).map((r) => Number(r.numero_lote) || 1));
}
async function inserirLoteNovo(empresa, moeda) {
  const loteId = rid("lote");
  const now = new Date().toISOString();
  const numeroLote = await proximoNumeroLote(empresa, moeda);
  must("insert lote", await db.from(T_LOTES).insert({
    id: loteId, data: now.slice(0, 10), empresa, moeda, numero_lote: numeroLote,
    xp_taxa_corretagem: 0, xp_taxa: null, rendimento_taxa_corretagem: 0, rendimento_taxa: null,
    intex_taxa_corretagem: 0, intex_taxa: null, banco_escolhido: null, taxa_escolhida: null,
    realizado: false, pago_em: null, created_at: now,
  }));
  return { loteId, numeroLote };
}

// espelho de criarLancamentoBanco (resolverLoteDestino: forcarLoteNovo | loteId | auto)
async function criarLancamento(dto) {
  let loteId;
  if (dto.forcarLoteNovo) {
    ({ loteId } = await inserirLoteNovo(dto.empresa, dto.moeda));
  } else if (dto.loteId) {
    const lr = await db.from(T_LOTES).select("*").eq("id", dto.loteId).maybeSingle();
    must("buscar lote alvo", lr);
    if (!lr.data) throw new Error("404 lote alvo");
    if (lr.data.realizado) throw new Error("409 lote alvo pago");
    if (lr.data.empresa !== dto.empresa || lr.data.moeda !== dto.moeda) throw new Error("400 empresa/moeda do lote alvo");
    loteId = lr.data.id;
    if (lr.data.banco_escolhido !== null) await invalidar(loteId);
  } else {
    const ab = await db.from(T_LOTES).select("*").eq("empresa", dto.empresa).eq("moeda", dto.moeda).eq("realizado", false)
      .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(1);
    must("buscar lote aberto", ab);
    const loteRow = (ab.data ?? [])[0];
    if (!loteRow) {
      ({ loteId } = await inserirLoteNovo(dto.empresa, dto.moeda));
    } else {
      loteId = loteRow.id;
      if (loteRow.banco_escolhido !== null) await invalidar(loteId);
    }
  }
  const lancId = rid("lanc");
  must("insert lanc", await db.from(T_LANC).insert({
    id: lancId, lote_id: loteId, data: new Date().toISOString().slice(0, 10), empresa: dto.empresa,
    fornecedor: dto.fornecedor, invoice: dto.invoice, cliente: dto.cliente,
    valor_moeda: dto.valorMoeda, moeda: dto.moeda, valor_reais: null, created_at: new Date().toISOString(),
  }));
  return { loteId, lancId };
}

// espelho de atualizarCotacaoLote
async function atualizarCotacao(loteId, dto) {
  const lr = await db.from(T_LOTES).select("*").eq("id", loteId).maybeSingle();
  must("buscar lote (cotacao)", lr);
  const loteRow = lr.data;
  if (loteRow.realizado) throw new Error("409 lote pago");
  const patch = {};
  if (dto.opcoes) for (const e of dto.opcoes) { patch[COL[e.banco].c] = e.taxaCorretagem; patch[COL[e.banco].t] = e.taxa; }
  let recalc = null;
  if (dto.bancoEscolhido) {
    const doDto = dto.opcoes?.find((o) => o.banco === dto.bancoEscolhido);
    const taxaEf = doDto ? doDto.taxa : numN(loteRow[COL[dto.bancoEscolhido].t]);
    if (taxaEf === null) throw new Error("400 Preencha a taxa do banco antes de escolhê-lo.");
    patch.banco_escolhido = dto.bancoEscolhido;
    patch.taxa_escolhida = taxaEf;
    recalc = taxaEf;
  }
  if (Object.keys(patch).length) must("update cotacao", await db.from(T_LOTES).update(patch).eq("id", loteId));
  if (recalc !== null) {
    const pend = await db.from(T_LANC).select("id, valor_moeda").eq("lote_id", loteId).is("valor_reais", null);
    must("buscar pendentes", pend);
    for (const r of pend.data ?? []) must("recalc", await db.from(T_LANC).update({ valor_reais: Number(r.valor_moeda) * recalc }).eq("id", r.id));
  }
}

async function fecharLote(loteId) {
  const lr = await db.from(T_LOTES).select("*").eq("id", loteId).maybeSingle();
  must("buscar lote (fechar)", lr);
  if (lr.data.banco_escolhido === null) throw new Error("400 escolha um banco");
  must("fechar", await db.from(T_LOTES).update({ realizado: true, pago_em: new Date().toISOString() }).eq("id", loteId));
}

// espelho do ramo RENDIMENTO de atualizarCotacaoLote: taxa por ordem, com
// taxa_escolhida = a taxa única SÓ quando há 1 pendente (fechamento direto).
async function escolherRendimento(loteId, taxasPorOrdem) {
  const pend = await db.from(T_LANC).select("id, valor_moeda").eq("lote_id", loteId).is("valor_reais", null);
  must("buscar pendentes (rend)", pend);
  const pendentes = pend.data ?? [];
  if (pendentes.length === 0) throw new Error("400 sem pendentes");
  const porId = new Map(taxasPorOrdem.map((t) => [t.lancamentoId, t.taxa]));
  if (!pendentes.every((r) => porId.get(r.id) > 0)) throw new Error("400 taxa de todos os pendentes");
  const taxaEscolhida = pendentes.length === 1 ? porId.get(pendentes[0].id) : null;
  must("update lote (rend)", await db.from(T_LOTES).update({ banco_escolhido: "RENDIMENTO", taxa_escolhida: taxaEscolhida }).eq("id", loteId));
  for (const r of pendentes) {
    const taxa = porId.get(r.id);
    must("recalc (rend)", await db.from(T_LANC).update({ valor_reais: Number(r.valor_moeda) * taxa, taxa }).eq("id", r.id));
  }
}

async function removerLancamento(lancId) {
  const l = await db.from(T_LANC).select("*").eq("id", lancId).maybeSingle();
  must("buscar lanc (remover)", l);
  const lr = await db.from(T_LOTES).select("*").eq("id", l.data.lote_id).maybeSingle();
  must("buscar lote (remover)", lr);
  must("delete lanc", await db.from(T_LANC).delete().eq("id", lancId));
  const rest = await db.from(T_LANC).select("id").eq("lote_id", lr.data.id).limit(1);
  must("rest", rest);
  if (!(rest.data ?? []).length) must("delete lote vazio", await db.from(T_LOTES).delete().eq("id", lr.data.id));
  else if (!lr.data.realizado && lr.data.banco_escolhido !== null) await invalidar(lr.data.id);
  return lr.data.id;
}

const EMP = "MAINZFARMA"; // isola de qualquer dado real FARMAURORA
let loteId;
const criados = { lotes: new Set(), grupos: new Set() };

try {
  // a. primeiro lançamento sem lote aberto → cria lote novo
  const r1 = await criarLancamento({ empresa: EMP, moeda: "USD", fornecedor: "F1", invoice: "INV-1", cliente: "Cliente 1", valorMoeda: 1000 });
  loteId = r1.loteId; criados.lotes.add(loteId);
  let lancs = await lancsDoLote(loteId);
  check("a. criou lote novo + 1 lançamento", lancs.length === 1);

  // b. segundo lançamento mesma empresa+moeda → MESMO lote
  const r2 = await criarLancamento({ empresa: EMP, moeda: "USD", fornecedor: "F2", invoice: "INV-2", cliente: "Cliente 2", valorMoeda: 500 });
  check("b. entrou no MESMO lote (não criou outro)", r2.loteId === loteId);
  const { count: nLotes } = await db.from(T_LOTES).select("*", { count: "exact", head: true }).eq("empresa", EMP).eq("moeda", "USD");
  check("b. só existe 1 lote MAINZFARMA/USD", nLotes === 1);

  // c. preencher taxa XP e escolher XP → valorReais = valorMoeda * taxa
  await atualizarCotacao(loteId, {
    opcoes: [{ banco: "XP", taxaCorretagem: 0, taxa: 5.15 }],
    bancoEscolhido: "XP",
  });
  let lote = await lerLote(loteId);
  lancs = await lancsDoLote(loteId);
  check("c. bancoEscolhido = XP", lote.bancoEscolhido === "XP");
  check("c. taxaEscolhida = 5.15", lote.taxaEscolhida === 5.15);
  check("c. valorReais lanc1 = 1000*5.15", lancs.find((l) => l.valorMoeda === 1000).valorReais === 5150);
  check("c. valorReais lanc2 = 500*5.15", lancs.find((l) => l.valorMoeda === 500).valorReais === 2575);

  // d. terceiro lançamento no lote já cotado → invalida
  const r3 = await criarLancamento({ empresa: EMP, moeda: "USD", fornecedor: "F3", invoice: "INV-3", cliente: "Cliente 3", valorMoeda: 200 });
  check("d. 3º entrou no mesmo lote", r3.loteId === loteId);
  lote = await lerLote(loteId);
  lancs = await lancsDoLote(loteId);
  check("d. bancoEscolhido voltou null", lote.bancoEscolhido === null);
  check("d. taxaEscolhida voltou null", lote.taxaEscolhida === null);
  check("d. as 3 taxas cotadas voltaram null", lote.opcoes.every((o) => o.taxa === null));
  check("d. taxaCorretagem PRESERVADA (XP=0, os 3 = 0)", lote.opcoes.every((o) => o.taxaCorretagem === 0));
  check("d. os 3 lançamentos com valorReais null", lancs.length === 3 && lancs.every((l) => l.valorReais === null));

  // e. escolher banco com taxa null → erro 400
  let erro400 = null;
  try { await atualizarCotacao(loteId, { bancoEscolhido: "RENDIMENTO" }); } catch (e) { erro400 = e.message; }
  check("e. erro 400 ao escolher banco com taxa null", !!erro400 && erro400.startsWith("400"));

  // (re-cotar antes de g/f)
  await atualizarCotacao(loteId, { opcoes: [{ banco: "INTEX", taxaCorretagem: 0, taxa: 5.2 }], bancoEscolhido: "INTEX" });
  lote = await lerLote(loteId);
  check("re-cotar: INTEX escolhido @ 5.2", lote.bancoEscolhido === "INTEX" && lote.taxaEscolhida === 5.2);
  lancs = await lancsDoLote(loteId);
  check("re-cotar: valorReais recalculado (200*5.2=1040)", lancs.find((l) => l.valorMoeda === 200).valorReais === 1040);

  // g. remover um lançamento de lote cotado (não realizado) → invalida de novo
  await removerLancamento(r3.lancId);
  lote = await lerLote(loteId);
  lancs = await lancsDoLote(loteId);
  check("g. removeu 1 lançamento (restam 2)", lancs.length === 2);
  check("g. invalidou: bancoEscolhido/taxaEscolhida null", lote.bancoEscolhido === null && lote.taxaEscolhida === null);
  check("g. invalidou: 3 taxas null, corretagem preservada", lote.opcoes.every((o) => o.taxa === null && o.taxaCorretagem === 0));
  check("g. invalidou: valorReais dos 2 restantes null", lancs.every((l) => l.valorReais === null));

  // f. cotar de novo e fechar o lote
  await atualizarCotacao(loteId, { opcoes: [{ banco: "XP", taxaCorretagem: 0, taxa: 5.0 }], bancoEscolhido: "XP" });
  let lancsAntes = await lancsDoLote(loteId);
  await fecharLote(loteId);
  lote = await lerLote(loteId);
  let lancsDepois = await lancsDoLote(loteId);
  check("f. realizado = true", lote.realizado === true);
  check("f. pagoEm preenchido", typeof lote.pagoEm === "string" && lote.pagoEm.length > 0);
  check("f. valorReais NÃO recalculou de novo ao fechar", JSON.stringify(lancsAntes.map((l) => l.valorReais).sort()) === JSON.stringify(lancsDepois.map((l) => l.valorReais).sort()));
  check("f. valorReais = valorMoeda*5.0 (1000→5000, 500→2500)", lancsDepois.find((l) => l.valorMoeda === 1000).valorReais === 5000 && lancsDepois.find((l) => l.valorMoeda === 500).valorReais === 2500);

  // ── h. Lotes concorrentes por empresa+moeda + numeração ────────────────
  // (o lote das etapas a–f está realizado; não conta como "aberto")
  const h1 = await criarLancamento({ empresa: EMP, moeda: "USD", forcarLoteNovo: true, fornecedor: "F", invoice: "H-1", cliente: "H Cliente 1", valorMoeda: 100 });
  const h2 = await criarLancamento({ empresa: EMP, moeda: "USD", forcarLoteNovo: true, fornecedor: "F", invoice: "H-2", cliente: "H Cliente 2", valorMoeda: 100 });
  criados.lotes.add(h1.loteId); criados.lotes.add(h2.loteId);
  check("h. forcarLoteNovo cria lote separado (2 lotes USD abertos)", h1.loteId !== h2.loteId);
  check("h. 1º lote forçado = numeroLote 1", (await lerLote(h1.loteId)).numeroLote === 1);
  check("h. 2º lote forçado = numeroLote 2", (await lerLote(h2.loteId)).numeroLote === 2);

  // loteId explícito entra no lote 1, não abre outro nem toca no lote 2
  const h3 = await criarLancamento({ empresa: EMP, moeda: "USD", loteId: h1.loteId, fornecedor: "F", invoice: "H-3", cliente: "H Cliente 3", valorMoeda: 100 });
  check("h. loteId explícito grava no lote alvo", h3.loteId === h1.loteId);
  check("h. lote 1 agora tem 2 lançamentos", (await lancsDoLote(h1.loteId)).length === 2);
  check("h. lote 2 continua com 1 lançamento", (await lancsDoLote(h2.loteId)).length === 1);

  // loteId de lote já pago → 409
  let err409 = null;
  try { await criarLancamento({ empresa: EMP, moeda: "USD", loteId, fornecedor: "F", invoice: "H-x", cliente: "x", valorMoeda: 1 }); } catch (e) { err409 = e.message; }
  check("h. loteId de lote pago → 409", !!err409 && err409.startsWith("409"));

  // pagar o lote 1; o lote 2 mantém numeroLote 2 (imutável)
  await atualizarCotacao(h1.loteId, { opcoes: [{ banco: "XP", taxaCorretagem: 0, taxa: 5 }], bancoEscolhido: "XP" });
  await fecharLote(h1.loteId);
  check("h. lote 1 pago; lote 2 continua numeroLote 2", (await lerLote(h2.loteId)).numeroLote === 2);

  // com o lote 1 pago e só o lote 2 (numero 2) aberto, o próximo forçado = 3
  const h4 = await criarLancamento({ empresa: EMP, moeda: "USD", forcarLoteNovo: true, fornecedor: "F", invoice: "H-4", cliente: "H Cliente 4", valorMoeda: 100 });
  criados.lotes.add(h4.loteId);
  check("h. próximo forçado usa maior+1 (=3), não a contagem", (await lerLote(h4.loteId)).numeroLote === 3);

  // índice único parcial: dois lotes abertos com o mesmo numero_lote são recusados
  const dupErr = await db.from(T_LOTES).insert({
    id: rid("lote"), data: new Date().toISOString().slice(0, 10), empresa: EMP, moeda: "USD", numero_lote: 3,
    xp_taxa_corretagem: 0, xp_taxa: null, rendimento_taxa_corretagem: 0, rendimento_taxa: null,
    intex_taxa_corretagem: 0, intex_taxa: null, banco_escolhido: null, taxa_escolhida: null,
    realizado: false, pago_em: null, created_at: new Date().toISOString(),
  });
  check("h. índice único parcial recusa numero_lote duplicado entre abertos", !!dupErr.error);

  // pagar o lote 2 e o 3; sem nenhum USD aberto, o próximo reinicia em 1
  for (const lid of [h2.loteId, h4.loteId]) {
    await atualizarCotacao(lid, { opcoes: [{ banco: "XP", taxaCorretagem: 0, taxa: 5 }], bancoEscolhido: "XP" });
    await fecharLote(lid);
  }
  const h5 = await criarLancamento({ empresa: EMP, moeda: "USD", forcarLoteNovo: true, fornecedor: "F", invoice: "H-5", cliente: "H Cliente 5", valorMoeda: 100 });
  criados.lotes.add(h5.loteId);
  check("h. sem lote USD aberto, numeração reinicia em 1", (await lerLote(h5.loteId)).numeroLote === 1);

  // EUR é independente de USD: primeiro lote EUR também é numeroLote 1
  const hEur = await criarLancamento({ empresa: EMP, moeda: "EUR", forcarLoteNovo: true, fornecedor: "F", invoice: "H-EUR", cliente: "H Cliente EUR", valorMoeda: 100 });
  criados.lotes.add(hEur.loteId);
  check("h. EUR independe de USD (primeiro lote EUR = numeroLote 1)", (await lerLote(hEur.loteId)).numeroLote === 1);

  // ── i. Rendimento com 1 pendente: aplica direto, taxaEscolhida real ────
  const i1 = await criarLancamento({ empresa: EMP, moeda: "USD", forcarLoteNovo: true, fornecedor: "F", invoice: "I-1", cliente: "I Cliente 1", valorMoeda: 1000 });
  criados.lotes.add(i1.loteId);
  await escolherRendimento(i1.loteId, [{ lancamentoId: i1.lancId, taxa: 5.5 }]);
  let iLote = await lerLote(i1.loteId);
  let iLancs = await lancsDoLote(i1.loteId);
  check("i. 1 pendente → taxaEscolhida = a taxa única (não null)", iLote.taxaEscolhida === 5.5);
  check("i. bancoEscolhido = RENDIMENTO", iLote.bancoEscolhido === "RENDIMENTO");
  check("i. valorReais = valorMoeda*taxa (1000*5.5)", iLancs[0].valorReais === 5500);
  const iLancRow = (await db.from(T_LANC).select("taxa").eq("id", i1.lancId).maybeSingle()).data;
  check("i. taxa gravada no lançamento (trilha de auditoria)", Number(iLancRow.taxa) === 5.5);

  // adicionar 2º lançamento no mesmo lote → invalida a cotação
  const i2 = await criarLancamento({ empresa: EMP, moeda: "USD", loteId: i1.loteId, fornecedor: "F", invoice: "I-2", cliente: "I Cliente 2", valorMoeda: 500 });
  check("i. 2º lançamento entrou no mesmo lote", i2.loteId === i1.loteId);
  iLote = await lerLote(i1.loteId);
  iLancs = await lancsDoLote(i1.loteId);
  check("i. cotação invalidou: bancoEscolhido/taxaEscolhida null", iLote.bancoEscolhido === null && iLote.taxaEscolhida === null);
  check("i. cotação invalidou: valorReais dos 2 null", iLancs.every((l) => l.valorReais === null));
  const i1RowAfter = (await db.from(T_LANC).select("taxa").eq("id", i1.lancId).maybeSingle()).data;
  check("i. cotação invalidou: taxa do lançamento 1 voltou null", i1RowAfter.taxa === null);

  // agora 2 pendentes → fechamento por ordem, taxaEscolhida fica null
  await escolherRendimento(i1.loteId, [
    { lancamentoId: i1.lancId, taxa: 5.4 },
    { lancamentoId: i2.lancId, taxa: 5.5 },
  ]);
  iLote = await lerLote(i1.loteId);
  iLancs = await lancsDoLote(i1.loteId);
  check("i. 2 pendentes → taxaEscolhida null (por ordem)", iLote.taxaEscolhida === null);
  check("i. cada lançamento com a sua taxa/valorReais", iLancs.find((l) => l.valorMoeda === 1000).valorReais === 5400 && iLancs.find((l) => l.valorMoeda === 500).valorReais === 2750);

  // ── Grupos ─────────────────────────────────────────────────────────────
  const grpId = rid("grp"); criados.grupos.add(grpId);
  const now = new Date().toISOString();
  must("insert grupo", await db.from(T_GRUPOS).insert({
    id: grpId, tipo: "DESPACHANTE", data: now.slice(0, 10), empresa: EMP, nome_grupo: "TESTE Despachante",
    chave_pix: "00.000.000/0001-00",
    itens: [
      { paciente: "Paciente A", valor: 100, status: "NAO_PAGO" },
      { paciente: "Paciente B", valor: 200, status: "NAO_PAGO" },
    ],
    realizado: false, pago_em: null, created_at: now,
  }));

  // atualizarItemGrupo: B → COMPLEMENTO (gravação direta)
  let g = (await db.from(T_GRUPOS).select("*").eq("id", grpId).maybeSingle()).data;
  let itens = [...g.itens];
  itens[1] = { ...itens[1], status: "COMPLEMENTO" };
  must("update item status", await db.from(T_GRUPOS).update({ itens }).eq("id", grpId));
  g = (await db.from(T_GRUPOS).select("*").eq("id", grpId).maybeSingle()).data;
  check("grupo: item B virou COMPLEMENTO, grupo não moveu", g.itens[1].status === "COMPLEMENTO" && g.realizado === false);
  check("grupo: item A continua NAO_PAGO", g.itens[0].status === "NAO_PAGO");

  // pagarGrupoPagamento: promove NAO_PAGO→PAGO, COMPLEMENTO fica
  itens = g.itens.map((i) => (i.status === "NAO_PAGO" ? { ...i, status: "PAGO" } : i));
  must("pagar grupo", await db.from(T_GRUPOS).update({ realizado: true, pago_em: new Date().toISOString(), itens }).eq("id", grpId));
  g = (await db.from(T_GRUPOS).select("*").eq("id", grpId).maybeSingle()).data;
  check("pagar: A (NAO_PAGO) → PAGO", g.itens[0].status === "PAGO");
  check("pagar: B (COMPLEMENTO) ficou COMPLEMENTO", g.itens[1].status === "COMPLEMENTO");
  check("pagar: realizado = true, pagoEm preenchido", g.realizado === true && typeof g.pago_em === "string" && g.pago_em.length > 0);
} catch (e) {
  console.log("EXCEÇÃO:", e.message);
  failures++;
} finally {
  await db.from(T_LOTES).delete().like("id", "TESTE_%"); // cascade nos lançamentos
  await db.from(T_LANC).delete().like("id", "TESTE_%");
  await db.from(T_GRUPOS).delete().like("id", "TESTE_%");
}

const s1 = await db.from(T_LOTES).select("id").like("id", "TESTE_%");
const s2 = await db.from(T_LANC).select("id").like("id", "TESTE_%");
const s3 = await db.from(T_GRUPOS).select("id").like("id", "TESTE_%");
const sobra = (s1.data ?? []).length + (s2.data ?? []).length + (s3.data ?? []).length;
check(`nenhum registro TESTE_ sobrou (achou ${sobra})`, sobra === 0);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
process.exitCode = failures === 0 ? 0 : 1;
