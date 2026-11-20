// A Compra (página Compras): o que o servidor guarda e devolve (tabelas compras, compra_ordens e compra_itens) e o que o cliente envia
// ao salvar. O texto do "Resumo da compra" sai daqui por `compraParaResumoEntrada` (shared/utils/compraResumo.ts).
//
// Convenções (as mesmas da DIR e dos Cadastros): no modelo, texto vazio é "" (nunca undefined); dinheiro é número com 2 casas ou null
// (vazio); datas e instantes são texto ISO. Quantidade é TEXTO com a unidade ("12 ampolas"). Nomes com sufixo próprio para não
// colidir com `Medicamento` (processo.ts) nem com `MedicamentoCadastro` (Cadastro.ts).

import type { MomentoPagamentoResumo } from "./compraResumo";

/** Um medicamento de uma ordem. */
export interface ItemCompra {
  id: string;
  /** 1..N dentro da ordem (a ordem em que aparece). */
  posicao: number;
  /** Do Cadastro de medicamentos ou texto livre do pré-cadastro. */
  medicamento: string;
  /** Preenchido quando o medicamento é um item do Cadastro. */
  medicamentoCadastroId: string | null;
  /** Preenchido quando o medicamento está no pré-cadastro (ainda não aprovado). */
  preCadastroId: string | null;
  apresentacao: string;
  referencia: string;
  laboratorio: string;
  quantidade: string;
  temperatura: string;
  valorUnitario: number | null;
  valorReal: number | null;
}

/** Uma ordem de compra: um fornecedor, um envio e seus medicamentos. */
export interface OrdemCompra {
  id: string;
  /** 1..N dentro da compra. */
  posicao: number;
  fornecedor: string;
  envio: string;
  cia: string;
  /** "" ou o PO completo (PO26-10-0471). */
  po: string;
  frete: number | null;
  freteReal: number | null;
  /** SÓ LEITURA aqui: quem preenche é o "Encaminhar para a DIR" (o salvamento da compra ignora estes dois). */
  dirId: string | null;
  encaminhadaEm: string | null;
  itens: ItemCompra[];
}

export interface Compra {
  id: string;
  /** Mês de BRASÍLIA no formato AAAA-MM. */
  anoMes: string;
  /** Número da compra dentro do mês (1, 2, 3...). */
  sequencia: number;
  cancelada: boolean;
  paciente: string;
  processoNumero: string;
  medico: string;
  localAplicacao: string;
  entrega: string;
  contatos: string;
  termoObservacao: string;
  despachante: string;
  isencaoPara: string;
  observacoes: string;
  vendedor: string;
  responsavel: string;
  compraParticular: boolean;
  localDeclarado: boolean;
  termoPosterior: boolean;
  courierSimples: boolean;
  isencao: boolean;
  /** Compra recorrente (avisa no resumo). */
  recorrente: boolean;
  /** null = ainda não decidido. */
  pagamentoAlvara: boolean | null;
  pagamentoMomento: MomentoPagamentoResumo | null;
  documentos: boolean | null;
  pendencias: string[];
  criadoPor: string;
  atualizadoPor: string;
  createdAt: string;
  /** Também é a VERSÃO da compra: o cliente a devolve ao salvar e, se mudou, o servidor responde 409. */
  updatedAt: string;
  ordens: OrdemCompra[];
}

/** Uma compra na lista do mês: os campos dela, sem as ordens, e quantas ordens tem e quantas já foram encaminhadas. */
export type CompraDaLista = Omit<Compra, "ordens"> & {
  totalOrdens: number;
  totalOrdensEncaminhadas: number;
};

// ── Entrada do salvamento ───────────────────────────────────────────────────────────────────────────────────

/** Medicamento no corpo do salvamento. O `id` pode ser gerado pelo cliente (crypto.randomUUID) e dá chave estável ao item. */
export interface ItemCompraSalvarDTO {
  id: string;
  medicamento?: string;
  medicamentoCadastroId?: string | null;
  preCadastroId?: string | null;
  apresentacao?: string;
  referencia?: string;
  laboratorio?: string;
  quantidade?: string;
  temperatura?: string;
  valorUnitario?: number | null;
  valorReal?: number | null;
}

