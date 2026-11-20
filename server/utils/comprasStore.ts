import { createError } from "h3";
import type { Compra, CompraDaLista, CompraEstado, CamposCompraEditaveis, OrdemCompraEstado } from "../../shared/types/compra";
import { dataBrasiliaDe } from "../../shared/utils/dataBrasilia";
import {
  instanteIso,
  linhaDeItem,
  linhaDeOrdem,
  montarCompra,
  montarCompraDaLista,
  type CompraRow,
  type ItemRow,
  type OrdemRow,
} from "./compraMappers";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";

/**
 * Persistência das Compras (Etapa 4) — tabelas `compras`, `compra_ordens` e `compra_itens` (supabase/migrations/20261119190000_compras.sql).
 * Mesmo molde dos outros stores: cliente admin do servidor, mapeadores puros em compraMappers.ts.
 *
 * REGRAS
 *  - NÃO existe exclusão de COMPRA (o service_role nem tem DELETE na tabela): cancelar é `cancelada = true`.
 *  - O NÚMERO da compra é por MÊS DE BRASÍLIA: ano_mes = mês civil em America/Sao_Paulo (nunca o do fuso do servidor), sequencia =
 *    maior do mês + 1. O unique (ano_mes, sequencia) é a trava: se dois pedidos pegam o mesmo número, o segundo leva 23505 e o
 *    servidor recalcula e tenta de novo (até MAX_TENTATIVAS_NUMERO vezes; esgotou, 503).
 *  - SALVAR (`salvarCompra`) é o salvamento automático: recebe o estado e sincroniza compra, ordens e itens. Concorrência
 *    OTIMISTA: o cliente devolve o `updatedAt` que viu; se mudou, 409 com a versão atual.
 *
 * TRANSAÇÃO — LIMITAÇÃO (explicada em `sincronizarFilhas`): o supabase-js não tem transação e o contrato desta etapa não criou uma
 * função SQL (RPC). Cada chamada é um comando em autocommit. A estratégia é a mais segura sem transação: (1) o UPDATE da compra é
 * "compare-and-swap" pela versão (só um de dois salvamentos simultâneos passa); (2) as posições das ordens e dos itens são trocadas
 * em UM comando (upsert em lista) — as constraints de posição são DEFERRABLE INITIALLY DEFERRED, então só o estado final do
 * comando é conferido —, e quando ordens ou itens entram, saem ou mudam de lugar usam-se posições TEMPORÁRIAS acima de todas as
 * existentes antes das finais, para o meio do caminho nunca violar a unicidade. Uma falha entre dois comandos deixa a compra
 * consistente (só talvez sem as últimas mudanças); o cliente recarrega e salva de novo.
 */

const COMPRAS = "compras";
const ORDENS = "compra_ordens";
const ITENS = "compra_itens";

const CODIGO_UNICO_VIOLADO = "23505";
const CODIGO_CHAVE_ESTRANGEIRA = "23503";
const CODIGO_CHECK_VIOLADO = "23514";

/** Nome da unique de (ano_mes, sequencia) na migration: é ele que identifica a disputa pelo número. */
export const NOME_UNICO_SEQUENCIA = "compras_mes_sequencia_uq";
export const MAX_TENTATIVAS_NUMERO = 5;
/** Quantos ids vão num `in (...)` (a URL do PostgREST tem limite de tamanho). */
const TAMANHO_BLOCO_IN = 100;

export const MENSAGEM_NUMERO_ESGOTADO = "Não foi possível reservar o número da compra agora. Tente novamente em instantes.";
export const MENSAGEM_CONFLITO_VERSAO = "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.";
export const MENSAGEM_COMPRA_CANCELADA = "Esta compra foi cancelada e não pode mais ser editada.";
export const MENSAGEM_ID_DE_OUTRA_COMPRA = "Identificador já usado em outra compra.";
export const MENSAGEM_REFERENCIA_INVALIDA = "Medicamento do Cadastro ou do pré-cadastro não encontrado.";

