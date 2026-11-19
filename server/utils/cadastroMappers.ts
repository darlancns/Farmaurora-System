import type {
  CadastroPorLista,
  Despachante,
  Fornecedor,
  ListaCadastro,
  NovoPorLista,
  PatchPorLista,
  CiaAerea,
  Consultor,
  MedicamentoCadastro,
  TemperaturaCadastro,
  Transportadora,
} from "../../shared/types/Cadastro";
import { chaveCadastro, nomeEmMaiusculas } from "../../shared/utils/cadastroNome";

// Mapeadores puros linha (Supabase, tabelas `cadastro_*`) ↔ modelo — sem Supabase nem rede, testáveis isoladamente
// (tests/unit/cadastroMappers.spec.ts). Convenção da DIR: no modelo, texto vazio é "" (nunca undefined); no banco é
// NULL — na escrita "" vira NULL e na leitura NULL vira "".
//
// CHAVE PIX (dado financeiro): a leitura SÓ monta `chavePix` quando quem chama pede (`incluirPix`, decidido no handler por
// podeVerPixCadastro). Sem o pedido o campo NÃO EXISTE no objeto devolvido (nem null).

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
  chave_pix?: string | null;
}

export interface TransportadoraRow extends LinhaBase {
  chave_pix?: string | null;
}

export type CiaAereaRow = LinhaBase;

export type ConsultorRow = LinhaBase;

export type TemperaturaRow = LinhaBase;

export interface MedicamentoRow extends LinhaBase {
  temperatura: string | null;
}

export interface CadastroRowPorLista {
  fornecedores: FornecedorRow;
  despachantes: DespachanteRow;
  transportadoras: TransportadoraRow;
  "cias-aereas": CiaAereaRow;
  consultores: ConsultorRow;
  temperaturas: TemperaturaRow;
  medicamentos: MedicamentoRow;
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

/** Só com `incluirPix` o objeto ganha `chavePix` ("" quando não há chave); sem ele, a chave não existe no resultado. */
export function montarDespachante(row: DespachanteRow, incluirPix = false): Despachante {
  return {
    ...base(row),
    contatoNome: row.contato_nome ?? "",
    telefone: row.telefone ?? "",
    email: row.email ?? "",
    ...(incluirPix ? { chavePix: row.chave_pix ?? "" } : {}),
  };
}

export function montarTransportadora(row: TransportadoraRow, incluirPix = false): Transportadora {
  return { ...base(row), ...(incluirPix ? { chavePix: row.chave_pix ?? "" } : {}) };
}

export function montarCiaAerea(row: CiaAereaRow): CiaAerea {
  return base(row);
}

export function montarConsultor(row: ConsultorRow): Consultor {
  return base(row);
}

export function montarTemperatura(row: TemperaturaRow): TemperaturaCadastro {
  return base(row);
}

export function montarMedicamento(row: MedicamentoRow): MedicamentoCadastro {
  return { ...base(row), temperatura: row.temperatura ?? "" };
}

const MONTADORES: { [L in ListaCadastro]: (row: CadastroRowPorLista[L], incluirPix: boolean) => CadastroPorLista[L] } = {
  fornecedores: (row) => montarFornecedor(row),
  despachantes: montarDespachante,
  transportadoras: montarTransportadora,
  "cias-aereas": (row) => montarCiaAerea(row),
  consultores: (row) => montarConsultor(row),
  temperaturas: (row) => montarTemperatura(row),
  medicamentos: (row) => montarMedicamento(row),
};

/** `incluirPix` (padrão false) só tem efeito em despachantes e transportadoras: ver o cabeçalho deste arquivo. */
export function montarCadastro<L extends ListaCadastro>(
  lista: L,
  row: CadastroRowPorLista[L],
  incluirPix = false,
): CadastroPorLista[L] {
  return MONTADORES[lista](row, incluirPix);
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
    colunas.chave_pix = textoOuNulo(d.chavePix);
  } else if (lista === "transportadoras") {
    colunas.chave_pix = textoOuNulo((dto as NovoPorLista["transportadoras"]).chavePix);
  } else if (lista === "medicamentos") {
    // Nome SEMPRE em MAIÚSCULAS (a chave sai do mesmo texto, então não muda). A temperatura é a CÓPIA do nome da temperatura
    // ativa: o store a troca pelo nome gravado no Cadastro de Temperaturas antes de chegar aqui.
    const m = dto as NovoPorLista["medicamentos"];
    colunas.nome = nomeEmMaiusculas(m.nome);
    colunas.temperatura = m.temperatura;
  }
  return colunas;
}

/**
 * Colunas de uma ALTERAÇÃO: só as chaves presentes no patch. `nome` e `nome_chave` NUNCA entram aqui (o nome não muda depois
 * de criado — o store recusa a troca antes de chegar; o medicamento, que pode ser renomeado, usa `colunasRenomearMedicamento`).
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
    if (p.chavePix !== undefined) colunas.chave_pix = textoOuNulo(p.chavePix as string);
  } else if (lista === "transportadoras") {
    if (p.chavePix !== undefined) colunas.chave_pix = textoOuNulo(p.chavePix as string);
  } else if (lista === "medicamentos") {
    if (p.temperatura !== undefined) colunas.temperatura = p.temperatura;
  }
  return colunas;
}

/**
 * Colunas de um RENOMEAR (só `medicamentos`; o consultor renomeia por RPC): o nome novo em MAIÚSCULAS e a chave dele. É um caminho à
 * parte de `colunasPatchCadastro`, que nunca emite nome: nas outras listas o nome é imutável.
 */
export function colunasRenomearMedicamento(nome: string): { nome: string; nome_chave: string } {
  const maiusculo = nomeEmMaiusculas(nome);
  return { nome: maiusculo, nome_chave: chaveCadastro(maiusculo) };
}

