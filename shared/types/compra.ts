// A Compra (página Compras): UMA compra por fornecedor. O que o servidor guarda e devolve (tabelas compras e compra_itens) e o que o
// cliente envia ao salvar. O texto do "Resumo da compra" sai daqui por `compraParaResumoEntrada` (shared/utils/compraResumo.ts).
//
// Convenções (as mesmas da DIR e dos Cadastros): no modelo, texto vazio é "" (nunca undefined); dinheiro é número com 2 casas ou null
// (vazio); datas e instantes são texto ISO. Quantidade é TEXTO com a unidade ("12 ampolas"). Nomes com sufixo próprio para não
// colidir com `Medicamento` (processo.ts) nem com `MedicamentoCadastro` (Cadastro.ts).

import type { MomentoPagamentoResumo } from "./compraResumo";
import type { BrandMedicamento, EmpresaProcesso } from "./processo";

/** Um medicamento da compra. */
export interface ItemCompra {
  id: string;
  /** 1..N dentro da compra (a ordem em que aparece). */
  posicao: number;
  /** UM texto só, já com a apresentação ("KEYTRUDA 100mg - 2 vials per box"), como foi digitado. */
  medicamento: string;
  /** Preenchido quando o medicamento é um item do Cadastro. */
  medicamentoCadastroId: string | null;
  /**
   * O nome do medicamento no Cadastro quando `medicamentoCadastroId` está ligado (e o medicamento existe); senão null. SÓ LEITURA: o
   * servidor o preenche ao ler a compra e o salvamento recusa o campo. A tela o usa para saber se o texto ainda começa com o nome do Cadastro.
   */
  medicamentoCadastroNome: string | null;
  /**
   * Preenchido quando o medicamento está no pré-cadastro e ainda NÃO virou item do Cadastro. Aprovado o pré-cadastro, o item passa a ter
   * `medicamentoCadastroId` e este campo vem null (a coluna do banco guarda o vínculo, mas a leitura já o esconde: ver montarItem).
   */
  preCadastroId: string | null;
  /**
   * O estado do pré-cadastro do item (`pendente` ou `rejeitado`); null sem pré-cadastro. SÓ LEITURA: o servidor o preenche ao ler a compra e o
   * salvamento ignora. Ausente (a lista do mês, que não lê o pré-cadastro) vale como pendente.
   */
  preCadastroStatus?: StatusPreCadastro | null;
  laboratorio: string;
  /** "" ou um valor de BRANDS_MEDICAMENTO ("bioequivalente" | "referencia"). */
  brand: BrandMedicamento | "";
  quantidade: string;
  temperatura: string;
  valorUnitario: number | null;
  valorReal: number | null;
}

export interface Compra {
  id: string;
  /** Mês de BRASÍLIA no formato AAAA-MM. */
  anoMes: string;
  /** Número da compra dentro do mês (1, 2, 3...). */
  sequencia: number;
  cancelada: boolean;
  fornecedor: string;
  /** Um valor de MODAIS_ENVIO ou "". */
  envio: string;
  /** "" ou uma cia que vale para o `envio` (ciaAereaValidaParaModal). */
  cia: string;
  empresa: EmpresaProcesso;
  /** Quantas ordens a compra tem (só um número: de 1 a COMPRA_MAX_ORDENS). */
  numeroOrdens: number;
  frete: number | null;
  freteReal: number | null;
  paciente: string;
  processoNumero: string;
  compraParticular: boolean;
  /** Compra recorrente (avisa no resumo). */
  recorrente: boolean;
  medico: string;
  localAplicacao: string;
  entrega: string;
  contatos: string;
  despachante: string;
  /** null = ainda não decidido. */
  pagamentoAlvara: boolean | null;
  pagamentoMomento: MomentoPagamentoResumo | null;
  termoPosterior: boolean;
  termoObservacao: string;
  isencao: boolean;
  documentos: boolean | null;
  pendencias: string[];
  observacoes: string;
  consultor: string;
  responsavel: string;
  criadoPor: string;
  atualizadoPor: string;
  createdAt: string;
  /** Também é a VERSÃO da compra: o cliente a devolve ao salvar e, se mudou, o servidor responde 409. */
  updatedAt: string;
  itens: ItemCompra[];
}

