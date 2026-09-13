import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BANCOS_CAMBIO, TAXA_CORRETAGEM_PADRAO } from "../../../shared/constants/pagamentos";
import type {
  AtualizarCotacaoDTO,
  AtualizarLancamentoBancoDTO,
  BancoCambio,
  EmpresaPagamento,
  LancamentoBanco,
  LoteBanco,
  Moeda,
  NovoLancamentoBancoDTO,
  TaxaLancamentoRendimento,
} from "../../../shared/types/Pagamento";
import { createSupabaseAdminClient } from "../supabaseServerClient";
import { erro, num, numOrNull, randomId } from "../storeKit";
import { calcularNumeroLote } from "../pagamentoLoteNumero";
import {
  BANCO_COL,
  lancToRow,
  type LancRow,
  loteToRow,
  type LoteRow,
  montarLancamento,
  montarLote,
} from "./bancoMappers";

/**
 * Banco (lotes + lançamentos) — Supabase, tabelas `pagamento_lotes_banco` e
 * `pagamento_lancamentos_banco` (FK lote_id ON DELETE CASCADE).
 *
 * Regras de negócio preservadas exatamente (ver investigação, seções 3a–3c):
 *  3a. destino do lançamento (ver `resolverLoteDestino`): pode haver 2+ lotes
 *      abertos por (empresa+moeda). `dto.forcarLoteNovo` cria um lote novo
 *      (`numeroLote` = maior entre os abertos + 1, ou 1); `dto.loteId` grava
 *      num lote específico (aberto, empresa+moeda batendo); sem nenhum dos dois,
 *      cai no comportamento legado (lote aberto mais recente, cria um se não há).
 *      Entrar num lote que já tinha `bancoEscolhido` invalida a cotação.
 *  3b. `valorReais = valorMoeda * taxa` só em `atualizarCotacaoLote` quando
 *      `dto.bancoEscolhido` vem preenchido, só nos lançamentos com
 *      `valorReais === null`; 400 se a taxa do banco escolhido ainda é null.
 *  3c. `invalidarCotacao`: zera bancoEscolhido/taxaEscolhida e as 3 taxas
 *      cotadas (taxaCorretagem preservada) e volta `valorReais` de todos os
 *      lançamentos do lote pra null. Chamada em criar/editar/remover lançamento.
 *
 * ⚠️ Atomicidade: as operações multi-linha (criar/editar/remover lançamento,
 * atualizar cotação) fazem várias escritas SEQUENCIAIS — o supabase-js não tem
 * transação client-side. Se o processo cair no meio, o estado pode ficar
 * parcial; refazer a mesma ação corrige. Aceitável dado operador único e baixa
 * concorrência. `fecharLoteBanco` é uma linha só (atômico).
 */

const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";

