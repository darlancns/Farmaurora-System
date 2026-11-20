import type { Compra, CompraDaLista, ItemCompra, OrdemCompra } from "../../shared/types/compra";
import type { MomentoPagamentoResumo } from "../../shared/types/compraResumo";

// Mapeadores PUROS linha (Supabase: compras, compra_ordens, compra_itens) ↔ modelo — sem Supabase nem rede, testáveis isoladamente
// (tests/unit/compraMappers.spec.ts). Convenção da DIR e dos Cadastros: no modelo, texto vazio é "" (nunca undefined); no banco os
// textos de compras também são '' (not null default ''); dinheiro é numeric(14,2) e NULL quando vazio.
//
// NUMERIC CHEGA COMO TEXTO: o PostgREST devolve numeric como string ("1234.50", "0.00"). A conversão para número (e null) está
// num lugar só — `numeroDoNumeric` — e é a única que as linhas de ordens e itens usam.

// ── Dinheiro: numeric(14,2) ↔ número ─────────────────────────────────────────────────────────────────────────────

/**
 * O valor de uma coluna numeric(14,2) como número: "1234.50" → 1234.5, "0.00" → 0 (zero NÃO é vazio), null/undefined/""/lixo → null.
 * Aceita também número (o Supabase em memória dos testes e valores já convertidos) e arredonda a 2 casas.
 */
export function numeroDoNumeric(valor: unknown): number | null {
  // Só texto ou número: Number([]) é 0 e Number([5]) é 5, e uma lista nunca é um valor de dinheiro.
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** O número como vai para uma coluna numeric(14,2): arredondado a 2 casas; vazio (null/undefined/NaN) = null (NULL no banco). */
export function numericParaBanco(valor: number | null | undefined): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.round(valor * 100) / 100;
}

// ── Linhas ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CompraRow {
  id: string;
  ano_mes: string;
  sequencia: number;
  cancelada: boolean;
  paciente: string | null;
  processo_numero: string | null;
  medico: string | null;
  local_aplicacao: string | null;
  entrega: string | null;
  contatos: string | null;
  termo_observacao: string | null;
  despachante: string | null;
  isencao_para: string | null;
  observacoes: string | null;
  vendedor: string | null;
  responsavel: string | null;
  compra_particular: boolean;
  local_declarado: boolean;
  termo_posterior: boolean;
  courier_simples: boolean;
  isencao: boolean;
  recorrente: boolean;
  pagamento_alvara: boolean | null;
  pagamento_momento: string | null;
  documentos: boolean | null;
  pendencias: string[] | null;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrdemRow {
  id: string;
  compra_id: string;
  posicao: number;
  fornecedor: string | null;
  envio: string | null;
  cia: string | null;
  po: string | null;
  frete: string | number | null;
  frete_real: string | number | null;
  dir_id: string | null;
  encaminhada_em: string | null;
}

export interface ItemRow {
  id: string;
  ordem_id: string;
  posicao: number;
  medicamento: string | null;
  medicamento_cadastro_id: string | null;
  pre_cadastro_id: string | null;
  apresentacao: string | null;
  referencia: string | null;
  laboratorio: string | null;
  quantidade: string | null;
  temperatura: string | null;
  valor_unitario: string | number | null;
  valor_real: string | number | null;
}

/** O instante como ISO em UTC ("2026-11-19T12:00:00.123Z"): o Postgres devolve "+00:00", e a versão da compra é comparada por este texto. */
export function instanteIso(valor: string): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : d.toISOString();
}

const texto = (v: string | null | undefined): string => v ?? "";

const MOMENTOS: readonly MomentoPagamentoResumo[] = ["vamos_pagar", "apos_awb"];
const momentoDe = (v: string | null): MomentoPagamentoResumo | null => (MOMENTOS as readonly string[]).includes(v ?? "") ? (v as MomentoPagamentoResumo) : null;

export function montarItem(row: ItemRow): ItemCompra {
  return {
    id: row.id,
    posicao: row.posicao,
    medicamento: texto(row.medicamento),
    medicamentoCadastroId: row.medicamento_cadastro_id ?? null,
    preCadastroId: row.pre_cadastro_id ?? null,
    apresentacao: texto(row.apresentacao),
    referencia: texto(row.referencia),
    laboratorio: texto(row.laboratorio),
    quantidade: texto(row.quantidade),
    temperatura: texto(row.temperatura),
    valorUnitario: numeroDoNumeric(row.valor_unitario),
    valorReal: numeroDoNumeric(row.valor_real),
  };
}

