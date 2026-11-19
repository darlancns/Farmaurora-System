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