export interface BancoPayload {
  lotes: LoteBanco[];
  lancamentos: LancamentoBanco[];
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

async function proximoNumeroLote(
  db: SupabaseClient,
  empresa: EmpresaPagamento,
  moeda: Moeda,
): Promise<number> {
  const res = await db
    .from(T_LOTES)
    .select("numero_lote")
    .eq("empresa", empresa)
    .eq("moeda", moeda)
    .eq("realizado", false);
  if (res.error) throw erro("buscar numeração dos lotes abertos", res.error);
  const numeros = ((res.data ?? []) as Array<{ numero_lote: number | string }>).map(
    (r) => num(r.numero_lote) || 1,
  );
  return calcularNumeroLote(numeros);
}

function novoLote(empresa: EmpresaPagamento, moeda: Moeda, numeroLote: number): LoteBanco {
  return {
    id: randomId("lote_"),
    data: hoje(),
    empresa,
    moeda,
    numeroLote,
    opcoes: BANCOS_CAMBIO.map((banco) => ({
      banco,
      taxaCorretagem: TAXA_CORRETAGEM_PADRAO,
      taxa: null,
    })),
    bancoEscolhido: null,
    taxaEscolhida: null,
    realizado: false,
    pagoEm: null,
    createdAt: new Date().toISOString(),
  };
}

// Regra 3c — invalida a cotação de um lote: zera banco/taxa escolhidos e as 3
// taxas cotadas (as corretagens permanecem) e devolve `valorReais` (e a `taxa`
// por ordem do Rendimento) de todos os lançamentos do lote a null.
async function invalidarCotacao(db: SupabaseClient, loteId: string): Promise<void> {
  const u1 = await db
    .from(T_LOTES)
    .update({
      banco_escolhido: null,
      taxa_escolhida: null,
      xp_taxa: null,
      rendimento_taxa: null,
      intex_taxa: null,
    })
    .eq("id", loteId);
  if (u1.error) throw erro("invalidar cotação (lote)", u1.error);

  const u2 = await db.from(T_LANC).update({ valor_reais: null, taxa: null }).eq("lote_id", loteId);
  if (u2.error) throw erro("invalidar cotação (lançamentos)", u2.error);
}

// ── Banco: leitura ────────────────────────────────────────────────────────

export async function listarBancoPayload(): Promise<BancoPayload> {
  const db = createSupabaseAdminClient();

  const [lotesRes, lancRes] = await Promise.all([
    db.from(T_LOTES).select("*").order("created_at", { ascending: false }).order("id", { ascending: true }),
    db.from(T_LANC).select("*").order("created_at", { ascending: false }).order("id", { ascending: true }),
  ]);
  if (lotesRes.error) throw erro("listar lotes", lotesRes.error);
  if (lancRes.error) throw erro("listar lançamentos", lancRes.error);

  return {
    lotes: ((lotesRes.data ?? []) as LoteRow[]).map(montarLote),
    lancamentos: ((lancRes.data ?? []) as LancRow[]).map(montarLancamento),
  };
}

// ── Banco: escrita ───────────────────────────────────────────────────────

async function acharLoteAberto(
  db: SupabaseClient,
  empresa: EmpresaPagamento,
  moeda: Moeda,
): Promise<LoteRow | undefined> {
  const res = await db
    .from(T_LOTES)
    .select("*")
    .eq("empresa", empresa)
    .eq("moeda", moeda)
    .eq("realizado", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1);
  if (res.error) throw erro("buscar lote aberto", res.error);
  return (res.data ?? [])[0] as LoteRow | undefined;
}

// Onde o lançamento entra:
//  - dto.forcarLoteNovo  → cria um lote NOVO ("+ Novo lote"), numeroLote calculado
//    na hora; nunca invalida cotação (lote recém-nascido não tem uma).
//  - dto.loteId          → grava neste lote específico ("+ Lançamento" de um card);
//    404 se sumiu, 409 se já pago, 400 se empresa/moeda não batem; invalida a
//    cotação se o lote já tinha banco escolhido (regra 3a/3c).
//  - nenhum dos dois     → comportamento legado: entra no lote aberto dessa
//    (empresa+moeda), criando um (numeroLote 1) se não houver.
async function resolverLoteDestino(
  db: SupabaseClient,
  dto: NovoLancamentoBancoDTO,
): Promise<LoteBanco> {
  if (dto.forcarLoteNovo) {
    const numeroLote = await proximoNumeroLote(db, dto.empresa, dto.moeda);
    const lote = novoLote(dto.empresa, dto.moeda, numeroLote);
    const ins = await db.from(T_LOTES).insert(loteToRow(lote));
    if (ins.error) throw erro("criar lote", ins.error);
    return lote;
  }

  if (dto.loteId) {
    const res = await db.from(T_LOTES).select("*").eq("id", dto.loteId).maybeSingle();
    if (res.error) throw erro("buscar lote alvo", res.error);
    if (!res.data) throw createError({ statusCode: 404, statusMessage: "Lote não encontrado." });
    const row = res.data as LoteRow;
    if (row.realizado) {
      throw createError({
        statusCode: 409,
        statusMessage: "Lote já foi pago; não aceita novos lançamentos.",
      });
    }
    if (row.empresa !== dto.empresa || row.moeda !== dto.moeda) {
      throw createError({
        statusCode: 400,
        statusMessage: "Lote alvo não corresponde à empresa/moeda do lançamento.",
      });
    }
    let lote = montarLote(row);
    if (lote.bancoEscolhido !== null) {
      await invalidarCotacao(db, lote.id);
      lote = {
        ...lote,
        bancoEscolhido: null,
        taxaEscolhida: null,
        opcoes: lote.opcoes.map((o) => ({ ...o, taxa: null })),
      };
    }
    return lote;
  }

  const abertoRow = await acharLoteAberto(db, dto.empresa, dto.moeda);
  if (!abertoRow) {
    const numeroLote = await proximoNumeroLote(db, dto.empresa, dto.moeda);
    const lote = novoLote(dto.empresa, dto.moeda, numeroLote);
    const ins = await db.from(T_LOTES).insert(loteToRow(lote));
    if (ins.error) throw erro("criar lote", ins.error);
    return lote;
  }

  let lote = montarLote(abertoRow);
  if (lote.bancoEscolhido !== null) {
    await invalidarCotacao(db, lote.id);
    lote = {
      ...lote,
      bancoEscolhido: null,
      taxaEscolhida: null,
      opcoes: lote.opcoes.map((o) => ({ ...o, taxa: null })),
    };
  }
  return lote;
}

export async function criarLancamentoBanco(
  dto: NovoLancamentoBancoDTO,
): Promise<{ lancamento: LancamentoBanco; lote: LoteBanco }> {
  const db = createSupabaseAdminClient();

  const lote = await resolverLoteDestino(db, dto);

  const lancamento: LancamentoBanco = {
    id: randomId("lanc_"),
    loteId: lote.id,
    data: lote.data,
    empresa: dto.empresa,
    fornecedor: dto.fornecedor,
    invoice: dto.invoice,
    cliente: dto.cliente,
    valorMoeda: dto.valorMoeda,
    moeda: dto.moeda,
    valorReais: null,
    taxa: null,
    createdAt: new Date().toISOString(),
  };
  const insL = await db.from(T_LANC).insert(lancToRow(lancamento));
  if (insL.error) throw erro("criar lançamento", insL.error);

  return { lancamento, lote };
}

async function acharLancRow(db: SupabaseClient, id: string): Promise<{ lanc: LancRow; lote: LoteRow }> {
  const lancRes = await db.from(T_LANC).select("*").eq("id", id).maybeSingle();
  if (lancRes.error) throw erro("buscar lançamento", lancRes.error);
  if (!lancRes.data) throw createError({ statusCode: 404, statusMessage: "Lançamento não encontrado." });
  const lanc = lancRes.data as LancRow;

  const loteRes = await db.from(T_LOTES).select("*").eq("id", lanc.lote_id).maybeSingle();
  if (loteRes.error) throw erro("buscar lote", loteRes.error);
  if (!loteRes.data) throw createError({ statusCode: 404, statusMessage: "Lote do lançamento não encontrado." });

  return { lanc, lote: loteRes.data as LoteRow };
}

export async function atualizarLancamentoBanco(
  id: string,
  dto: AtualizarLancamentoBancoDTO,
): Promise<BancoPayload> {
  const db = createSupabaseAdminClient();
  const { lote } = await acharLancRow(db, id);
  if (lote.realizado) {
    throw createError({
      statusCode: 409,
      statusMessage: "Lote já foi pago; o lançamento não pode mais ser editado.",
    });
  }

  const patch: Record<string, unknown> = {};
  if (dto.fornecedor !== undefined) patch.fornecedor = dto.fornecedor;
  if (dto.invoice !== undefined) patch.invoice = dto.invoice;
  if (dto.cliente !== undefined) patch.cliente = dto.cliente;
  if (dto.valorMoeda !== undefined) patch.valor_moeda = dto.valorMoeda;
  if (Object.keys(patch).length) {
    const u = await db.from(T_LANC).update(patch).eq("id", id);
    if (u.error) throw erro("atualizar lançamento", u.error);
  }

  if (lote.banco_escolhido !== null) {
    await invalidarCotacao(db, lote.id);
  }

  return listarBancoPayload();
}

export async function removerLancamentoBanco(id: string): Promise<BancoPayload> {
  const db = createSupabaseAdminClient();
  const { lote } = await acharLancRow(db, id);

  const del = await db.from(T_LANC).delete().eq("id", id);
  if (del.error) throw erro("excluir lançamento", del.error);

  const restRes = await db.from(T_LANC).select("id").eq("lote_id", lote.id).limit(1);
  if (restRes.error) throw erro("contar lançamentos do lote", restRes.error);
  const temRestantes = (restRes.data ?? []).length > 0;

  if (!temRestantes) {
    const delLote = await db.from(T_LOTES).delete().eq("id", lote.id);
    if (delLote.error) throw erro("excluir lote vazio", delLote.error);
  } else if (!lote.realizado && lote.banco_escolhido !== null) {
    await invalidarCotacao(db, lote.id);
  }

  return listarBancoPayload();
}

// Responsabilidade 1 de 4 de atualizarCotacaoLote: monta o patch das taxas/
// corretagens editadas por banco (sempre aplicado, independente de escolher
// um banco ou não).
function montarPatchOpcoes(dto: AtualizarCotacaoDTO): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (dto.opcoes) {
    for (const entrada of dto.opcoes) {
      const col = BANCO_COL[entrada.banco];
      if (!col) continue;
      patch[col.corretagem] = entrada.taxaCorretagem;
      patch[col.taxa] = entrada.taxa;
    }
  }
  return patch;
}