/** Erro de regra das Compras (409 versão, 409 id alheio, 422 referência, 503 sem número). `data` vai na resposta (ex.: a versão atual). */
export class ComprasRegraError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ComprasRegraError";
  }
}

export function responderErroDeCompra(e: unknown): never {
  if (e instanceof ComprasRegraError) {
    throw createError({ statusCode: e.statusCode, statusMessage: e.message, ...(e.data === undefined ? {} : { data: e.data }) });
  }
  throw e;
}

// ── Número e mês ─────────────────────────────────────────────────────────────────────────────────────────────

/** O mês de BRASÍLIA ("AAAA-MM") do instante — nunca o do fuso do servidor (às 21h de Brasília o UTC já virou o dia). */
export function anoMesDeBrasilia(instante: Date | string | number = new Date()): string {
  return dataBrasiliaDe(instante).slice(0, 7);
}

export const ANO_MES_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

type Db = ReturnType<typeof createSupabaseAdminClient>;

function emBlocos<T>(lista: readonly T[], tamanho = TAMANHO_BLOCO_IN): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) blocos.push(lista.slice(i, i + tamanho));
  return blocos;
}

async function proximaSequencia(db: Db, anoMes: string): Promise<number> {
  const { data, error } = await db.from(COMPRAS).select("sequencia").eq("ano_mes", anoMes).order("sequencia", { ascending: false }).limit(1);
  if (error) throw erro("calcular o número da compra", error);
  const maior = ((data ?? []) as Array<{ sequencia: number }>)[0]?.sequencia ?? 0;
  return maior + 1;
}

const ehDisputaPeloNumero = (e: { message: string; code?: string; details?: string | null }): boolean =>
  e.code === CODIGO_UNICO_VIOLADO && `${e.message} ${e.details ?? ""}`.includes(NOME_UNICO_SEQUENCIA);

/** Insere a compra com o próximo número do mês; se outro pedido pegou o mesmo número (23505), recalcula e tenta de novo. */
async function inserirCompraNumerada(db: Db, base: Omit<CompraRow, "ano_mes" | "sequencia">, anoMes: string): Promise<CompraRow> {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_NUMERO; tentativa++) {
    const sequencia = await proximaSequencia(db, anoMes);
    const { data, error } = await db.from(COMPRAS).insert({ ...base, ano_mes: anoMes, sequencia }).select("*");
    if (!error) {
      const row = ((data ?? []) as CompraRow[])[0];
      if (!row) throw new Error("Supabase: a compra foi criada, mas não voltou na resposta.");
      return row;
    }
    if (ehDisputaPeloNumero(error)) continue;
    throw erro("criar a compra", error);
  }
  throw new ComprasRegraError(MENSAGEM_NUMERO_ESGOTADO, 503);
}

// ── Leitura ──────────────────────────────────────────────────────────────────────────────────────────────────

interface CompraCarregada {
  row: CompraRow;
  ordens: OrdemRow[];
  itens: ItemRow[];
}

async function lerOrdensDe(db: Db, compraIds: readonly string[]): Promise<OrdemRow[]> {
  const todas: OrdemRow[] = [];
  for (const bloco of emBlocos(compraIds)) {
    const { data, error } = await db.from(ORDENS).select("*").in("compra_id", bloco).order("posicao", { ascending: true });
    if (error) throw erro("ler as ordens da compra", error);
    todas.push(...((data ?? []) as OrdemRow[]));
  }
  return todas;
}

async function lerItensDe(db: Db, ordemIds: readonly string[]): Promise<ItemRow[]> {
  const todos: ItemRow[] = [];
  for (const bloco of emBlocos(ordemIds)) {
    const { data, error } = await db.from(ITENS).select("*").in("ordem_id", bloco).order("posicao", { ascending: true });
    if (error) throw erro("ler os itens da compra", error);
    todos.push(...((data ?? []) as ItemRow[]));
  }
  return todos;
}

