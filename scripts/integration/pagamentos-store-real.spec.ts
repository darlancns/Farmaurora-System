import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from "vitest";
import { createApp, toWebHandler } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmpresaPagamento, LancamentoBanco, LoteBanco, Moeda } from "../../shared/types/Pagamento";

// Integração REAL do fluxo de câmbio: chama o código de verdade do servidor
// (handler PATCH /api/pagamentos/cotacao + bancoStore/pagamentosStore +
// pagamentoValidation) contra o Supabase do .env, e o código de verdade do
// cliente que decide os números (parseTaxa, calcularTotalReaisLote,
// montarCotacaoDoLote). Diferente do smoke-pagamentos-supabase.mjs, que
// reimplementa o store ("espelho"), aqui nada é copiado.
//
// ⚠️ Escreve no banco REAL (não há banco de teste). Segurança:
//  - todo id gerado pelo store ganha o prefixo TESTE_RS_ (mock de randomId;
//    o resto do store roda sem alteração);
//  - lotes só são criados com `forcarLoteNovo`; um lançamento só entra num lote
//    existente pelo roteamento por moeda (o mais recente aberto) DEPOIS de conferir
//    que esse lote é um TESTE_RS_ (ver `addLancamento`) — nunca num lote real;
//  - ABORTA (skip com aviso) se a empresa+moeda usada tiver lote aberto que não
//    seja TESTE_: o teste escolhe uma combinação livre, e se não houver nenhuma
//    não roda nada;
//  - afterAll apaga tudo (mesmo se um teste falhar) e exige 0 registros TESTE_.

vi.mock("../../server/utils/storeKit", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/utils/storeKit")>();
  return { ...original, randomId: (prefix: string) => `TESTE_RS_${original.randomId(prefix)}` };
});

import { createSupabaseAdminClient } from "../../server/utils/supabaseServerClient";
import {
  atualizarLancamentoBanco,
  criarLancamentoBanco,
  listarBancoPayload,
} from "../../server/utils/pagamentosStore";
import cotacaoPatch from "../../server/api/pagamentos/cotacao.patch";
import { calcularTotalReaisLote, formatFaixaTaxas, montarCotacaoDoLote } from "../../app/utils/pagamentoCalculations";
import { parseTaxa, parseTaxaValida } from "../../app/utils/parseTaxa";
import { temCredenciaisSupabase } from "./_stubs/nuxtImports";
import { exigirAllowRealDb } from "./_guardBancoReal.mjs";

// Acessa o Supabase REAL (produção): só roda com ALLOW_REAL_DB=1, antes de qualquer conexão.
exigirAllowRealDb("pagamentos-store-real");

const PREFIXO = "TESTE_RS_";
const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";

// Combinações candidatas, da menos provável de ter lote real aberto para a mais.
// MAINZFARMA saiu do tipo `EmpresaPagamento` (o app opera só com a Farmaurora em Pagamentos), mas
// o banco ainda admite o valor: aqui ele serve só de namespace de isolamento no banco real
// (decisão pendente para a Fase 2B — remover tiraria esse isolamento desses testes manuais).
const MAINZ_NAMESPACE = "MAINZFARMA" as EmpresaPagamento;
const COMBOS: Array<{ empresa: EmpresaPagamento; moeda: Moeda }> = [
  { empresa: MAINZ_NAMESPACE, moeda: "EUR" },
  { empresa: MAINZ_NAMESPACE, moeda: "USD" },
  { empresa: "FARMAURORA", moeda: "EUR" },
  { empresa: "FARMAURORA", moeda: "USD" },
];

let db: SupabaseClient;
let empresa: EmpresaPagamento;
let moeda: Moeda;
let ambienteSeguro = false;
const lotesCriados = new Set<string>();

// O handler REAL (validação + store) montado num app h3 mínimo — respostas
// HTTP de verdade (200/400/409), sem passar pelo middleware de auth do Nitro.
const app = createApp();
app.use(cotacaoPatch);
const web = toWebHandler(app);

interface RespostaPatch {
  status: number;
  json: { lotes?: LoteBanco[]; lancamentos?: LancamentoBanco[]; statusMessage?: string; message?: string } | null;
}

