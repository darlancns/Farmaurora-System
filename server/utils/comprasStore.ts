import { CODIGO_NUMERO_JA_EXISTE, COMPRA_LISTA_POR_PAGINA } from "../../shared/constants/compra";
import { EMPRESAS_PROCESSO } from "../../shared/constants/processos";
import type { Compra, CompraDaLista, CompraEstado, CamposCompraEditaveis, ItemCompraEstado, ListaCompras, StatusPreCadastro, TotaisDaLista } from "../../shared/types/compra";
import { compararDaLista, type OrdemDaLista } from "../../shared/utils/compraLista";
import { descricaoDaCompra } from "../../shared/utils/compraMes";
import { dataBrasiliaDe } from "../../shared/utils/dataBrasilia";
import {
  COLUNAS_LISTA_COMPRA,
  COLUNAS_LISTA_ITEM,
  instanteIso,
  linhaDeItem,
  montarCompra,
  montarCompraDaLista,
  preCadastroDoItem,
  type CompraListaRow,
  type CompraRow,
  type ItemListaRow,
  type ItemRow,
  type StatusDosPreCadastros,
} from "./compraMappers";
import { nomesDosMedicamentosDoCadastro } from "./comprasCatalogo";
import { ComprasRegraError } from "./comprasErro";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";

/**
 * Persistência das Compras — tabelas `compras` e `compra_itens` (supabase/migrations/20261121130000_compras_uma_por_fornecedor.sql): UMA compra
 * por fornecedor, com os medicamentos como itens dela. Mesmo molde dos outros stores: cliente admin do servidor, mapeadores puros em compraMappers.ts.
 *
 * REGRAS
 *  - O NÚMERO da compra (`sequencia`) é DIGITADO pelo time (Bruno e Rebeca combinam; ele pode sair fora de ordem): o servidor NUNCA o gera. É
 *    único dentro do mês (ano_mes): um número que já existe naquele mês (inclusive de compra CANCELADA, que continua ocupando o número) é 409
 *    com mensagem amigável (`data.code` = CODIGO_NUMERO_JA_EXISTE), na criação, na duplicação e na troca do número de uma compra. O unique
 *    (ano_mes, sequencia) do banco é a trava final: uma corrida entre dois usuários vira 23505 e é traduzida para o MESMO 409, SEM tentar
 *    de novo com outro número.
 *  - `ano_mes` é o mês civil de Brasília (America/Sao_Paulo, nunca o do fuso do servidor).
 *  - CANCELAR é `cancelada = true` (a compra continua na lista, só para leitura). APAGAR (`apagarCompra`) é um DELETE de verdade: leva os itens
 *    (ON DELETE CASCADE), libera o número e NÃO leva os pré-cadastros de medicamento pedidos a partir dela (eles só perdem o vínculo com a compra).
 *  - SALVAR (`salvarCompra`) é o salvamento automático: recebe o estado e sincroniza a compra e os itens. Concorrência
 *    OTIMISTA: o cliente devolve o `updatedAt` que viu; se mudou, 409 com a versão atual.
 *  - O estado da compra é só DERIVADO: ativa ou cancelada (não há coluna de estado).
 *
 * TRANSAÇÃO — LIMITAÇÃO (explicada em `sincronizarItens`): o supabase-js não tem transação e o contrato não criou uma função SQL (RPC).
 * Cada chamada é um comando em autocommit. A estratégia é a mais segura sem transação: (1) o UPDATE da compra é "compare-and-swap"
 * pela versão (só um de dois salvamentos simultâneos passa); (2) as posições dos itens são trocadas em UM comando (upsert em lista) — a
 * constraint de posição é DEFERRABLE INITIALLY DEFERRED, então só o estado final do comando é conferido —, e quando itens entram,
 * saem ou mudam de lugar usam-se posições TEMPORÁRIAS acima de todas as existentes antes das finais, para o meio do caminho nunca violar
 * a unicidade. Uma falha entre dois comandos deixa a compra consistente (só talvez sem as últimas mudanças); o cliente recarrega e salva de novo.
 */