export function montarOrdem(row: OrdemRow, itens: readonly ItemRow[]): OrdemCompra {
  return {
    id: row.id,
    posicao: row.posicao,
    fornecedor: texto(row.fornecedor),
    envio: texto(row.envio),
    cia: texto(row.cia),
    po: texto(row.po),
    frete: numeroDoNumeric(row.frete),
    freteReal: numeroDoNumeric(row.frete_real),
    dirId: row.dir_id ?? null,
    encaminhadaEm: row.encaminhada_em ? instanteIso(row.encaminhada_em) : null,
    itens: [...itens].sort((a, b) => a.posicao - b.posicao).map(montarItem),
  };
}

/** Os campos da compra, sem as ordens. */
export function montarCompraSemOrdens(row: CompraRow): Omit<Compra, "ordens"> {
  return {
    id: row.id,
    anoMes: row.ano_mes,
    sequencia: row.sequencia,
    cancelada: row.cancelada === true,
    paciente: texto(row.paciente),
    processoNumero: texto(row.processo_numero),
    medico: texto(row.medico),
    localAplicacao: texto(row.local_aplicacao),
    entrega: texto(row.entrega),
    contatos: texto(row.contatos),
    termoObservacao: texto(row.termo_observacao),
    despachante: texto(row.despachante),
    isencaoPara: texto(row.isencao_para),
    observacoes: texto(row.observacoes),
    vendedor: texto(row.vendedor),
    responsavel: texto(row.responsavel),
    compraParticular: row.compra_particular === true,
    localDeclarado: row.local_declarado === true,
    termoPosterior: row.termo_posterior === true,
    courierSimples: row.courier_simples === true,
    isencao: row.isencao === true,
    recorrente: row.recorrente === true,
    pagamentoAlvara: row.pagamento_alvara ?? null,
    pagamentoMomento: momentoDe(row.pagamento_momento),
    documentos: row.documentos ?? null,
    pendencias: [...(row.pendencias ?? [])],
    criadoPor: texto(row.criado_por),
    atualizadoPor: texto(row.atualizado_por),
    createdAt: instanteIso(row.created_at),
    updatedAt: instanteIso(row.updated_at),
  };
}

/** A compra inteira: as ordens por posição, cada uma com seus itens por posição. */
export function montarCompra(row: CompraRow, ordens: readonly OrdemRow[], itens: readonly ItemRow[]): Compra {
  const itensDaOrdem = new Map<string, ItemRow[]>();
  for (const i of itens) itensDaOrdem.set(i.ordem_id, [...(itensDaOrdem.get(i.ordem_id) ?? []), i]);
  return {
    ...montarCompraSemOrdens(row),
    ordens: [...ordens].sort((a, b) => a.posicao - b.posicao).map((o) => montarOrdem(o, itensDaOrdem.get(o.id) ?? [])),
  };
}

/** Um item da lista do mês: a compra sem as ordens, com as contagens. */
export function montarCompraDaLista(row: CompraRow, ordens: readonly OrdemRow[]): CompraDaLista {
  return {
    ...montarCompraSemOrdens(row),
    totalOrdens: ordens.length,
    totalOrdensEncaminhadas: ordens.filter((o) => o.encaminhada_em !== null && o.encaminhada_em !== undefined).length,
  };
}

// ── Modelo → linha (escrita) ─────────────────────────────────────────────────────────────────────────────────────

/** Linha de uma ordem para gravar: NUNCA leva `dir_id` nem `encaminhada_em` (só o Encaminhar grava), então um upsert preserva os dois. */
export function linhaDeOrdem(
  compraId: string,
  posicao: number,
  o: { id: string; fornecedor: string; envio: string; cia: string; po: string; frete: number | null; freteReal: number | null },
): Omit<OrdemRow, "dir_id" | "encaminhada_em"> {
  return {
    id: o.id,
    compra_id: compraId,
    posicao,
    fornecedor: o.fornecedor,
    envio: o.envio,
    cia: o.cia,
    po: o.po,
    frete: numericParaBanco(o.frete),
    frete_real: numericParaBanco(o.freteReal),
  };
}

export function linhaDeItem(
  ordemId: string,
  posicao: number,
  i: {
    id: string;
    medicamento: string;
    medicamentoCadastroId: string | null;
    preCadastroId: string | null;
    apresentacao: string;
    referencia: string;
    laboratorio: string;
    quantidade: string;
    temperatura: string;
    valorUnitario: number | null;
    valorReal: number | null;
  },
): ItemRow {
  return {
    id: i.id,
    ordem_id: ordemId,
    posicao,
    medicamento: i.medicamento,
    medicamento_cadastro_id: i.medicamentoCadastroId,
    pre_cadastro_id: i.preCadastroId,
    apresentacao: i.apresentacao,
    referencia: i.referencia,
    laboratorio: i.laboratorio,
    quantidade: i.quantidade,
    temperatura: i.temperatura,
    valor_unitario: numericParaBanco(i.valorUnitario),
    valor_real: numericParaBanco(i.valorReal),
  };
}