async function carregar(db: Db, id: string): Promise<CompraCarregada | null> {
  const { data, error } = await db.from(COMPRAS).select("*").eq("id", id);
  if (error) throw erro("buscar a compra", error);
  const row = ((data ?? []) as CompraRow[])[0];
  if (!row) return null;
  const ordens = await lerOrdensDe(db, [id]);
  const itens = await lerItensDe(
    db,
    ordens.map((o) => o.id),
  );
  return { row, ordens, itens };
}

const compraDe = (c: CompraCarregada): Compra => montarCompra(c.row, c.ordens, c.itens);

/** A compra com as ordens e os itens por posição; null se não existe. */
export async function obterCompra(id: string): Promise<Compra | null> {
  const carregada = await carregar(createSupabaseAdminClient(), id);
  return carregada ? compraDe(carregada) : null;
}

/**
 * As compras do mês (AAAA-MM de Brasília), da mais recente para a mais antiga; sem as canceladas, a menos que `incluirCanceladas`.
 * Cada uma com o total de ordens e quantas já foram encaminhadas (sem as ordens em si).
 */
export async function listarComprasDoMes(anoMes: string, opcoes: { incluirCanceladas?: boolean } = {}): Promise<CompraDaLista[]> {
  if (!ANO_MES_RE.test(anoMes)) throw new ComprasRegraError("Mês inválido: use AAAA-MM.", 400);
  const db = createSupabaseAdminClient();
  let consulta = db.from(COMPRAS).select("*").eq("ano_mes", anoMes);
  if (opcoes.incluirCanceladas !== true) consulta = consulta.eq("cancelada", false);
  const { data, error } = await consulta.order("sequencia", { ascending: false });
  if (error) throw erro("listar as compras do mês", error);
  const rows = (data ?? []) as CompraRow[];
  const ordens = await lerOrdensDe(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) =>
    montarCompraDaLista(
      r,
      ordens.filter((o) => o.compra_id === r.id),
    ),
  );
}

// ── Criar, duplicar, cancelar ────────────────────────────────────────────────────────────────────────────────

function linhaNova(id: string, agora: string, por: string, responsavel: string): Omit<CompraRow, "ano_mes" | "sequencia"> {
  return {
    id,
    cancelada: false,
    paciente: "",
    processo_numero: "",
    medico: "",
    local_aplicacao: "",
    entrega: "",
    contatos: "",
    termo_observacao: "",
    despachante: "",
    isencao_para: "",
    observacoes: "",
    vendedor: "",
    responsavel,
    compra_particular: false,
    local_declarado: false,
    termo_posterior: false,
    courier_simples: false,
    isencao: false,
    pagamento_alvara: null,
    pagamento_momento: null,
    documentos: null,
    pendencias: [],
    criado_por: por,
    atualizado_por: por,
    created_at: agora,
    updated_at: agora,
  };
}

/**
 * Cria uma compra VAZIA (rascunho) com o próximo número do mês de Brasília. `responsavel` começa com o nome de quem criou.
 * `agora` só existe para o teste escolher o instante.
 */
export async function criarCompra(usuario: string, opcoes: { agora?: Date } = {}): Promise<Compra> {
  const db = createSupabaseAdminClient();
  const agora = opcoes.agora ?? new Date();
  const row = await inserirCompraNumerada(db, linhaNova(randomId("cmp_"), agora.toISOString(), usuario, usuario), anoMesDeBrasilia(agora));
  return montarCompra(row, [], []);
}

/**
 * Duplica a compra: uma NOVA compra com o próximo número do mês ATUAL de Brasília, com os mesmos dados e as mesmas ordens e itens
 * (ids novos). Limpa po, dir_id e encaminhada_em das ordens e `cancelada`; o resto fica. Se copiar as ordens e itens falhar, a cópia
 * é cancelada (compra não se apaga) e o erro sobe. null = a original não existe.
 */