const COMPRAS = "compras";
const ITENS = "compra_itens";
const PRE_CADASTROS = "pre_cadastro_medicamentos";

const CODIGO_UNICO_VIOLADO = "23505";
const CODIGO_CHAVE_ESTRANGEIRA = "23503";
const CODIGO_CHECK_VIOLADO = "23514";

/** Nome da unique de (ano_mes, sequencia) na migration: é ele que identifica a disputa pelo número. */
export const NOME_UNICO_SEQUENCIA = "compras_mes_sequencia_uq";
/** Quantos ids vão num `in (...)` (a URL do PostgREST tem limite de tamanho). */
const TAMANHO_BLOCO_IN = 100;

export const MENSAGEM_CONFLITO_VERSAO = "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.";
export const MENSAGEM_COMPRA_CANCELADA = "Esta compra foi cancelada e não pode mais ser editada.";
export const MENSAGEM_ID_DE_OUTRA_COMPRA = "Identificador já usado em outra compra.";
export const MENSAGEM_REFERENCIA_INVALIDA = "Medicamento do Cadastro ou do pré-cadastro não encontrado.";

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

const ehDisputaPeloNumero = (e: { message: string; code?: string; details?: string | null }): boolean =>
  e.code === CODIGO_UNICO_VIOLADO && `${e.message} ${e.details ?? ""}`.includes(NOME_UNICO_SEQUENCIA);

/** Quem já ocupa o número naquele mês (qualquer compra, ativa ou cancelada): só o que a mensagem de conflito mostra. */
interface DonoDoNumero {
  id: string;
  consultor: string | null;
  fornecedor: string | null;
}

async function donoDoNumero(db: Db, anoMes: string, sequencia: number): Promise<DonoDoNumero | null> {
  const { data, error } = await db.from(COMPRAS).select("id, consultor, fornecedor").eq("ano_mes", anoMes).eq("sequencia", sequencia);
  if (error) throw erro("conferir o número da compra", error);
  return ((data ?? []) as DonoDoNumero[])[0] ?? null;
}

/**
 * "A Compra 14 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.": do dono do número aparecem SÓ o consultor e o fornecedor
 * (nada de paciente, medicamento nem valores); sem nenhum dos dois, sem parênteses.
 */
export function mensagemNumeroJaExiste(anoMes: string, sequencia: number, dono: Pick<DonoDoNumero, "consultor" | "fornecedor"> | null): string {
  const detalhes = [dono?.consultor, dono?.fornecedor].map((t) => (t ?? "").trim()).filter((t) => t !== "");
  return `A ${descricaoDaCompra(anoMes, sequencia)} já existe${detalhes.length > 0 ? ` (${detalhes.join(", ")})` : ""}. Escolha outro número.`;
}

/** O 409 do número repetido. `data` leva só o código (a tela o distingue do 409 de versão) e o número pedido. */
function erroNumeroJaExiste(anoMes: string, sequencia: number, dono: DonoDoNumero | null): ComprasRegraError {
  return new ComprasRegraError(mensagemNumeroJaExiste(anoMes, sequencia, dono), 409, { code: CODIGO_NUMERO_JA_EXISTE, anoMes, sequencia });
}

/** O número está livre naquele mês? Senão, 409. `exceto` é a própria compra (trocar o número dela não conflita com ela mesma). */
async function conferirNumeroLivre(db: Db, anoMes: string, sequencia: number, exceto?: string): Promise<void> {
  const dono = await donoDoNumero(db, anoMes, sequencia);
  if (dono && dono.id !== exceto) throw erroNumeroJaExiste(anoMes, sequencia, dono);
}

/**
 * Corrida entre dois usuários: a conferência passou, mas outro gravou o mesmo número antes e o banco devolveu 23505 em
 * compras_mes_sequencia_uq. Vira o MESMO 409 amigável (sem tentar de novo com outro número). Outro erro: não faz nada (quem chama segue).
 */
