// Cadastros (Configurações → Cadastros): cinco listas editáveis só pelo administrador (fornecedores, despachantes,
// transportadoras, cias aéreas e consultores).
//
// Convenção (a mesma da DIR): no modelo, texto vazio é "" (nunca undefined); no banco é NULL.
// "Remover" é desativar (`ativo: false`) — não existe exclusão. O NOME não muda depois de criado.

export type ListaCadastro = "fornecedores" | "despachantes" | "transportadoras" | "cias-aereas" | "consultores";

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

/**
 * Chave PIX (despachantes e transportadoras): DADO FINANCEIRO. O campo `chavePix` só EXISTE na resposta da API para o
 * administrador e para quem LÊ a seção Pagamentos (ver shared/utils/cadastroPix.ts); para os demais ele não vem, nem
 * como null. Por isso é opcional no tipo: ausente = a pessoa não pode ver; "" = pode ver e não há chave cadastrada.
 */
interface ComChavePix {
  chavePix?: string;
}

/** Despachante = EMPRESA; o contato é uma pessoa dessa empresa (tudo opcional). */
export interface Despachante extends CadastroBase, ComChavePix {
  contatoNome: string;
  telefone: string;
  email: string;
}

/** Transportadora: nome, chave PIX (opcional, dado financeiro) e ativo. */
export type Transportadora = CadastroBase & ComChavePix;

/** Cia aérea: só nome e ativo. */
export type CiaAerea = CadastroBase;

/**
 * Consultor: só nome e ativo. É a ÚNICA fonte de consultores (Contas, Follow-Up, Prestação e DIR). O valor é gravado como TEXTO
 * nos registros; só o consultor pode ser RENOMEADO (o administrador, com a propagação transacional no banco).
 */
export type Consultor = CadastroBase;

/** Uma conta de login que não foi atualizada no renomear (a tela lista e permite tentar de novo). */
export interface ContaNaoAtualizada {
  id: string;
  email: string;
}

/** Resultado de atualizar `app_metadata.consultorNome` das contas que tinham o nome antigo (idempotente). */
export interface ResultadoContasConsultor {
  atualizadas: number;
  falhas: ContaNaoAtualizada[];
}

/** O que o renomear de um consultor mudou: contagens do banco (feitas numa transação) e o resultado das contas de login. */
export interface RenomeacaoConsultor {
  nomeAntigo: string;
  processos: number;
  pacientes: number;
  dir: number;
  contas: ResultadoContasConsultor;
}

/** Resposta do PATCH de um consultor: o item, e a renomeação quando o nome mudou. */
export type ConsultorAtualizado = Consultor & { renomeacao?: RenomeacaoConsultor };

/** Quantos registros o renomear de um consultor vai atualizar (só leitura; a tela mostra antes de confirmar). */
export interface ImpactoRenomearConsultor {
  nome: string;
  processos: number;
  pacientes: number;
  dir: number;
  contas: number;
}

export interface CadastroPorLista {
  fornecedores: Fornecedor;
  despachantes: Despachante;
  transportadoras: Transportadora;
  "cias-aereas": CiaAerea;
  consultores: Consultor;
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
  /** Dado financeiro: só o administrador grava. */
  chavePix?: string;
}

export interface NovaTransportadoraDTO {
  nome: string;
  /** Dado financeiro: só o administrador grava. */
  chavePix?: string;
}

export interface NovaCiaAereaDTO {
  nome: string;
}

export interface NovoConsultorDTO {
  nome: string;
}

export interface NovoPorLista {
  fornecedores: NovoFornecedorDTO;
  despachantes: NovoDespachanteDTO;
  transportadoras: NovaTransportadoraDTO;
  "cias-aereas": NovaCiaAereaDTO;
  consultores: NovoConsultorDTO;
}

/**
 * Alteração parcial. `nome` existe no tipo só para o servidor poder RECUSAR a troca (422): o valor igual ao gravado é
 * ignorado (EXCETO nos consultores, que podem ser renomeados). `prazoAlertaDias` e `semAlerta` andam juntos (os dois ou nenhum), e continuam obedecendo à regra de decidir.
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
  /** "" limpa a chave (vira NULL no banco). */
  chavePix?: string;
  ativo?: boolean;
}

export interface TransportadoraPatchDTO {
  nome?: string;
  /** "" limpa a chave (vira NULL no banco). */
  chavePix?: string;
  ativo?: boolean;
}

export interface CiaAereaPatchDTO {
  nome?: string;
  ativo?: boolean;
}

export interface ConsultorPatchDTO {
  nome?: string;
  ativo?: boolean;
}

export interface PatchPorLista {
  fornecedores: FornecedorPatchDTO;
  despachantes: DespachantePatchDTO;
  transportadoras: TransportadoraPatchDTO;
  "cias-aereas": CiaAereaPatchDTO;
  consultores: ConsultorPatchDTO;
}