export async function duplicarCompra(id: string, usuario: string, opcoes: { agora?: Date } = {}): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  const original = await carregar(db, id);
  if (!original) return null;

  const agora = opcoes.agora ?? new Date();
  const instante = agora.toISOString();
  // O número (ano_mes e sequencia) NÃO é copiado: a cópia pega o próximo do mês atual de Brasília.
  const { ano_mes: _anoMesOriginal, sequencia: _sequenciaOriginal, ...dados } = original.row;
  const copia: Omit<CompraRow, "ano_mes" | "sequencia"> = {
    ...dados,
    id: randomId("cmp_"),
    cancelada: false,
    pendencias: [...(dados.pendencias ?? [])],
    criado_por: usuario,
    atualizado_por: usuario,
    created_at: instante,
    updated_at: instante,
  };
  const nova = await inserirCompraNumerada(db, copia, anoMesDeBrasilia(agora));

  try {
    const ordensNovas: Array<Omit<OrdemRow, "dir_id" | "encaminhada_em">> = [];
    const itensNovos: ItemRow[] = [];
    const ordensOrdenadas = [...original.ordens].sort((a, b) => a.posicao - b.posicao);
    for (const [i, ordem] of ordensOrdenadas.entries()) {
      const novoId = randomId("ord_");
      ordensNovas.push(
        linhaDeOrdem(nova.id, i + 1, {
          id: novoId,
          fornecedor: ordem.fornecedor ?? "",
          envio: ordem.envio ?? "",
          cia: ordem.cia ?? "",
          po: "", // o PO é de UMA ordem encaminhada: a cópia começa sem ele
          frete: ordem.frete === null ? null : Number(ordem.frete),
          freteReal: ordem.frete_real === null ? null : Number(ordem.frete_real),
        }),
      );
      const itensDaOrdem = original.itens.filter((x) => x.ordem_id === ordem.id).sort((a, b) => a.posicao - b.posicao);
      for (const [j, item] of itensDaOrdem.entries()) {
        itensNovos.push({ ...item, id: randomId("itm_"), ordem_id: novoId, posicao: j + 1 });
      }
    }
    if (ordensNovas.length > 0) {
      const { error } = await db.from(ORDENS).insert(ordensNovas);
      if (error) throw erro("copiar as ordens da compra", error);
    }
    if (itensNovos.length > 0) {
      const { error } = await db.from(ITENS).insert(itensNovos);
      if (error) throw erro("copiar os itens da compra", error);
    }
  } catch (e) {
    await db.from(COMPRAS).update({ cancelada: true, atualizado_por: usuario, updated_at: new Date().toISOString() }).eq("id", nova.id);
    throw e;
  }
  return obterCompra(nova.id);
}

/** Cancela a compra (cancelada = true; NUNCA um DELETE). Idempotente. null = não existe. */
export async function cancelarCompra(id: string, usuario: string): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  const { data: lidas, error: erroLeitura } = await db.from(COMPRAS).select("*").eq("id", id);
  if (erroLeitura) throw erro("buscar a compra", erroLeitura);
  const row = ((lidas ?? []) as CompraRow[])[0];
  if (!row) return null;
  if (row.cancelada !== true) {
    const { error } = await db
      .from(COMPRAS)
      .update({ cancelada: true, atualizado_por: usuario, updated_at: proximaVersao(row.updated_at) })
      .eq("id", id);
    if (error) throw erro("cancelar a compra", error);
  }
  return obterCompra(id);
}

// ── Salvar (o salvamento automático) ─────────────────────────────────────────────────────────────────────────