async function traduzirDisputaPeloNumero(db: Db, e: { message: string; code?: string; details?: string | null }, anoMes: string, sequencia: number): Promise<void> {
  if (!ehDisputaPeloNumero(e)) return;
  throw erroNumeroJaExiste(anoMes, sequencia, await donoDoNumero(db, anoMes, sequencia));
}

/** Insere a compra com o número DIGITADO no mês dado: ocupado = 409 (conferido antes e, se houver corrida, pelo 23505 do banco). */
async function inserirCompra(db: Db, base: Omit<CompraRow, "ano_mes" | "sequencia">, anoMes: string, sequencia: number): Promise<CompraRow> {
  await conferirNumeroLivre(db, anoMes, sequencia);
  const { data, error } = await db.from(COMPRAS).insert({ ...base, ano_mes: anoMes, sequencia }).select("*");
  if (error) {
    await traduzirDisputaPeloNumero(db, error, anoMes, sequencia);
    throw erro("criar a compra", error);
  }
  const row = ((data ?? []) as CompraRow[])[0];
  if (!row) throw new Error("Supabase: a compra foi criada, mas não voltou na resposta.");
  return row;
}

// ── Leitura ──────────────────────────────────────────────────────────────────────────────────────────────────

interface CompraCarregada {
  row: CompraRow;
  itens: ItemRow[];
  /** O estado (pendente, aprovado, rejeitado) dos pré-cadastros que os itens ainda mostram: a tela avisa quando foi rejeitado. */
  statusPre: StatusDosPreCadastros;
  /** O nome, no Cadastro, de cada medicamento ligado a um item (só leitura: vira `medicamentoCadastroNome`). */
  nomesDoCadastro: ReadonlyMap<string, string>;
}

async function lerItensDe(db: Db, compraId: string): Promise<ItemRow[]> {
  const { data, error } = await db.from(ITENS).select("*").eq("compra_id", compraId).order("posicao", { ascending: true });
  if (error) throw erro("ler os itens da compra", error);
  return (data ?? []) as ItemRow[];
}

/** Só os pré-cadastros que algum item ainda mostra (item já ligado ao Cadastro não conta); sem nenhum, nem consulta. */
async function lerStatusDosPreCadastros(db: Db, itens: readonly ItemRow[]): Promise<StatusDosPreCadastros> {
  const ids = [...new Set(itens.map((i) => preCadastroDoItem(i)).filter((x): x is string => x !== null))];
  const status = new Map<string, StatusPreCadastro>();
  for (const bloco of emBlocos(ids)) {
    const { data, error } = await db.from(PRE_CADASTROS).select("id, status").in("id", bloco);
    if (error) throw erro("ler o estado dos pré-cadastros da compra", error);
    for (const p of (data ?? []) as Array<{ id: string; status: StatusPreCadastro }>) status.set(p.id, p.status);
  }
  return status;
}

async function carregar(db: Db, id: string): Promise<CompraCarregada | null> {
  const { data, error } = await db.from(COMPRAS).select("*").eq("id", id);
  if (error) throw erro("buscar a compra", error);
  const row = ((data ?? []) as CompraRow[])[0];
  if (!row) return null;
  const itens = await lerItensDe(db, id);
  const idsDoCadastro = [...new Set(itens.map((i) => i.medicamento_cadastro_id).filter((x): x is string => x !== null && x !== ""))];
  return { row, itens, statusPre: await lerStatusDosPreCadastros(db, itens), nomesDoCadastro: await nomesDosMedicamentosDoCadastro(idsDoCadastro) };
}

const compraDe = (c: CompraCarregada): Compra => montarCompra(c.row, c.itens, c.statusPre, c.nomesDoCadastro);

/** A compra com os itens por posição; null se não existe. */
export async function obterCompra(id: string): Promise<Compra | null> {
  const carregada = await carregar(createSupabaseAdminClient(), id);
  return carregada ? compraDe(carregada) : null;
}

const TAMANHO_PAGINA_LEITURA = 1000;