interface EscolhaBancoResultado {
  patch: Record<string, unknown>;
  recalcTaxaUnica: number | null;
  taxasPorOrdem: TaxaLancamentoRendimento[] | null;
}

// Responsabilidade 2 de 4: ramo Rendimento — fecha POR ORDEM, cada lançamento
// pendente com a sua taxa (vinda do modal); o lote só guarda uma taxa única
// quando há exatamente 1 pendente (não há variação possível nesse caso).
async function escolherBancoRendimento(
  db: SupabaseClient,
  loteId: string,
  taxasRendimento: TaxaLancamentoRendimento[] | undefined,
): Promise<EscolhaBancoResultado> {
  const pend = await db
    .from(T_LANC)
    .select("id")
    .eq("lote_id", loteId)
    .is("valor_reais", null);
  if (pend.error) throw erro("buscar lançamentos pendentes", pend.error);
  const pendenteIds = ((pend.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (pendenteIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Não há lançamentos pendentes neste lote para fechar pelo Rendimento.",
    });
  }

  // Mesma checagem de `taxasRendimentoCompletas` (app/utils/pagamentoCalculations):
  // uma taxa > 0 pra CADA pendente — fechamento parcial não é permitido.
  const porId = new Map((taxasRendimento ?? []).map((t) => [t.lancamentoId, t.taxa]));
  const completo = pendenteIds.every((id) => {
    const t = porId.get(id);
    return typeof t === "number" && Number.isFinite(t) && t > 0;
  });
  if (!completo) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Informe a taxa de todos os lançamentos pendentes do lote antes de fechar pelo Rendimento.",
    });
  }

  return {
    patch: {
      banco_escolhido: "RENDIMENTO",
      // 1 pendente → taxa representativa do lote; 2+ → null (só faz sentido "por ordem").
      taxa_escolhida: pendenteIds.length === 1 ? (porId.get(pendenteIds[0]!) as number) : null,
    },
    recalcTaxaUnica: null,
    taxasPorOrdem: taxasRendimento ?? [],
  };
}