async function patch(body: Record<string, unknown>): Promise<RespostaPatch> {
  const res = await web(
    new Request("http://localhost/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

function mensagem(r: RespostaPatch): string {
  return `${r.json?.statusMessage ?? ""} ${r.json?.message ?? ""}`;
}

type TaxasBancos = Partial<Record<"XP" | "RENDIMENTO" | "INTEX", number | null>>;
function opcoes(taxas: TaxasBancos, corretagem: TaxasBancos = {}) {
  return (["XP", "RENDIMENTO", "INTEX"] as const).map((banco) => ({
    banco,
    taxaCorretagem: corretagem[banco] ?? 0,
    taxa: taxas[banco] ?? null,
  }));
}

// Lote NOVO (forcarLoteNovo — nunca cria por roteamento) com 1 lançamento.
async function novoLote(invoice: string, valorMoeda: number): Promise<{ loteId: string; lancId: string }> {
  const r = await criarLancamentoBanco({
    empresa,
    moeda,
    fornecedor: "TESTE-F",
    invoice,
    cliente: `${PREFIXO}${invoice}`,
    valorMoeda,
    forcarLoteNovo: true,
  });
  expect(r.lote.id.startsWith(PREFIXO)).toBe(true);
  lotesCriados.add(r.lote.id);
  return { loteId: r.lote.id, lancId: r.lancamento.id };
}

// Lançamento em lote existente. Não há mais `loteId`: a moeda define o lote (o aberto mais
// recente da empresa+moeda). Antes de escrever, confere que esse destino é o lote de teste
// esperado (TESTE_RS_), pra nunca gravar num lote real.
async function addLancamento(loteId: string, invoice: string, valorMoeda: number): Promise<string> {
  const abertos = (await listarBancoPayload()).lotes
    .filter((l) => l.empresa === empresa && l.moeda === moeda && !l.realizado)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  expect(abertos[0]?.id, "o destino do roteamento por moeda deve ser o lote de teste").toBe(loteId);
  expect(loteId.startsWith(PREFIXO)).toBe(true);
  const r = await criarLancamentoBanco({
    empresa,
    moeda,
    fornecedor: "TESTE-F",
    invoice,
    cliente: `${PREFIXO}${invoice}`,
    valorMoeda,
  });
  expect(r.lote.id).toBe(loteId);
  return r.lancamento.id;
}

async function estado(loteId: string): Promise<{ lote: LoteBanco; lancs: LancamentoBanco[] }> {
  const p = await listarBancoPayload();
  const lote = p.lotes.find((l) => l.id === loteId);
  if (!lote) throw new Error(`lote ${loteId} não encontrado`);
  return {
    lote,
    lancs: p.lancamentos.filter((l) => l.loteId === loteId).sort((a, b) => a.invoice.localeCompare(b.invoice)),
  };
}

function exigeAmbienteSeguro(ctx: TestContext): void {
  if (!ambienteSeguro) ctx.skip();
}

async function contarTeste(): Promise<number> {
  const [a, b] = await Promise.all([
    db.from(T_LANC).select("id").like("id", "TESTE_%"),
    db.from(T_LOTES).select("id").like("id", "TESTE_%"),
  ]);
  if (a.error || b.error) throw new Error(`falha ao conferir sobras: ${a.error?.message ?? b.error?.message}`);
  return (a.data?.length ?? 0) + (b.data?.length ?? 0);
}

async function limparPrefixo(): Promise<void> {
  const l1 = await db.from(T_LANC).delete().like("id", `${PREFIXO}%`);
  if (l1.error) throw new Error(`limpeza (lançamentos): ${l1.error.message}`);
  // lançamentos de lotes de teste com id que não seja do prefixo não existem, mas
  // apaga pelo lote também, por garantia (FK cascade cobre o resto)
  for (const id of lotesCriados) await db.from(T_LANC).delete().eq("lote_id", id);
  const l2 = await db.from(T_LOTES).delete().like("id", `${PREFIXO}%`);
  if (l2.error) throw new Error(`limpeza (lotes): ${l2.error.message}`);
}

describe.skipIf(!temCredenciaisSupabase())("Pagamentos — fluxo de câmbio com o store REAL (Supabase)", () => {
  beforeAll(async () => {
    db = createSupabaseAdminClient();
    await limparPrefixo(); // sobras de uma execução anterior que caiu no meio

    const abertos = await db.from(T_LOTES).select("id, empresa, moeda").eq("realizado", false);
    if (abertos.error) throw new Error(`não consegui checar lotes abertos: ${abertos.error.message}`);
    const reais = (abertos.data ?? []).filter((l) => !String(l.id).startsWith("TESTE_"));

    const livre = COMBOS.find((c) => !reais.some((l) => l.empresa === c.empresa && l.moeda === c.moeda));
    if (!livre) {
      console.warn(
        "\n⚠️  TESTE DE INTEGRAÇÃO DO STORE REAL PULADO: todas as combinações empresa+moeda têm lote real aberto. " +
          "Feche/pague os lotes reais (ou rode quando houver uma combinação livre) para executar.\n",
      );
      return;
    }
    empresa = livre.empresa;
    moeda = livre.moeda;
    ambienteSeguro = true;
    console.log(`\nUsando ${empresa}/${moeda} (nenhum lote real aberto nessa combinação).\n`);
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await limparPrefixo();
    } finally {
      const sobras = await contarTeste();
      console.log(`\nLimpeza: sobraram ${sobras} registro(s) TESTE_.\n`);
      expect(sobras, "sobraram registros TESTE_ no banco").toBe(0);
    }
  });

  // ── 1. ponto x vírgula ────────────────────────────────────────────────────
  it("taxa com ponto e com vírgula dão o MESMO valorReais (Rendimento e XP)", async (ctx) => {
    exigeAmbienteSeguro(ctx);

    for (const banco of ["RENDIMENTO", "XP"] as const) {
      const valores: number[] = [];
      for (const texto of ["5.4231", "5,4231"]) {
        const taxa = parseTaxaValida(texto);
        expect(taxa, `parseTaxa(${texto})`).toBe(5.4231);

        const { loteId, lancId } = await novoLote(`PV-${banco}-${texto}`, 1000);
        const r =
          banco === "RENDIMENTO"
            ? await patch({
                loteId,
                opcoes: opcoes({ RENDIMENTO: taxa }),
                bancoEscolhido: "RENDIMENTO",
                taxasRendimento: [{ lancamentoId: lancId, taxa }],
              })
            : await patch({ loteId, opcoes: opcoes({ XP: taxa }), bancoEscolhido: "XP" });
        expect(r.status, mensagem(r)).toBe(200);

        const { lancs } = await estado(loteId);
        expect(lancs[0]!.valorReais).toBeCloseTo(5423.1, 6);
        valores.push(lancs[0]!.valorReais!);
      }
      expect(valores[0]).toBe(valores[1]);
    }
  });

  // ── 2. fora do intervalo => 400 ───────────────────────────────────────────
  it("taxa fora de [1, 20] => 400 com mensagem clara, e nada é gravado", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId, lancId } = await novoLote("RANGE-1", 1000);

    // O cliente nem deixa chegar lá: "54231" vira inválido.
    expect(parseTaxaValida("54231")).toBeNull();

    const casos: Array<[string, Record<string, unknown>]> = [
      ["54231 em opcoes (XP)", { loteId, opcoes: opcoes({ XP: 54231 }) }],
      ["54231 em opcoes + escolha XP", { loteId, opcoes: opcoes({ XP: 54231 }), bancoEscolhido: "XP" }],
      ["0,5 em opcoes (Intex)", { loteId, opcoes: opcoes({ INTEX: 0.5 }) }],
      ["21 em opcoes (Rendimento)", { loteId, opcoes: opcoes({ RENDIMENTO: 21 }) }],
      [
        "54231 em taxasRendimento",
        {
          loteId,
          opcoes: opcoes({ RENDIMENTO: 5.4 }),
          bancoEscolhido: "RENDIMENTO",
          taxasRendimento: [{ lancamentoId: lancId, taxa: 54231 }],
        },
      ],
    ];
    for (const [nome, body] of casos) {
      const r = await patch(body);
      expect(r.status, `${nome}: ${mensagem(r)}`).toBe(400);
      expect(mensagem(r), nome).toMatch(/fora do intervalo permitido \(1 a 20\)/);
    }

    const { lote, lancs } = await estado(loteId);
    expect(lote.bancoEscolhido).toBeNull();
    expect(lote.opcoes.every((o) => o.taxa === null)).toBe(true);
    expect(lancs.every((l) => l.valorReais === null && l.taxa === null)).toBe(true);

    // limites inclusivos passam
    const ok = await patch({ loteId, opcoes: opcoes({ XP: 1, INTEX: 20 }) });
    expect(ok.status, mensagem(ok)).toBe(200);
  });

  // ── 3. Rendimento 1 ordem ─────────────────────────────────────────────────
  it("Rendimento com 1 ordem: valorReais, taxa na linha, taxaEscolhida REAL e total com corretagem", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId, lancId } = await novoLote("REND-1", 1000);

    const r = await patch({
      loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4231 }, { XP: 30, RENDIMENTO: 50, INTEX: 20 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [{ lancamentoId: lancId, taxa: 5.4231 }],
    });
    expect(r.status, mensagem(r)).toBe(200);

    const { lote, lancs } = await estado(loteId);
    expect(lote.bancoEscolhido).toBe("RENDIMENTO");
    expect(lote.taxaEscolhida).toBe(5.4231); // 1 ordem => taxa real, NÃO null
    expect(lancs[0]!.valorReais).toBeCloseTo(5423.1, 6);
    expect(lancs[0]!.taxa).toBe(5.4231);

    // Total do Banco / da foto = Σ valorReais + corretagem do Rendimento (50), uma vez
    const total = calcularTotalReaisLote(lote, lancs);
    expect(total).toBeCloseTo(5423.1 + 50, 6);

    // Total do card da Cotação para o banco em uso = o mesmo número
    const card = montarCotacaoDoLote(lote, lote.opcoes, lancs).find((v) => v.banco === "RENDIMENTO")!;
    expect(card.totalReais).toBeCloseTo(total!, 6);
  });

  // ── 4. Rendimento 3 ordens ────────────────────────────────────────────────
  it("Rendimento com 3 ordens: taxa por linha, taxaEscolhida null e total com corretagem uma vez", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId, lancId: l1 } = await novoLote("REND-3A", 1000);
    const l2 = await addLancamento(loteId, "REND-3B", 500);
    const l3 = await addLancamento(loteId, "REND-3C", 250);

    const r = await patch({
      loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4 }, { RENDIMENTO: 50 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [
        { lancamentoId: l1, taxa: 5.4 },
        { lancamentoId: l2, taxa: 5.47 },
        { lancamentoId: l3, taxa: 5.43 },
      ],
    });
    expect(r.status, mensagem(r)).toBe(200);

    const { lote, lancs } = await estado(loteId);
    const por = Object.fromEntries(lancs.map((l) => [l.invoice, l]));
    expect(lote.bancoEscolhido).toBe("RENDIMENTO");
    expect(lote.taxaEscolhida).toBeNull(); // 2+ ordens => por ordem
    expect(por["REND-3A"]!.valorReais).toBeCloseTo(5400, 6);
    expect(por["REND-3B"]!.valorReais).toBeCloseTo(2735, 6);
    expect(por["REND-3C"]!.valorReais).toBeCloseTo(1357.5, 6);
    expect([por["REND-3A"]!.taxa, por["REND-3B"]!.taxa, por["REND-3C"]!.taxa]).toEqual([5.4, 5.47, 5.43]);
    expect(formatFaixaTaxas(lancs)).toBe("5,4000 – 5,4700");

    // 9492,5 + 50 de corretagem (UMA vez, não por lançamento)
    const total = calcularTotalReaisLote(lote, lancs);
    expect(total).toBeCloseTo(5400 + 2735 + 1357.5 + 50, 6);

    // O card do Rendimento mostra o total REAL, igual ao do Banco/foto
    const card = montarCotacaoDoLote(lote, lote.opcoes, lancs).find((v) => v.banco === "RENDIMENTO")!;
    expect(card.totalReais).toBeCloseTo(total!, 6);
    expect(card.totalReaisReal).toBe(true);
  });

  // ── 5. total com corretagem (XP) ──────────────────────────────────────────
  it("XP: total do lote = totalMoeda × taxa + corretagem do XP (uma vez), igual ao card da Cotação", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId } = await novoLote("XP-1", 1000);
    await addLancamento(loteId, "XP-2", 500);

    const r = await patch({
      loteId,
      opcoes: opcoes({ XP: 5 }, { XP: 30, RENDIMENTO: 50, INTEX: 20 }),
      bancoEscolhido: "XP",
    });
    expect(r.status, mensagem(r)).toBe(200);

    const { lote, lancs } = await estado(loteId);
    const total = calcularTotalReaisLote(lote, lancs);
    expect(total).toBeCloseTo(1500 * 5 + 30, 6); // 7530 (corretagem do XP, não a dos outros)
    const card = montarCotacaoDoLote(lote, lote.opcoes, lancs).find((v) => v.banco === "XP")!;
    expect(card.totalReais).toBeCloseTo(total!, 6);
  });

  // ── 6. lote já cotado => 409 ──────────────────────────────────────────────
  it("lote já cotado: nova escolha e edição de taxas => 409, sem alterar nada", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId, lancId } = await novoLote("LOCK-1", 1000);
    const ok = await patch({ loteId, opcoes: opcoes({ XP: 5 }), bancoEscolhido: "XP" });
    expect(ok.status, mensagem(ok)).toBe(200);
    const antes = await estado(loteId);

    const tentativas: Array<[string, Record<string, unknown>]> = [
      ["outro banco (Intex)", { loteId, opcoes: opcoes({ XP: 5, INTEX: 4.9 }), bancoEscolhido: "INTEX" }],
      ["mesmo banco de novo", { loteId, opcoes: opcoes({ XP: 5 }), bancoEscolhido: "XP" }],
      [
        "Rendimento por ordem",
        {
          loteId,
          opcoes: opcoes({ RENDIMENTO: 5.4 }),
          bancoEscolhido: "RENDIMENTO",
          taxasRendimento: [{ lancamentoId: lancId, taxa: 5.4 }],
        },
      ],
      ["só edição de taxas", { loteId, opcoes: opcoes({ XP: 5.9 }) }],
    ];
    for (const [nome, body] of tentativas) {
      const r = await patch(body);
      expect(r.status, `${nome}: ${mensagem(r)}`).toBe(409);
      expect(mensagem(r), nome).toContain("Lote já cotado");
    }

    const depois = await estado(loteId);
    expect(depois.lote).toEqual(antes.lote);
    expect(depois.lancs).toEqual(antes.lancs);
    expect(depois.lote.bancoEscolhido).toBe("XP");
    expect(depois.lancs[0]!.valorReais).toBeCloseTo(5000, 6);
  });

  // ── 7. invalidação libera a escolha ───────────────────────────────────────
  it("novo lançamento (ou edição) num lote cotado invalida a cotação e libera a escolha de novo", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const { loteId, lancId } = await novoLote("INV-1", 1000);
    const c1 = await patch({
      loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4 }, { RENDIMENTO: 50 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [{ lancamentoId: lancId, taxa: 5.4 }],
    });
    expect(c1.status, mensagem(c1)).toBe(200);
    expect((await patch({ loteId, opcoes: opcoes({ XP: 5 }), bancoEscolhido: "XP" })).status).toBe(409);

    // novo lançamento => invalida tudo (corretagem preservada)
    const l2 = await addLancamento(loteId, "INV-2", 500);
    let s = await estado(loteId);
    expect(s.lote.bancoEscolhido).toBeNull();
    expect(s.lote.taxaEscolhida).toBeNull();
    expect(s.lote.opcoes.every((o) => o.taxa === null)).toBe(true);
    expect(s.lote.opcoes.find((o) => o.banco === "RENDIMENTO")!.taxaCorretagem).toBe(50);
    expect(s.lancs.every((l) => l.valorReais === null && l.taxa === null)).toBe(true);

    // escolha liberada: agora com 2 pendentes o Rendimento exige as duas taxas
    const parcial = await patch({
      loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [{ lancamentoId: lancId, taxa: 5.4 }],
    });
    expect(parcial.status).toBe(400);
    const c2 = await patch({
      loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4 }, { RENDIMENTO: 50 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [
        { lancamentoId: lancId, taxa: 5.4 },
        { lancamentoId: l2, taxa: 5.5 },
      ],
    });
    expect(c2.status, mensagem(c2)).toBe(200);
    s = await estado(loteId);
    expect(s.lote.taxaEscolhida).toBeNull();

    // editar um lançamento também invalida e libera
    await atualizarLancamentoBanco(lancId, { valorMoeda: 1200 });
    s = await estado(loteId);
    expect(s.lote.bancoEscolhido).toBeNull();
    expect(s.lancs.every((l) => l.valorReais === null && l.taxa === null)).toBe(true);
    const c3 = await patch({ loteId, opcoes: opcoes({ XP: 5 }), bancoEscolhido: "XP" });
    expect(c3.status, mensagem(c3)).toBe(200);
  });

  // ── 8. dois lotes abertos da mesma empresa+moeda ──────────────────────────
  it("dois lotes abertos da mesma empresa+moeda: sem vazamento entre eles", async (ctx) => {
    exigeAmbienteSeguro(ctx);
    const a = await novoLote("DOIS-A1", 1000);
    const a2 = await addLancamento(a.loteId, "DOIS-A2", 500);
    const a3 = await addLancamento(a.loteId, "DOIS-A3", 250);
    const c = await novoLote("DOIS-C1", 100);
    expect(c.loteId).not.toBe(a.loteId);

    // C (1 ordem) fecha direto, mesmo havendo 3 pendentes em A
    const rc = await patch({
      loteId: c.loteId,
      opcoes: opcoes({ RENDIMENTO: 5.5 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [{ lancamentoId: c.lancId, taxa: 5.5 }],
    });
    expect(rc.status, mensagem(rc)).toBe(200);

    let sa = await estado(a.loteId);
    const sc = await estado(c.loteId);
    expect(sa.lote.bancoEscolhido).toBeNull();
    expect(sa.lancs).toHaveLength(3);
    expect(sa.lancs.every((l) => l.valorReais === null && l.taxa === null)).toBe(true);
    expect(sc.lote.taxaEscolhida).toBe(5.5);
    expect(sc.lancs).toHaveLength(1);
    expect(sc.lancs[0]!.valorReais).toBeCloseTo(550, 6);

    // id de lançamento do lote A no payload do lote C (e vice-versa) => recusado
    const cruzado = await patch({
      loteId: a.loteId,
      opcoes: opcoes({ RENDIMENTO: 5.5 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [{ lancamentoId: c.lancId, taxa: 5.5 }],
    });
    expect(cruzado.status).toBe(400);

    // C continua travado (409) sem afetar A, e A fecha normalmente com as 3 taxas
    expect((await patch({ loteId: c.loteId, opcoes: opcoes({ XP: 5 }), bancoEscolhido: "XP" })).status).toBe(409);
    const ra = await patch({
      loteId: a.loteId,
      opcoes: opcoes({ RENDIMENTO: 5.4 }),
      bancoEscolhido: "RENDIMENTO",
      taxasRendimento: [
        { lancamentoId: a.lancId, taxa: 5.4 },
        { lancamentoId: a2, taxa: 5.47 },
        { lancamentoId: a3, taxa: 5.43 },
      ],
    });
    expect(ra.status, mensagem(ra)).toBe(200);

    sa = await estado(a.loteId);
    const sc2 = await estado(c.loteId);
    expect(sa.lote.taxaEscolhida).toBeNull();
    expect(sa.lancs.map((l) => l.taxa)).toEqual([5.4, 5.47, 5.43]);
    expect(sc2.lote.taxaEscolhida).toBe(5.5); // C não foi tocado pelo fechamento de A
    expect(sc2.lancs[0]!.taxa).toBe(5.5);
  });

  // ── parseTaxa sanity (cliente) alimentando o servidor ─────────────────────
  it("o que o cliente descarta (texto inválido) nunca vira taxa enviada", () => {
    for (const lixo of ["", "abc", "5.4.2", "0", "-3"]) expect(parseTaxa(lixo)).toBeNull();
  });
});
