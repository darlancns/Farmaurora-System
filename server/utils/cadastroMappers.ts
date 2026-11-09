import type {
  CadastroPorLista,
  Despachante,
  Fornecedor,
  ListaCadastro,
  NovoPorLista,
  PatchPorLista,
  Temperatura,
} from "../../shared/types/Cadastro";
import { chaveCadastro } from "../../shared/utils/cadastroNome";

// Mapeadores puros linha (Supabase, tabelas `cadastro_*`) ↔ modelo — sem Supabase nem rede, testáveis isoladamente
// (tests/unit/cadastroMappers.spec.ts). Convenção da DIR: no modelo, texto vazio é "" (nunca undefined); no banco é
// NULL — na escrita "" vira NULL e na leitura NULL vira "".

interface LinhaBase {
  id: string;
  nome: string;
  nome_chave: string;
  ativo: boolean;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface FornecedorRow extends LinhaBase {
  pais: string | null;
  prazo_alerta_dias: number | string | null;
  sem_alerta: boolean;
}

export interface DespachanteRow extends LinhaBase {
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
}

export type TemperaturaRow = LinhaBase;

export interface CadastroRowPorLista {
  fornecedores: FornecedorRow;
  despachantes: DespachanteRow;
  temperaturas: TemperaturaRow;
}

function textoOuNulo(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function base(row: LinhaBase) {
  return {
    id: row.id,
    nome: row.nome,
    ativo: row.ativo === true,
    atualizadoPor: row.atualizado_por ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function montarFornecedor(row: FornecedorRow): Fornecedor {
  const prazo = row.prazo_alerta_dias;
  return {
    ...base(row),
    pais: row.pais ?? "",
    prazoAlertaDias: prazo === null || prazo === undefined ? null : Number(prazo),
    semAlerta: row.sem_alerta === true,
  };
}

export function montarDespachante(row: DespachanteRow): Despachante {
  return {
    ...base(row),
    contatoNome: row.contato_nome ?? "",
    telefone: row.telefone ?? "",
    email: row.email ?? "",
  };
}

export function montarTemperatura(row: TemperaturaRow): Temperatura {
  return base(row);
}

const MONTADORES: { [L in ListaCadastro]: (row: CadastroRowPorLista[L]) => CadastroPorLista[L] } = {
  fornecedores: montarFornecedor,
  despachantes: montarDespachante,
  temperaturas: montarTemperatura,
};

export function montarCadastro<L extends ListaCadastro>(lista: L, row: CadastroRowPorLista[L]): CadastroPorLista[L] {
  return MONTADORES[lista](row);
}

/** Colunas de um item NOVO (o servidor acrescenta id, datas e quem gravou). */
export function colunasNovoCadastro<L extends ListaCadastro>(lista: L, dto: NovoPorLista[L]): Record<string, unknown> {
  const colunas: Record<string, unknown> = { nome: dto.nome, nome_chave: chaveCadastro(dto.nome), ativo: true };

  if (lista === "fornecedores") {
    const f = dto as NovoPorLista["fornecedores"];
    colunas.pais = textoOuNulo(f.pais);
    colunas.prazo_alerta_dias = f.semAlerta ? null : f.prazoAlertaDias;
    colunas.sem_alerta = f.semAlerta;
  } else if (lista === "despachantes") {
    const d = dto as NovoPorLista["despachantes"];
    colunas.contato_nome = textoOuNulo(d.contatoNome);
    colunas.telefone = textoOuNulo(d.telefone);
    colunas.email = textoOuNulo(d.email);
  }
  return colunas;
}

/**
 * Colunas de uma ALTERAÇÃO: só as chaves presentes no patch. `nome` e `nome_chave` NUNCA entram (o nome não muda depois
 * de criado — o store recusa a troca antes de chegar aqui).
 */
export function colunasPatchCadastro<L extends ListaCadastro>(lista: L, patch: PatchPorLista[L]): Record<string, unknown> {
  const colunas: Record<string, unknown> = {};
  const p = patch as Record<string, unknown>;
  if (p.ativo !== undefined) colunas.ativo = p.ativo;

  if (lista === "fornecedores") {
    if (p.pais !== undefined) colunas.pais = textoOuNulo(p.pais as string);
    if (p.semAlerta !== undefined) {
      colunas.sem_alerta = p.semAlerta;
      colunas.prazo_alerta_dias = p.semAlerta ? null : p.prazoAlertaDias;
    }
  } else if (lista === "despachantes") {
    if (p.contatoNome !== undefined) colunas.contato_nome = textoOuNulo(p.contatoNome as string);
    if (p.telefone !== undefined) colunas.telefone = textoOuNulo(p.telefone as string);
    if (p.email !== undefined) colunas.email = textoOuNulo(p.email as string);
  }
  return colunas;
}