// Responsabilidade 3 de 4: ramo banco único (XP/Intex) — aplica a taxa única
// do card a todos os lançamentos pendentes do lote.
function escolherBancoUnico(
  loteRow: LoteRow,
  bancoEscolhido: BancoCambio,
  opcoes: AtualizarCotacaoDTO["opcoes"],
): EscolhaBancoResultado {
  const doDto = opcoes?.find((o) => o.banco === bancoEscolhido);
  const taxaEfetiva = doDto ? doDto.taxa : numOrNull(loteRow[BANCO_COL[bancoEscolhido].taxa]);
  if (taxaEfetiva === null) {
    throw createError({
      statusCode: 400,
      statusMessage: "Preencha a taxa do banco antes de escolhê-lo.",
    });
  }
  return {
    patch: { banco_escolhido: bancoEscolhido, taxa_escolhida: taxaEfetiva },
    recalcTaxaUnica: taxaEfetiva,
    taxasPorOrdem: null,
  };
}

// Responsabilidade 4 de 4: recálculo de valor_reais dos lançamentos pendentes
// do lote — pela taxa única (XP/Intex) ou pela taxa por ordem (Rendimento).
async function recalcularValorReais(
  db: SupabaseClient,
  loteId: string,
  recalcTaxaUnica: number | null,
  taxasPorOrdem: TaxaLancamentoRendimento[] | null,
): Promise<void> {
  if (recalcTaxaUnica === null && taxasPorOrdem === null) return;

  const pend = await db
    .from(T_LANC)
    .select("id, valor_moeda")
    .eq("lote_id", loteId)
    .is("valor_reais", null);
  if (pend.error) throw erro("buscar lançamentos pendentes", pend.error);
  const porOrdem = taxasPorOrdem
    ? new Map(taxasPorOrdem.map((t) => [t.lancamentoId, t.taxa]))
    : null;
  for (const r of (pend.data ?? []) as Array<{ id: string; valor_moeda: number | string }>) {
    const taxa = porOrdem ? porOrdem.get(r.id) : recalcTaxaUnica;
    if (taxa == null) continue; // Rendimento: completude já validada; guarda defensiva
    const campos: Record<string, unknown> = { valor_reais: num(r.valor_moeda) * taxa };
    if (porOrdem) campos.taxa = taxa; // registra a taxa por ordem só no Rendimento
    const u = await db.from(T_LANC).update(campos).eq("id", r.id);
    if (u.error) throw erro("recalcular valorReais", u.error);
  }
}