export interface OrdemCompraSalvarDTO {
  id: string;
  fornecedor?: string;
  envio?: string;
  cia?: string;
  po?: string;
  frete?: number | null;
  freteReal?: number | null;
  /** Aceitos e IGNORADOS (o cliente pode devolver o que leu): só o Encaminhar grava estes dois. */
  dirId?: string | null;
  encaminhadaEm?: string | null;
  itens: ItemCompraSalvarDTO[];
}

/**
 * O salvamento automático: o estado da compra. `atualizadoEm` (o `updatedAt` que o cliente viu) é obrigatório. Campo ausente = não
 * muda; `ordens` ausente = não mexe nas ordens; `ordens` presente = o estado COMPLETO (o que não vier é apagado) e a ordem do
 * array é a posição.
 */
export interface CompraSalvarDTO {
  atualizadoEm: string;
  paciente?: string;
  processoNumero?: string;
  medico?: string;
  localAplicacao?: string;
  entrega?: string;
  contatos?: string;
  termoObservacao?: string;
  despachante?: string;
  isencaoPara?: string;
  observacoes?: string;
  vendedor?: string;
  responsavel?: string;
  compraParticular?: boolean;
  localDeclarado?: boolean;
  termoPosterior?: boolean;
  courierSimples?: boolean;
  isencao?: boolean;
  recorrente?: boolean;
  pagamentoAlvara?: boolean | null;
  pagamentoMomento?: MomentoPagamentoResumo | null;
  documentos?: boolean | null;
  pendencias?: string[];
  ordens?: OrdemCompraSalvarDTO[];
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
  apresentacao: string;
  referencia: string;
  laboratorio: string;
  quantidade: string;
  temperatura: string;
  valorUnitario: number | null;
  valorReal: number | null;
}

/** Uma ordem já validada e normalizada. Não tem dirId nem encaminhadaEm: só o Encaminhar os grava. */
export interface OrdemCompraEstado {
  id: string;
  fornecedor: string;
  envio: string;
  cia: string;
  po: string;
  frete: number | null;
  freteReal: number | null;
  itens: ItemCompraEstado[];
}

/** Os campos da compra que o salvamento pode alterar (os de identificação, numeração e auditoria não entram). */
export interface CamposCompraEditaveis {
  paciente: string;
  processoNumero: string;
  medico: string;
  localAplicacao: string;
  entrega: string;
  contatos: string;
  termoObservacao: string;
  despachante: string;
  isencaoPara: string;
  observacoes: string;
  vendedor: string;
  responsavel: string;
  compraParticular: boolean;
  localDeclarado: boolean;
  termoPosterior: boolean;
  courierSimples: boolean;
  isencao: boolean;
  recorrente: boolean;
  pagamentoAlvara: boolean | null;
  pagamentoMomento: MomentoPagamentoResumo | null;
  documentos: boolean | null;
  pendencias: string[];
}

/** O salvamento validado: só os campos que vieram, e as ordens (quando vieram) como o estado COMPLETO. */
export interface CompraEstado {
  /** O `updatedAt` que o cliente viu. */
  atualizadoEm: string;
  campos: Partial<CamposCompraEditaveis>;
  ordens?: OrdemCompraEstado[];
}

// ── Opções do formulário (GET /api/compras/opcoes) ────────────────────────────────────────────────────────────
// Só itens ATIVOS e só os campos que o formulário usa. NUNCA há chave PIX aqui (nem nos despachantes nem nas transportadoras).

export interface OpcaoFornecedor {
  nome: string;
  pais: string;
  prazoAlertaDias: number | null;
  semAlerta: boolean;
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
  ciasAereas: OpcaoNome[];
  transportadoras: OpcaoNome[];
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
