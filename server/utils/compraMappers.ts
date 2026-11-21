import { BRANDS_MEDICAMENTO, EMPRESAS_PROCESSO } from "../../shared/constants/processos";
import type { Compra, CompraDaLista, ItemCompra, ItemCompraEstado, StatusPreCadastro } from "../../shared/types/compra";
import type { MomentoPagamentoResumo } from "../../shared/types/compraResumo";
import type { BrandMedicamento, EmpresaProcesso } from "../../shared/types/processo";
import { itemDaLista } from "../../shared/utils/compraLista";

// Mapeadores PUROS linha (Supabase: compras e compra_itens) ↔ modelo — sem Supabase nem rede, testáveis isoladamente
// (tests/unit/compraMappers.spec.ts). Convenção da DIR e dos Cadastros: no modelo, texto vazio é "" (nunca undefined); no banco os
// textos de compras também são '' (not null default ''); dinheiro é numeric(14,2) e NULL quando vazio.
//
// NUMERIC CHEGA COMO TEXTO: o PostgREST devolve numeric como string ("1234.50", "0.00"). A conversão para número (e null) está
// num lugar só — `numeroDoNumeric` — e é a única que a compra e os itens usam.

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

/** As 34 colunas de `compras`. */
export interface CompraRow {
  id: string;
  ano_mes: string;
  sequencia: number;
  cancelada: boolean;
  fornecedor: string | null;
  envio: string | null;
  cia: string | null;
  frete: string | number | null;
  frete_real: string | number | null;
  empresa: string | null;
  numero_ordens: number | string | null;
  paciente: string | null;
  processo_numero: string | null;
  medico: string | null;
  local_aplicacao: string | null;
  entrega: string | null;
  contatos: string | null;
  termo_observacao: string | null;
  despachante: string | null;
  observacoes: string | null;
  consultor: string | null;
  responsavel: string | null;
  compra_particular: boolean;
  termo_posterior: boolean;
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

/** As colunas de `compra_itens` (as de auditoria, created_at e updated_at, o servidor não lê). */
export interface ItemRow {
  id: string;
  compra_id: string;
  posicao: number;
  medicamento: string | null;
  medicamento_cadastro_id: string | null;
  pre_cadastro_id: string | null;
  brand: string | null;
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
const momentoDe = (v: string | null): MomentoPagamentoResumo | null => ((MOMENTOS as readonly string[]).includes(v ?? "") ? (v as MomentoPagamentoResumo) : null);

/** O brand do item: um valor de BRANDS_MEDICAMENTO; qualquer outra coisa (o banco não tem check) vira "". */
const brandDe = (v: string | null): BrandMedicamento | "" => ((BRANDS_MEDICAMENTO as readonly string[]).includes(v ?? "") ? (v as BrandMedicamento) : "");

/** A empresa da compra: EMPRESAS_PROCESSO (o banco tem check); fora disso, a primeira (FARMAURORA, o padrão da coluna). */
const empresaDe = (v: string | null): EmpresaProcesso => ((EMPRESAS_PROCESSO as readonly string[]).includes(v ?? "") ? (v as EmpresaProcesso) : EMPRESAS_PROCESSO[0]!);

/** "Ordens": um inteiro >= 1 (a coluna tem check); lixo vira 1. */
function numeroOrdensDe(v: number | string | null): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** O estado de cada pré-cadastro (id → status) das compras lidas: só entra quem tem item apontando para ele. */
export type StatusDosPreCadastros = ReadonlyMap<string, StatusPreCadastro>;

/** O nome no Cadastro de cada medicamento ligado (id → nome): só entra quem tem item apontando para ele (e que ainda existe no Cadastro). */
export type NomesDosMedicamentosDoCadastro = ReadonlyMap<string, string>;

/**
 * O pré-cadastro que o item MOSTRA: só quando ele ainda não virou um item do Cadastro. A aprovação liga o item ao medicamento
 * (`medicamento_cadastro_id`) SEM limpar `pre_cadastro_id` (é por essa coluna que uma repetição da aprovação reencontra os itens e as compras);
 * então, com o medicamento do Cadastro preenchido, o pré-cadastro é história e a compra o devolve como null (o aviso de pré-cadastro some).
 */
export function preCadastroDoItem(row: Pick<ItemRow, "medicamento_cadastro_id" | "pre_cadastro_id">): string | null {
  return (row.medicamento_cadastro_id ?? "") !== "" ? null : (row.pre_cadastro_id ?? null);
}

export function montarItem(row: ItemRow, statusPre?: StatusDosPreCadastros, nomesDoCadastro?: NomesDosMedicamentosDoCadastro): ItemCompra {
  const preCadastroId = preCadastroDoItem(row);
  const status = preCadastroId === null ? undefined : statusPre?.get(preCadastroId);
  const cadastroId = row.medicamento_cadastro_id ?? null;
  return {
    id: row.id,
    posicao: row.posicao,
    medicamento: texto(row.medicamento),
    medicamentoCadastroId: cadastroId,
    // Só com o vínculo, e só se o medicamento ainda está no Cadastro (id que não existe mais: null).
    medicamentoCadastroNome: cadastroId === null ? null : (nomesDoCadastro?.get(cadastroId) ?? null),
    preCadastroId,
    // Só o item com pré-cadastro leva o estado (os demais ficam como sempre foram).
    ...(status === undefined ? {} : { preCadastroStatus: status }),
    laboratorio: texto(row.laboratorio),
    brand: brandDe(row.brand),
    quantidade: texto(row.quantidade),
    temperatura: texto(row.temperatura),
    valorUnitario: numeroDoNumeric(row.valor_unitario),
    valorReal: numeroDoNumeric(row.valor_real),
  };
}

/** A compra inteira: os campos e os itens por posição. */
export function montarCompra(row: CompraRow, itens: readonly ItemRow[], statusPre?: StatusDosPreCadastros, nomesDoCadastro?: NomesDosMedicamentosDoCadastro): Compra {
  return {
    id: row.id,
    anoMes: row.ano_mes,
    sequencia: row.sequencia,
    cancelada: row.cancelada === true,
    fornecedor: texto(row.fornecedor),
    envio: texto(row.envio),
    cia: texto(row.cia),
    empresa: empresaDe(row.empresa),
    numeroOrdens: numeroOrdensDe(row.numero_ordens),
    frete: numeroDoNumeric(row.frete),
    freteReal: numeroDoNumeric(row.frete_real),
    paciente: texto(row.paciente),
    processoNumero: texto(row.processo_numero),
    compraParticular: row.compra_particular === true,
    recorrente: row.recorrente === true,
    medico: texto(row.medico),
    localAplicacao: texto(row.local_aplicacao),
    entrega: texto(row.entrega),
    contatos: texto(row.contatos),
    despachante: texto(row.despachante),
    pagamentoAlvara: row.pagamento_alvara ?? null,
    pagamentoMomento: momentoDe(row.pagamento_momento),
    termoPosterior: row.termo_posterior === true,
    termoObservacao: texto(row.termo_observacao),
    isencao: row.isencao === true,
    documentos: row.documentos ?? null,
    pendencias: [...(row.pendencias ?? [])],
    observacoes: texto(row.observacoes),
    consultor: texto(row.consultor),
    responsavel: texto(row.responsavel),
    criadoPor: texto(row.criado_por),
    atualizadoPor: texto(row.atualizado_por),
    createdAt: instanteIso(row.created_at),
    updatedAt: instanteIso(row.updated_at),
    itens: [...itens].sort((a, b) => a.posicao - b.posicao).map((i) => montarItem(i, statusPre, nomesDoCadastro)),
  };
}

// ── A lista do mês ───────────────────────────────────────────────────────────────────────────────────────────────
// A lista lê só as colunas de que a linha precisa (nada de contatos, valores, frete nem observações).

export const COLUNAS_LISTA_COMPRA = "id, ano_mes, sequencia, cancelada, paciente, numero_ordens, updated_at";
export const COLUNAS_LISTA_ITEM = "id, compra_id, posicao, medicamento";

export type CompraListaRow = Pick<CompraRow, "id" | "ano_mes" | "sequencia" | "cancelada" | "paciente" | "numero_ordens" | "updated_at">;
export type ItemListaRow = Pick<ItemRow, "id" | "compra_id" | "posicao" | "medicamento">;

/** Um item da lista do mês: só o necessário para a linha do painel (ver CompraDaLista; a regra é a mesma do cliente: itemDaLista). */
export function montarCompraDaLista(row: CompraListaRow, itens: readonly ItemListaRow[]): CompraDaLista {
  return itemDaLista({
    id: row.id,
    anoMes: row.ano_mes,
    sequencia: row.sequencia,
    cancelada: row.cancelada === true,
    paciente: texto(row.paciente),
    numeroOrdens: numeroOrdensDe(row.numero_ordens),
    itens: itens.map((i) => ({ posicao: i.posicao, medicamento: texto(i.medicamento) })),
    atualizadoEm: instanteIso(row.updated_at),
  });
}

// ── Modelo → linha (escrita) ─────────────────────────────────────────────────────────────────────────────────────

export function linhaDeItem(compraId: string, posicao: number, i: ItemCompraEstado): ItemRow {
  return {
    id: i.id,
    compra_id: compraId,
    posicao,
    medicamento: i.medicamento,
    medicamento_cadastro_id: i.medicamentoCadastroId,
    pre_cadastro_id: i.preCadastroId,
    brand: i.brand,
    laboratorio: i.laboratorio,
    quantidade: i.quantidade,
    temperatura: i.temperatura,
    valor_unitario: numericParaBanco(i.valorUnitario),
    valor_real: numericParaBanco(i.valorReal),
  };
}