export async function atualizarCotacaoLote(
  loteId: string,
  dto: AtualizarCotacaoDTO,
): Promise<BancoPayload> {
  const db = createSupabaseAdminClient();

  const loteRes = await db.from(T_LOTES).select("*").eq("id", loteId).maybeSingle();
  if (loteRes.error) throw erro("buscar lote", loteRes.error);
  if (!loteRes.data) throw createError({ statusCode: 404, statusMessage: "Lote não encontrado." });
  const loteRow = loteRes.data as LoteRow;
  if (loteRow.realizado) {
    throw createError({ statusCode: 409, statusMessage: "Lote já foi pago; cotação bloqueada." });
  }

  let patch = montarPatchOpcoes(dto);

  // "Usar este banco" (regra 3): no máximo um dos dois ramos roda, e só quando
  // `dto.bancoEscolhido` vem preenchido.
  let recalcTaxaUnica: number | null = null;
  let taxasPorOrdem: TaxaLancamentoRendimento[] | null = null;

  if (dto.bancoEscolhido === "RENDIMENTO") {
    const resultado = await escolherBancoRendimento(db, loteId, dto.taxasRendimento);
    patch = { ...patch, ...resultado.patch };
    recalcTaxaUnica = resultado.recalcTaxaUnica;
    taxasPorOrdem = resultado.taxasPorOrdem;
  } else if (dto.bancoEscolhido) {
    const resultado = escolherBancoUnico(loteRow, dto.bancoEscolhido, dto.opcoes);
    patch = { ...patch, ...resultado.patch };
    recalcTaxaUnica = resultado.recalcTaxaUnica;
    taxasPorOrdem = resultado.taxasPorOrdem;
  }

  if (Object.keys(patch).length) {
    const u = await db.from(T_LOTES).update(patch).eq("id", loteId);
    if (u.error) throw erro("atualizar cotação", u.error);
  }

  await recalcularValorReais(db, loteId, recalcTaxaUnica, taxasPorOrdem);

  return listarBancoPayload();
}

export async function fecharLoteBanco(loteId: string): Promise<LoteBanco> {
  const db = createSupabaseAdminClient();

  const loteRes = await db.from(T_LOTES).select("*").eq("id", loteId).maybeSingle();
  if (loteRes.error) throw erro("buscar lote", loteRes.error);
  if (!loteRes.data) throw createError({ statusCode: 404, statusMessage: "Lote não encontrado." });
  const loteRow = loteRes.data as LoteRow;

  if (loteRow.banco_escolhido === null) {
    throw createError({
      statusCode: 400,
      statusMessage: "Escolha um banco na Cotação antes de marcar como pago.",
    });
  }

  const u = await db
    .from(T_LOTES)
    .update({ realizado: true, pago_em: new Date().toISOString() })
    .eq("id", loteId)
    .select("*");
  if (u.error) throw erro("fechar lote", u.error);

  return montarLote((u.data ?? [])[0] as LoteRow);
}