const COLUNA_DO_CAMPO: Record<keyof CamposCompraEditaveis, string> = {
  paciente: "paciente",
  processoNumero: "processo_numero",
  medico: "medico",
  localAplicacao: "local_aplicacao",
  entrega: "entrega",
  contatos: "contatos",
  termoObservacao: "termo_observacao",
  despachante: "despachante",
  isencaoPara: "isencao_para",
  observacoes: "observacoes",
  vendedor: "vendedor",
  responsavel: "responsavel",
  compraParticular: "compra_particular",
  localDeclarado: "local_declarado",
  termoPosterior: "termo_posterior",
  courierSimples: "courier_simples",
  isencao: "isencao",
  pagamentoAlvara: "pagamento_alvara",
  pagamentoMomento: "pagamento_momento",
  documentos: "documentos",
  pendencias: "pendencias",
};

/** Só as colunas dos campos que vieram (ausente = não muda). */
function colunasDosCampos(campos: Partial<CamposCompraEditaveis>): Record<string, unknown> {
  const colunas: Record<string, unknown> = {};
  for (const [campo, coluna] of Object.entries(COLUNA_DO_CAMPO) as Array<[keyof CamposCompraEditaveis, string]>) {
    if (campos[campo] !== undefined) colunas[coluna] = campos[campo];
  }
  return colunas;
}

/**
 * A nova versão (updated_at) de uma compra que está na versão `anterior`: agora, mas NUNCA igual nem menor que a anterior (+1 ms no
 * mínimo). Sem isso, dois salvamentos no mesmo milissegundo deixariam a versão igual e o compare-and-swap deixaria os dois passarem.
 */
export function proximaVersao(anterior: string, agora: number = Date.now()): string {
  const base = new Date(anterior).getTime();
  return new Date(Number.isNaN(base) ? agora : Math.max(agora, base + 1)).toISOString();
}

function conflitoDeVersao(atual: Compra): ComprasRegraError {
  return new ComprasRegraError(MENSAGEM_CONFLITO_VERSAO, 409, { atual });
}

/** Erros do banco que são do dado enviado (e não do servidor): referência que não existe e check violado → 422. */
function erroDeEscrita(acao: string, e: { message: string; code?: string }): Error {
  if (e.code === CODIGO_CHAVE_ESTRANGEIRA) return new ComprasRegraError(MENSAGEM_REFERENCIA_INVALIDA, 422);
  if (e.code === CODIGO_CHECK_VIOLADO) return new ComprasRegraError("Algum dado da compra é inválido.", 422);
  return erro(acao, e);
}

/**
 * Um id do corpo que já existe no banco precisa ser DESTA compra. Id de ordem ou de item que pertence a outra compra é recusado
 * (409): sem isto, o upsert por id roubaria a linha de outra compra. Ids que não existem em lugar nenhum são novos (vêm do cliente).
 */
