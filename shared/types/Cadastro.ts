// Cadastros v1 (Configurações → Cadastros): três listas editáveis só pelo administrador.
//
// Convenção (a mesma da DIR): no modelo, texto vazio é "" (nunca undefined); no banco é NULL.
// "Remover" é desativar (`ativo: false`) — não existe exclusão. O NOME não muda depois de criado.

export type ListaCadastro = "fornecedores" | "despachantes" | "temperaturas";

interface CadastroBase {
  id: string;
  nome: string;
  ativo: boolean;
  /** Quem fez a última gravação (nome da conta). "" nos itens que ainda não foram gravados por ninguém. */
  atualizadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export interface Fornecedor extends CadastroBase {
  /** Opcional ("" quando não informado). */
  pais: string;
  /** Dias corridos a partir da compra, de 1 a 365; null quando `semAlerta`. */
  prazoAlertaDias: number | null;
  /** Marcado de propósito: este fornecedor não gera alerta de prazo. */
  semAlerta: boolean;
}

/** Despachante = EMPRESA; o contato é uma pessoa dessa empresa (tudo opcional). */
export interface Despachante extends CadastroBase {
  contatoNome: string;
  telefone: string;
  email: string;
}

export type Temperatura = CadastroBase;

export interface CadastroPorLista {
  fornecedores: Fornecedor;
  despachantes: Despachante;
  temperaturas: Temperatura;
}

export type Cadastro = CadastroPorLista[ListaCadastro];

// ── DTOs de entrada ────────────────────────────────────────────────────────────

/** Criação: o item nasce ativo. O prazo precisa ser decidido: ou `semAlerta: true` (com prazo null) ou um prazo. */
export interface NovoFornecedorDTO {
  nome: string;
  pais?: string;
  prazoAlertaDias: number | null;
  semAlerta: boolean;
}

export interface NovoDespachanteDTO {
  nome: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
}

export interface NovaTemperaturaDTO {
  nome: string;
}

export interface NovoPorLista {
  fornecedores: NovoFornecedorDTO;
  despachantes: NovoDespachanteDTO;
  temperaturas: NovaTemperaturaDTO;
}

/**
 * Alteração parcial. `nome` existe no tipo só para o servidor poder RECUSAR a troca (422): o valor igual ao gravado é
 * ignorado. `prazoAlertaDias` e `semAlerta` andam juntos (os dois ou nenhum), e continuam obedecendo à regra de decidir.
 */
export interface FornecedorPatchDTO {
  nome?: string;
  pais?: string;
  prazoAlertaDias?: number | null;
  semAlerta?: boolean;
  ativo?: boolean;
}

export interface DespachantePatchDTO {
  nome?: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  ativo?: boolean;
}

export interface TemperaturaPatchDTO {
  nome?: string;
  ativo?: boolean;
}

export interface PatchPorLista {
  fornecedores: FornecedorPatchDTO;
  despachantes: DespachantePatchDTO;
  temperaturas: TemperaturaPatchDTO;
}