/** Lê TODAS as linhas de uma consulta em páginas de 1000 (o PostgREST corta em silêncio), por ordem estável (`id`). */
async function lerTudo<T>(acao: string, pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA_LEITURA) {
    const { data, error } = await pagina(de, de + TAMANHO_PAGINA_LEITURA - 1);
    if (error) throw erro(acao, error);
    const linhas = (data ?? []) as T[];
    todas.push(...linhas);
    if (linhas.length < TAMANHO_PAGINA_LEITURA) break;
  }
  return todas;
}

export interface OpcoesLista {
  /** Junto com as ativas, também as canceladas. Sem isto, só as ativas. */
  incluirCanceladas?: boolean;
  /** A partir de 1. */
  pagina?: number;
  limite?: number;
  /** A visão: "numero" (do maior Nº para o menor, o padrão) ou "recentes" (a versão mais nova primeiro). */
  ordem?: OrdemDaLista;
  /** Vira a ordem de cabeça para baixo. */
  inverter?: boolean;
}

/**
 * As compras do mês (AAAA-MM de Brasília) para o painel esquerdo: do maior Nº para o menor (ou, com `ordem: "recentes"`, a mais mexida primeiro), 50 por vez
 * ("mostrar mais"). O estado é só derivado (ativa ou cancelada): o servidor lê o mês inteiro só das colunas que a linha usa (nada de
 * contatos, valores nem observações), conta os `totais` do mês TODO e devolve só a página pedida. A DIR não é consultada.
 */
export async function listarComprasDoMes(anoMes: string, opcoes: OpcoesLista = {}): Promise<ListaCompras> {
  if (!ANO_MES_RE.test(anoMes)) throw new ComprasRegraError("Mês inválido: use AAAA-MM.", 400);
  const db = createSupabaseAdminClient();
  const limite = opcoes.limite ?? COMPRA_LISTA_POR_PAGINA;
  const pagina = opcoes.pagina ?? 1;

  const rows = await lerTudo<CompraListaRow>("listar as compras do mês", (de, ate) =>
    db.from(COMPRAS).select(COLUNAS_LISTA_COMPRA).eq("ano_mes", anoMes).order("sequencia", { ascending: false }).order("id", { ascending: true }).range(de, ate),
  );

  const itens: ItemListaRow[] = [];
  for (const bloco of emBlocos(rows.map((r) => r.id))) {
    itens.push(...(await lerTudo<ItemListaRow>("ler os itens da lista", (de, ate) => db.from(ITENS).select(COLUNAS_LISTA_ITEM).in("compra_id", bloco).order("id", { ascending: true }).range(de, ate))));
  }
  const itensDe = new Map<string, ItemListaRow[]>();
  for (const i of itens) itensDe.set(i.compra_id, [...(itensDe.get(i.compra_id) ?? []), i]);

  const totais: TotaisDaLista = { ativas: 0, canceladas: 0 };
  const casam: CompraDaLista[] = [];
  // O maior número do mês, contando TAMBÉM as canceladas (elas continuam ocupando o número): é de onde sai a sugestão do próximo.
  const maiorSequencia = rows.reduce((maior, r) => Math.max(maior, r.sequencia), 0);
  for (const row of rows) {
    const item = montarCompraDaLista(row, itensDe.get(row.id) ?? []);
    if (item.cancelada) totais.canceladas += 1;
    else totais.ativas += 1;
    if (!item.cancelada || opcoes.incluirCanceladas === true) casam.push(item);
  }

  // A leitura já veio em sequencia desc; a visão escolhida (e o sentido) reordena com o MESMO comparador do cliente. A página é uma fatia, e
  // `temMais` diz se sobrou alguma depois dela.
  casam.sort(compararDaLista(opcoes.ordem ?? "numero", opcoes.inverter === true));
  const de = (pagina - 1) * limite;
  return {
    anoMes,
    maiorSequencia,
    compras: casam.slice(de, de + limite),
    pagina,
    limite,
    temMais: casam.length > de + limite,
    total: casam.length,
    totais,
  };
}

// ── Criar, duplicar, cancelar ────────────────────────────────────────────────────────────────────────────────