/**
 * Uma compra na lista do mês (painel esquerdo): SÓ o necessário para a linha. Nada de valores, contatos, endereços nem dados do
 * pagamento: o detalhe é GET /api/compras/:id.
 */
export interface CompraDaLista {
  id: string;
  /** Mês de BRASÍLIA (AAAA-MM). */
  anoMes: string;
  sequencia: number;
  cancelada: boolean;
  paciente: string;
  /** Nomes dos medicamentos da compra, sem repetir, na ordem em que aparecem (por posição). */
  medicamentos: string[];
  numeroOrdens: number;
  /** A versão (updated_at, ISO UTC). */
  atualizadoEm: string;
}

/** Quantas compras do mês há ativas e canceladas (o mês INTEIRO, não só a página). O estado da compra é só derivado: ativa ou cancelada. */
export interface TotaisDaLista {
  ativas: number;
  canceladas: number;
}

/** A resposta de GET /api/compras. */
export interface ListaCompras {
  anoMes: string;
  compras: CompraDaLista[];
  /** Página (a partir de 1) e tamanho usados; há mais depois desta? */
  pagina: number;
  limite: number;
  temMais: boolean;
  /** Quantas compras a lista tem (todas as páginas; sem as canceladas, a menos que `incluir_canceladas=1`). */
  total: number;
  totais: TotaisDaLista;
}

// ── Entrada do salvamento ───────────────────────────────────────────────────────────────────────────────────

/** Medicamento no corpo do salvamento. O `id` pode ser gerado pelo cliente (crypto.randomUUID) e dá chave estável ao item. */
export interface ItemCompraSalvarDTO {
  id: string;
  medicamento?: string;
  medicamentoCadastroId?: string | null;
  preCadastroId?: string | null;
  laboratorio?: string;
  brand?: BrandMedicamento | "";
  quantidade?: string;
  temperatura?: string;
  valorUnitario?: number | null;
  valorReal?: number | null;
}

/**
 * O salvamento automático: o estado da compra. `atualizadoEm` (o `updatedAt` que o cliente viu) é obrigatório. Campo ausente = não
 * muda; `itens` ausente = não mexe nos itens; `itens` presente = o estado COMPLETO (o que não vier é apagado) e a ordem do array é a
 * posição.
 */
export interface CompraSalvarDTO {
  atualizadoEm: string;
  fornecedor?: string;
  envio?: string;
  cia?: string;
  empresa?: EmpresaProcesso;
  numeroOrdens?: number;
  frete?: number | null;
  freteReal?: number | null;
  paciente?: string;
  processoNumero?: string;
  compraParticular?: boolean;
  recorrente?: boolean;
  medico?: string;
  localAplicacao?: string;
  entrega?: string;
  contatos?: string;
  despachante?: string;
  pagamentoAlvara?: boolean | null;
  pagamentoMomento?: MomentoPagamentoResumo | null;
  termoPosterior?: boolean;
  termoObservacao?: string;
  isencao?: boolean;
  documentos?: boolean | null;
  pendencias?: string[];
  observacoes?: string;
  consultor?: string;
  responsavel?: string;
  itens?: ItemCompraSalvarDTO[];
}

/** Os dados do despachante que o resumo usa (do Cadastro). NUNCA a chave PIX: este tipo nem tem o campo. */
export interface DespachanteCadastroResumo {
  nome?: string;
  telefone?: string;
  email?: string;
  contatoNome?: string;
}

// ── Estado já VALIDADO (o que o store recebe) ───────────────────────────────────────────────────────────────

/** Um medicamento já validado e normalizado (campo ausente no corpo virou vazio): todo campo está presente. */
export interface ItemCompraEstado {
  id: string;
  medicamento: string;
  medicamentoCadastroId: string | null;
  preCadastroId: string | null;
  laboratorio: string;
  brand: BrandMedicamento | "";
  quantidade: string;
  temperatura: string;
  valorUnitario: number | null;
  valorReal: number | null;
}