async function conferirIdsDoCorpo(db: Db, atual: CompraCarregada, ordens: readonly OrdemCompraEstado[]): Promise<void> {
  const ordemIdsAtuais = new Set(atual.ordens.map((o) => o.id));
  const itemIdsAtuais = new Set(atual.itens.map((i) => i.id));

  const ordemIds = ordens.map((o) => o.id);
  const itemIds = ordens.flatMap((o) => o.itens.map((i) => i.id));

  async function existentes(tabela: string, ids: readonly string[]): Promise<string[]> {
    const achados: string[] = [];
    for (const bloco of emBlocos(ids)) {
      const { data, error } = await db.from(tabela).select("id").in("id", bloco);
      if (error) throw erro("conferir os identificadores da compra", error);
      achados.push(...((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    }
    return achados;
  }

  const alheiaOrdem = (await existentes(ORDENS, ordemIds)).filter((id) => !ordemIdsAtuais.has(id));
  const alheioItem = (await existentes(ITENS, itemIds)).filter((id) => !itemIdsAtuais.has(id));
  if (alheiaOrdem.length > 0 || alheioItem.length > 0) throw new ComprasRegraError(MENSAGEM_ID_DE_OUTRA_COMPRA, 409);
}

/** A "forma" das ordens: ids das ordens na ordem e, em cada uma, os ids dos itens na ordem. Igual = nada entrou, saiu nem mudou de lugar. */
const formaDe = (ordens: ReadonlyArray<{ id: string; itens: ReadonlyArray<{ id: string }> }>): string =>
  JSON.stringify(ordens.map((o) => [o.id, o.itens.map((i) => i.id)]));

async function apagarPorId(db: Db, tabela: string, ids: readonly string[], acao: string): Promise<void> {
  for (const bloco of emBlocos(ids)) {
    const { error } = await db.from(tabela).delete().in("id", bloco);
    if (error) throw erro(acao, error);
  }
}

async function gravarLista(db: Db, tabela: string, linhas: ReadonlyArray<Record<string, unknown>>, acao: string): Promise<void> {
  if (linhas.length === 0) return;
  const { error } = await db.from(tabela).upsert([...linhas], { onConflict: "id" });
  if (error) throw erroDeEscrita(acao, error);
}

/**
 * Faz as ordens e os itens do banco ficarem iguais ao estado: o que está no estado é gravado (upsert por id, com a posição = a ordem
 * do array, de 1 a N) e o que não está é APAGADO. dir_id e encaminhada_em não entram nunca nas linhas (o upsert os preserva).
 *
 * POR QUE NÃO É UMA TRANSAÇÃO: o supabase-js só faz um comando por chamada. O que protege a unicidade das posições:
 *  1. caminho RÁPIDO (a forma não mudou: mesmas ordens, mesmos itens, mesma ordem): só os dois upserts com as posições finais, que
 *     já são as que existem — nenhuma posição troca de dono;
 *  2. caminho com MUDANÇA de forma (ordem removida do meio, itens trocados de lugar, item movido de ordem, ordem nova): as posições
 *     finais de duas linhas podem colidir com as atuais de outras, e as constraints (deferrable initially deferred) só aceitam isso
 *     DENTRO de um comando. Então: (a) as ordens vão para posições TEMPORÁRIAS acima de todas as atuais; (b) idem os itens;
 *     (c) apaga-se os itens que saíram; (d) apaga-se as ordens que saíram (os itens movidos já estão em outra ordem, a cascata não
 *     os leva); (e) um upsert em lista põe as ordens nas posições finais; (f) idem os itens. Cada passo é um comando que nunca
 *     viola a unicidade. Se um deles falhar, as linhas ficam com posições válidas (as temporárias são >= 1 e únicas) e o próximo
 *     salvamento conserta tudo.
 */
async function sincronizarFilhas(db: Db, compraId: string, atual: CompraCarregada, ordens: readonly OrdemCompraEstado[]): Promise<void> {
  const ordensAtuais = [...atual.ordens].sort((a, b) => a.posicao - b.posicao);
  const itensAtuais = (ordemId: string): ItemRow[] => atual.itens.filter((i) => i.ordem_id === ordemId).sort((a, b) => a.posicao - b.posicao);
  const formaAtual = formaDe(ordensAtuais.map((o) => ({ id: o.id, itens: itensAtuais(o.id) })));

  const linhasDasOrdens = (posicaoDe: (indice: number) => number): Array<Record<string, unknown>> =>
    ordens.map((o, i) => linhaDeOrdem(compraId, posicaoDe(i), o));
  const linhasDosItens = (posicaoDe: (ordemIndice: number, itemIndice: number, sequencial: number) => number): Array<Record<string, unknown>> => {
    let sequencial = 0;
    return ordens.flatMap((o, oi) =>
      o.itens.map((item, ii) => {
        sequencial += 1;
        return linhaDeItem(o.id, posicaoDe(oi, ii, sequencial), item) as unknown as Record<string, unknown>;
      }),
    );
  };

  if (formaDe(ordens) === formaAtual) {
    await gravarLista(db, ORDENS, linhasDasOrdens((i) => i + 1), "gravar as ordens da compra");
    await gravarLista(db, ITENS, linhasDosItens((_oi, ii) => ii + 1), "gravar os itens da compra");
    return;
  }

  const maiorPosicaoDeOrdem = Math.max(0, ...atual.ordens.map((o) => o.posicao));
  const maiorPosicaoDeItem = Math.max(0, ...atual.itens.map((i) => i.posicao));
  await gravarLista(db, ORDENS, linhasDasOrdens((i) => maiorPosicaoDeOrdem + 1 + i), "gravar as ordens da compra");
  await gravarLista(db, ITENS, linhasDosItens((_oi, _ii, n) => maiorPosicaoDeItem + n), "gravar os itens da compra");

  const itemIdsNovos = new Set(ordens.flatMap((o) => o.itens.map((i) => i.id)));
  const ordemIdsNovos = new Set(ordens.map((o) => o.id));
  await apagarPorId(
    db,
    ITENS,
    atual.itens.filter((i) => !itemIdsNovos.has(i.id)).map((i) => i.id),
    "apagar os itens removidos da compra",
  );
  await apagarPorId(
    db,
    ORDENS,
    atual.ordens.filter((o) => !ordemIdsNovos.has(o.id)).map((o) => o.id),
    "apagar as ordens removidas da compra",
  );

  await gravarLista(db, ORDENS, linhasDasOrdens((i) => i + 1), "gravar as ordens da compra");
  await gravarLista(db, ITENS, linhasDosItens((_oi, ii) => ii + 1), "gravar os itens da compra");
}

export interface OpcoesSalvarCompra {
  /**
   * Chamado com a compra como está no banco, DEPOIS de conferir a versão e ANTES de gravar qualquer coisa: é onde as rotas validam
   * o estado contra os Cadastros (e aceitam o valor que a compra já tinha). Se lançar, nada é gravado.
   */
  antesDeGravar?: (atual: Compra) => Promise<void>;
}

/**
 * O salvamento automático: aplica o estado à compra `id` e devolve a compra como ficou. null = não existe.
 *  - 409 se a compra foi CANCELADA, se `atualizadoEm` não é a versão atual (a resposta traz a compra atual em `data.atual`) ou se
 *    um id de ordem/item pertence a outra compra;
 *  - 422 se um medicamento do Cadastro ou pré-cadastro referenciado não existe;
 *  - `campos` ausente/parcial = os que não vieram não mudam; `ordens` ausente = não mexe nas ordens e itens; `ordens` presente =
 *    estado completo (o que não vier é apagado).
 * O UPDATE da compra é compare-and-swap pela versão lida: de dois salvamentos simultâneos só um passa, o outro leva 409.
 */
export async function salvarCompra(id: string, estado: CompraEstado, usuario: string, opcoes: OpcoesSalvarCompra = {}): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  const atual = await carregar(db, id);
  if (!atual) return null;

  const compraAtual = compraDe(atual);
  if (atual.row.cancelada === true) throw new ComprasRegraError(MENSAGEM_COMPRA_CANCELADA, 409, { atual: compraAtual });
  if (estado.atualizadoEm !== instanteIso(atual.row.updated_at)) throw conflitoDeVersao(compraAtual);

  await opcoes.antesDeGravar?.(compraAtual);
  if (estado.ordens) await conferirIdsDoCorpo(db, atual, estado.ordens);

  const { data, error } = await db
    .from(COMPRAS)
    .update({ ...colunasDosCampos(estado.campos), atualizado_por: usuario, updated_at: proximaVersao(atual.row.updated_at) })
    .eq("id", id)
    .eq("updated_at", atual.row.updated_at)
    .select("id");
  if (error) throw erroDeEscrita("atualizar a compra", error);
  if (((data ?? []) as unknown[]).length === 0) {
    // Entre a leitura e a gravação outra pessoa salvou: devolve a versão dela.
    const maisNova = await obterCompra(id);
    if (!maisNova) return null;
    throw conflitoDeVersao(maisNova);
  }

  if (estado.ordens) await sincronizarFilhas(db, id, atual, estado.ordens);
  return obterCompra(id);
}