function linhaNova(id: string, agora: string, por: string, responsavel: string): Omit<CompraRow, "ano_mes" | "sequencia"> {
  return {
    id,
    cancelada: false,
    fornecedor: "",
    envio: "",
    cia: "",
    frete: null,
    frete_real: null,
    empresa: EMPRESAS_PROCESSO[0]!,
    numero_ordens: 1,
    paciente: "",
    processo_numero: "",
    medico: "",
    local_aplicacao: "",
    entrega: "",
    contatos: "",
    termo_observacao: "",
    despachante: "",
    observacoes: "",
    consultor: "",
    responsavel,
    compra_particular: false,
    termo_posterior: false,
    isencao: false,
    recorrente: false,
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

/** O número DIGITADO (e o mês, que sem `anoMes` é o corrente de Brasília) de uma compra nova ou duplicada. `agora` só existe para o teste escolher o instante. */
export interface EntradaNovaCompra {
  sequencia: number;
  anoMes?: string;
  agora?: Date;
}

/**
 * Cria uma compra VAZIA com o número DIGITADO: empresa FARMAURORA, numeroOrdens 1, sem medicamentos. `responsavel` começa com o nome de quem criou.
 * Número que já existe no mês (inclusive de compra cancelada) = 409; o servidor nunca escolhe outro número sozinho.
 */
export async function criarCompra(usuario: string, entrada: EntradaNovaCompra): Promise<Compra> {
  const db = createSupabaseAdminClient();
  const agora = entrada.agora ?? new Date();
  const anoMes = entrada.anoMes ?? anoMesDeBrasilia(agora);
  const row = await inserirCompra(db, linhaNova(randomId("cmp_"), agora.toISOString(), usuario, usuario), anoMes, entrada.sequencia);
  return montarCompra(row, []);
}

/**
 * Duplica a compra: uma NOVA compra com o número DIGITADO, com os mesmos dados e os mesmos medicamentos (ids novos). Só `cancelada` volta a
 * false; o resto fica. O número da original NUNCA é copiado nem sugerido pelo servidor. Número que já existe no mês = 409 (nada é criado).
 * Se copiar os itens falhar, a cópia é cancelada e o erro sobe. null = a original não existe.
 */
export async function duplicarCompra(id: string, usuario: string, entrada: EntradaNovaCompra): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  const original = await carregar(db, id);
  if (!original) return null;

  const agora = entrada.agora ?? new Date();
  const instante = agora.toISOString();
  const anoMes = entrada.anoMes ?? anoMesDeBrasilia(agora);
  // O número (ano_mes e sequencia) NÃO é copiado: a cópia leva o que foi digitado.
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
  const nova = await inserirCompra(db, copia, anoMes, entrada.sequencia);

  try {
    const itensNovos: ItemRow[] = [...original.itens]
      .sort((a, b) => a.posicao - b.posicao)
      .map((item, j) => ({
        id: randomId("itm_"),
        compra_id: nova.id,
        posicao: j + 1,
        medicamento: item.medicamento,
        medicamento_cadastro_id: item.medicamento_cadastro_id,
        pre_cadastro_id: item.pre_cadastro_id,
        brand: item.brand,
        laboratorio: item.laboratorio,
        quantidade: item.quantidade,
        temperatura: item.temperatura,
        valor_unitario: item.valor_unitario,
        valor_real: item.valor_real,
      }));
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

/** Cancela a compra (cancelada = true; não apaga nada). Idempotente. null = não existe. */
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

export const MENSAGEM_APAGAR_SEM_PERMISSAO_NO_BANCO =
  "Apagar compras ainda não está liberado no banco de dados. Peça ao administrador do sistema para liberar e tente de novo.";
export const MENSAGEM_APAGAR_COMPRA_EM_USO = "Não foi possível apagar a compra: ela ainda é usada por outro registro.";
const CODIGO_SEM_PERMISSAO = "42501";

/**
 * APAGA a compra de verdade (DELETE): ela e os itens dela (ON DELETE CASCADE) somem e o número fica livre para outra compra do mês.
 * Os pré-cadastros de medicamento que foram pedidos a partir dela (pre_cadastro_medicamentos.compra_id, FK SEM ação) NÃO são apagados: se a FK
 * barrar (23503), eles só perdem o vínculo (compra_id = null) e o DELETE é tentado de novo UMA vez; com `ON DELETE SET NULL` no banco o 1º DELETE já passa.
 * Sem o privilégio DELETE em `compras` (42501), erro claro (503) e NADA muda. true = apagou; false = a compra não existe (ou outra pessoa já a apagou).
 */
export async function apagarCompra(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data: lidas, error: erroLeitura } = await db.from(COMPRAS).select("id").eq("id", id);
  if (erroLeitura) throw erro("buscar a compra", erroLeitura);
  if (((lidas ?? []) as unknown[]).length === 0) return false;

  const apagar = () => db.from(COMPRAS).delete().eq("id", id).select("id");
  let resultado = await apagar();
  if (resultado.error?.code === CODIGO_CHAVE_ESTRANGEIRA) {
    // Os pré-cadastros pedidos por esta compra seguem existindo (o Cadastro ainda decide); só deixam de apontar para ela.
    const { error: erroVinculo } = await db.from(PRE_CADASTROS).update({ compra_id: null }).eq("compra_id", id);
    if (erroVinculo) throw erro("soltar os pré-cadastros da compra", erroVinculo);
    resultado = await apagar();
  }
  const { data, error } = resultado;
  if (error) {
    if (error.code === CODIGO_SEM_PERMISSAO) throw new ComprasRegraError(MENSAGEM_APAGAR_SEM_PERMISSAO_NO_BANCO, 503);
    if (error.code === CODIGO_CHAVE_ESTRANGEIRA) throw new ComprasRegraError(MENSAGEM_APAGAR_COMPRA_EM_USO, 409);
    throw erro("apagar a compra", error);
  }
  return ((data ?? []) as unknown[]).length > 0;
}

// ── Salvar (o salvamento automático) ─────────────────────────────────────────────────────────────────────────

const COLUNA_DO_CAMPO: Record<keyof CamposCompraEditaveis, string> = {
  sequencia: "sequencia",
  fornecedor: "fornecedor",
  envio: "envio",
  cia: "cia",
  empresa: "empresa",
  numeroOrdens: "numero_ordens",
  frete: "frete",
  freteReal: "frete_real",
  paciente: "paciente",
  processoNumero: "processo_numero",
  compraParticular: "compra_particular",
  recorrente: "recorrente",
  medico: "medico",
  localAplicacao: "local_aplicacao",
  entrega: "entrega",
  contatos: "contatos",
  despachante: "despachante",
  pagamentoAlvara: "pagamento_alvara",
  pagamentoMomento: "pagamento_momento",
  termoPosterior: "termo_posterior",
  termoObservacao: "termo_observacao",
  isencao: "isencao",
  documentos: "documentos",
  pendencias: "pendencias",
  observacoes: "observacoes",
  consultor: "consultor",
  responsavel: "responsavel",
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

const TENTATIVAS_DE_VERSAO = 3;

/**
 * Sobe a versão da compra (compare-and-swap relendo a versão atual; até 3 tentativas): editar em outra aba depois disto leva 409. Usado pela
 * decisão de pré-cadastros (que muda a compra por fora do salvamento). Compra que não existe mais: não faz nada.
 */
export async function subirVersaoDaCompra(compraId: string): Promise<void> {
  const db = createSupabaseAdminClient();
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_VERSAO; tentativa++) {
    const { data: lida, error: erroLeitura } = await db.from(COMPRAS).select("updated_at").eq("id", compraId);
    if (erroLeitura) throw erro("ler a versão da compra", erroLeitura);
    const atual = ((lida ?? []) as Array<{ updated_at: string }>)[0]?.updated_at;
    if (!atual) return;
    const { data, error } = await db.from(COMPRAS).update({ updated_at: proximaVersao(atual) }).eq("id", compraId).eq("updated_at", atual).select("id");
    if (error) throw erro("atualizar a versão da compra", error);
    if (((data ?? []) as unknown[]).length > 0) return;
  }
}

export function conflitoDeVersao(atual: Compra): ComprasRegraError {
  return new ComprasRegraError(MENSAGEM_CONFLITO_VERSAO, 409, { atual });
}

/** Erros do banco que são do dado enviado (e não do servidor): referência que não existe e check violado → 422. */
function erroDeEscrita(acao: string, e: { message: string; code?: string }): Error {
  if (e.code === CODIGO_CHAVE_ESTRANGEIRA) return new ComprasRegraError(MENSAGEM_REFERENCIA_INVALIDA, 422);
  if (e.code === CODIGO_CHECK_VIOLADO) return new ComprasRegraError("Algum dado da compra é inválido.", 422);
  return erro(acao, e);
}

/**
 * Um id de item do corpo que já existe no banco precisa ser DESTA compra. Id de item que pertence a outra compra é recusado (409): sem
 * isto, o upsert por id roubaria a linha de outra compra. Ids que não existem em lugar nenhum são novos (vêm do cliente).
 */
async function conferirIdsDoCorpo(db: Db, atual: CompraCarregada, itens: readonly ItemCompraEstado[]): Promise<void> {
  const itemIdsAtuais = new Set(atual.itens.map((i) => i.id));
  const itemIds = itens.map((i) => i.id);
  const achados: string[] = [];
  for (const bloco of emBlocos(itemIds)) {
    const { data, error } = await db.from(ITENS).select("id").in("id", bloco);
    if (error) throw erro("conferir os identificadores da compra", error);
    achados.push(...((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  }
  if (achados.some((id) => !itemIdsAtuais.has(id))) throw new ComprasRegraError(MENSAGEM_ID_DE_OUTRA_COMPRA, 409);
}

/** A "forma" dos itens: os ids na ordem. Igual = nada entrou, saiu nem mudou de lugar. */
const formaDe = (itens: ReadonlyArray<{ id: string }>): string => JSON.stringify(itens.map((i) => i.id));

async function apagarPorId(db: Db, ids: readonly string[], acao: string): Promise<void> {
  for (const bloco of emBlocos(ids)) {
    const { error } = await db.from(ITENS).delete().in("id", bloco);
    if (error) throw erro(acao, error);
  }
}

async function gravarItens(db: Db, linhas: readonly ItemRow[], acao: string): Promise<void> {
  if (linhas.length === 0) return;
  const { error } = await db.from(ITENS).upsert([...linhas] as unknown as Array<Record<string, unknown>>, { onConflict: "id" });
  if (error) throw erroDeEscrita(acao, error);
}

/**
 * Faz os itens do banco ficarem iguais ao estado: o que está no estado é gravado (upsert por id, com a posição = a ordem do array, de 1
 * a N) e o que não está é APAGADO.
 *
 * POR QUE NÃO É UMA TRANSAÇÃO: o supabase-js só faz um comando por chamada. O que protege a unicidade das posições:
 *  1. caminho RÁPIDO (a forma não mudou: mesmos itens, mesma ordem): só um upsert com as posições finais, que já são as que existem —
 *     nenhuma posição troca de dono;
 *  2. caminho com MUDANÇA de forma (item removido do meio, itens reordenados, item novo): as posições finais de duas linhas podem colidir
 *     com as atuais de outras, e a constraint (deferrable initially deferred) só aceita isso DENTRO de um comando. Então: (a) os itens do
 *     estado vão para posições TEMPORÁRIAS acima de todas as atuais; (b) apagam-se os itens que saíram; (c) um upsert em lista põe os itens
 *     nas posições finais. Cada passo é um comando que nunca viola a unicidade. Se um deles falhar, as linhas ficam com posições válidas
 *     (as temporárias são >= 1 e únicas) e o próximo salvamento conserta tudo.
 */
async function sincronizarItens(db: Db, compraId: string, atual: CompraCarregada, itens: readonly ItemCompraEstado[]): Promise<void> {
  const itensAtuais = [...atual.itens].sort((a, b) => a.posicao - b.posicao);
  const linhas = (posicaoDe: (indice: number) => number): ItemRow[] => itens.map((item, i) => linhaDeItem(compraId, posicaoDe(i), item));

  if (formaDe(itens) === formaDe(itensAtuais)) {
    await gravarItens(db, linhas((i) => i + 1), "gravar os itens da compra");
    return;
  }

  const maiorPosicao = Math.max(0, ...atual.itens.map((i) => i.posicao));
  await gravarItens(db, linhas((i) => maiorPosicao + 1 + i), "gravar os itens da compra");

  const idsNovos = new Set(itens.map((i) => i.id));
  await apagarPorId(
    db,
    atual.itens.filter((i) => !idsNovos.has(i.id)).map((i) => i.id),
    "apagar os itens removidos da compra",
  );

  await gravarItens(db, linhas((i) => i + 1), "gravar os itens da compra");
}

export interface OpcoesSalvarCompra {
  /**
   * Chamado com a compra como está no banco, DEPOIS de conferir a versão e ANTES de gravar qualquer coisa: é onde as rotas validam
   * o estado contra os Cadastros (e aceitam o valor que a compra já tinha). Se lançar, nada é gravado. Se DEVOLVER um estado, é ele
   * que é gravado (as rotas devolvem o estado com os nomes como estão no Cadastro).
   */
  antesDeGravar?: (atual: Compra) => Promise<CompraEstado | void>;
}

/**
 * O salvamento automático: aplica o estado à compra `id` e devolve a compra como ficou. null = não existe.
 *  - 409 se a compra foi CANCELADA, se `atualizadoEm` não é a versão atual (a resposta traz a compra atual em `data.atual`) ou se
 *    um id de item pertence a outra compra;
 *  - 422 se um medicamento do Cadastro ou pré-cadastro referenciado não existe;
 *  - `campos` ausente/parcial = os que não vieram não mudam; `itens` ausente = não mexe nos itens; `itens` presente = estado completo
 *    (o que não vier é apagado).
 * O UPDATE da compra é compare-and-swap pela versão lida: de dois salvamentos simultâneos só um passa, o outro leva 409.
 */
export async function salvarCompra(id: string, estadoRecebido: CompraEstado, usuario: string, opcoes: OpcoesSalvarCompra = {}): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  const atual = await carregar(db, id);
  if (!atual) return null;

  const compraAtual = compraDe(atual);
  if (atual.row.cancelada === true) throw new ComprasRegraError(MENSAGEM_COMPRA_CANCELADA, 409, { atual: compraAtual });
  if (estadoRecebido.atualizadoEm !== instanteIso(atual.row.updated_at)) throw conflitoDeVersao(compraAtual);

  const estado = (await opcoes.antesDeGravar?.(compraAtual)) ?? estadoRecebido;
  if (estado.itens) await conferirIdsDoCorpo(db, atual, estado.itens);

  // O Nº da compra só vai ao banco quando MUDA; o novo número não pode ser de outra compra do mesmo mês (409, inclusive de cancelada).
  const campos = { ...estado.campos };
  const novoNumero = campos.sequencia;
  if (novoNumero === atual.row.sequencia) delete campos.sequencia;
  else if (novoNumero !== undefined) await conferirNumeroLivre(db, atual.row.ano_mes, novoNumero, id);

  const { data, error } = await db
    .from(COMPRAS)
    .update({ ...colunasDosCampos(campos), atualizado_por: usuario, updated_at: proximaVersao(atual.row.updated_at) })
    .eq("id", id)
    .eq("updated_at", atual.row.updated_at)
    .select("id");
  if (error) {
    if (novoNumero !== undefined) await traduzirDisputaPeloNumero(db, error, atual.row.ano_mes, novoNumero);
    throw erroDeEscrita("atualizar a compra", error);
  }
  if (((data ?? []) as unknown[]).length === 0) {
    // Entre a leitura e a gravação outra pessoa salvou: devolve a versão dela.
    const maisNova = await obterCompra(id);
    if (!maisNova) return null;
    throw conflitoDeVersao(maisNova);
  }

  if (estado.itens) await sincronizarItens(db, id, atual, estado.itens);
  return obterCompra(id);
}