/** Os campos da compra que o salvamento pode alterar (os de identificação, numeração e auditoria não entram). */
export interface CamposCompraEditaveis {
  fornecedor: string;
  envio: string;
  cia: string;
  empresa: EmpresaProcesso;
  numeroOrdens: number;
  frete: number | null;
  freteReal: number | null;
  paciente: string;
  processoNumero: string;
  compraParticular: boolean;
  recorrente: boolean;
  medico: string;
  localAplicacao: string;
  entrega: string;
  contatos: string;
  despachante: string;
  pagamentoAlvara: boolean | null;
  pagamentoMomento: MomentoPagamentoResumo | null;
  termoPosterior: boolean;
  termoObservacao: string;
  isencao: boolean;
  documentos: boolean | null;
  pendencias: string[];
  observacoes: string;
  consultor: string;
  responsavel: string;
}

/** O que o formulário altera de uma vez: campos da compra e/ou os itens inteiros. */
export type MudancasCompra = Partial<CamposCompraEditaveis> & { itens?: ItemCompra[] };

/** O salvamento validado: só os campos que vieram, e os itens (quando vieram) como o estado COMPLETO. */
export interface CompraEstado {
  /** O `updatedAt` que o cliente viu. */
  atualizadoEm: string;
  campos: Partial<CamposCompraEditaveis>;
  itens?: ItemCompraEstado[];
}

// ── Opções do formulário (GET /api/compras/opcoes) ────────────────────────────────────────────────────────────
// Só itens ATIVOS e só os campos que o formulário usa. NUNCA há chave PIX aqui. Envio, cia aérea (por modal) e empresa não vêm daqui:
// são constantes compartilhadas com o Follow-Up (shared/constants/processos.ts).

export interface OpcaoFornecedor {
  nome: string;
}

export interface OpcaoDespachante {
  nome: string;
  contatoNome: string;
  telefone: string;
  email: string;
}

export interface OpcaoNome {
  nome: string;
}

/** O `id` é o `medicamentoCadastroId` do item da compra. */
export interface OpcaoMedicamento {
  id: string;
  nome: string;
  temperatura: string;
}

export interface PaginaMedicamentos {
  itens: OpcaoMedicamento[];
  /** Página (a partir de 1) e tamanho usados. */
  pagina: number;
  limite: number;
  /** Há mais itens depois desta página. */
  temMais: boolean;
  /** A busca aplicada (já normalizada), "" quando não houve. */
  q: string;
}

export interface OpcoesCompra {
  fornecedores: OpcaoFornecedor[];
  despachantes: OpcaoDespachante[];
  consultores: OpcaoNome[];
  temperaturas: OpcaoNome[];
  medicamentos: PaginaMedicamentos;
}

// ── Criar temperatura e pré-cadastro de medicamento (POST /api/compras/temperaturas e /pre-cadastro-medicamentos) ─────────────────

/** A temperatura do Cadastro (a mesma forma da lista de Temperaturas, sem PIX: ela não tem). */
export interface TemperaturaCriada {
  id: string;
  nome: string;
  ativo: boolean;
}

/** 201 `{ criada: true }` (nova) ou 200 `{ criada: false }` (já existia e está ativa). Existente INATIVA é 409 (ver RespostaTemperaturaInativa). */
export interface RespostaTemperatura {
  criada: boolean;
  item: TemperaturaCriada;
}

/** O `data` do 409 de temperatura que já existe mas está INATIVA: o administrador decide (reativar) pelos Cadastros. */
export interface RespostaTemperaturaInativa {
  criada: false;
  inativo: true;
  item: TemperaturaCriada;
}

export type StatusPreCadastro = "pendente" | "aprovado" | "rejeitado";

export interface PreCadastroMedicamento {
  id: string;
  nome: string;
  temperatura: string;
  status: StatusPreCadastro;
  compraId: string | null;
  cadastroId: string | null;
  solicitadoPor: string;
  /** Quando foi pedido (ISO, UTC). */
  criadoEm: string;
}

/** O medicamento que já está no Cadastro (o `data` do 409 do pré-cadastro; a tela passa a usá-lo). */
export interface MedicamentoDoCadastro {
  id: string;
  nome: string;
  temperatura: string;
  ativo: boolean;
}

/** 201 `{ criado: true }` (pendente novo) ou 200 `{ criado: false }` (já havia um pendente com o mesmo nome: o mesmo é devolvido). */
export interface RespostaPreCadastro {
  criado: boolean;
  preCadastro: PreCadastroMedicamento;
}

/** O `data` do 409 do pré-cadastro: o medicamento já existe no Cadastro. */
export interface RespostaMedicamentoJaCadastrado {
  criado: false;
  medicamento: MedicamentoDoCadastro;
}
