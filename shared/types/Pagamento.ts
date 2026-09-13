// Página Pagamentos — modelo de dados.
//
// Página independente das demais (mesmo princípio de Processo): NÃO tem nenhuma
// relação/FK com Patient ou Processo. Por isso o enum de empresa é redeclarado
// aqui como tipo independente, seguindo o precedente de EmpresaProcesso em
// shared/types/processo.ts — não importar de Patient.ts.

export type EmpresaPagamento = "FARMAURORA" | "MAINZFARMA";

export type Moeda = "USD" | "EUR";

export type BancoCambio = "XP" | "RENDIMENTO" | "INTEX";

// Mesmas opções do campo Fornecedor do Follow-Up (FornecedorProcesso em
// shared/types/processo.ts), replicadas aqui como tipo independente — Pagamento
// não importa nada de Processo. "Outro" libera um texto livre no formulário.
export type FornecedorPagamento =
  | "Beldimed - Bélgica"
  | "Pharyx - China"
  | "Poros - Turquia"
  | "Speciality - Índia"
  | "Outro";

// Mesmos despachantes do campo Despachante do Follow-Up (DespachanteProcesso em
// shared/types/processo.ts), replicados aqui como tipo independente.
export type DespachantePagamento = "Andreza Faconi" | "Bruno Lopes" | "Marcelo Lima";

// Transportadoras disponíveis na aba Transportes.
export type TransportadoraPagamento = "AJC" | "Doctor";

// Ciclo clicável na aba Despachante/Transportadora: NAO_PAGO <-> COMPLEMENTO.
// PAGO NÃO entra no ciclo — é setado só quando o grupo inteiro é pago pelo botão
// "Marcar grupo como pago" (pagarGrupoPagamento); fica no enum por causa de dados
// antigos. É apenas rótulo/rastreio por item — não há cálculo associado a nenhum
// estado. A transição é validada no servidor (server/utils/pagamentosStore.ts,
// atualizarItemGrupo).
export type StatusItemGrupo = "NAO_PAGO" | "PAGO" | "COMPLEMENTO";

// ── Banco ────────────────────────────────────────────────────────────────────

export interface LancamentoBanco {
  id: string;
  loteId: string;
  data: string; // ISO date (YYYY-MM-DD)
  empresa: EmpresaPagamento;
  fornecedor: string;
  invoice: string;
  cliente: string;
  valorMoeda: number;
  moeda: Moeda;
  // Nasce null. Só recebe valor quando um banco é escolhido na Cotação (regra 3):
  // valorReais = valorMoeda * taxa efetiva.
  valorReais: number | null;
  // Taxa de câmbio efetiva deste lançamento. Nasce null e só é preenchida no
  // fechamento POR ORDEM (banco Rendimento), onde cada lançamento do lote fecha
  // com uma taxa própria. XP/Intex usam a taxa única do lote
  // (LoteBanco.taxaEscolhida) e deixam este campo null.
  taxa: number | null;
  createdAt: string;
}

// O que é de fato persistido por opção de banco na cotação de um lote.
// quantidadeOrdens / totalMoeda / totalReais / diferenca são derivados em runtime.
export interface OpcaoCotacao {
  banco: BancoCambio;
  taxaCorretagem: number; // valor fixo por banco, editável; default 0
  taxa: number | null; // preenchida manualmente pelo usuário após cotar
}

// "Lote" = conjunto de lançamentos de uma mesma (empresa + moeda) que ainda não
// foi marcado como Pago. É a unidade que a Cotação agrega e que o botão "Pago"
// fecha e move para "Pagamentos realizados". Pode haver 2+ lotes abertos
// simultâneos para a mesma (empresa + moeda) — o lançamento entra num lote
// escolhido explicitamente (ver NovoLancamentoBancoDTO).
export interface LoteBanco {
  id: string;
  data: string; // ISO date — dia em que o lote foi aberto
  empresa: EmpresaPagamento;
  moeda: Moeda;
  // Rótulo estável e imutável do lote dentro da sua (empresa + moeda).
  // Atribuído na criação: 1 se não há nenhum lote aberto dessa (empresa + moeda)
  // no momento; senão, (maior numeroLote entre os abertos) + 1. Nunca muda depois
  // — Lote 2 continua Lote 2 mesmo se o Lote 1 for pago antes. Reinicia em 1
  // quando não sobra nenhum lote aberto dessa (empresa + moeda).
  numeroLote: number;
  opcoes: OpcaoCotacao[]; // sempre XP, RENDIMENTO, INTEX
  bancoEscolhido: BancoCambio | null;
  taxaEscolhida: number | null;
  realizado: boolean;
  pagoEm: string | null;
  createdAt: string;
}

// Visão calculada de uma opção de banco na cotação de um lote (não persistida).
export interface CotacaoOpcaoView extends OpcaoCotacao {
  quantidadeOrdens: number;
  totalMoeda: number;
  totalReais: number | null;
  // Diferença do totalReais deste banco contra o mais barato do lote.
  // null enquanto a taxa deste banco não foi preenchida.
  diferenca: number | null;
  maisBarato: boolean;
}

// ── Despachante / Transportadora ─────────────────────────────────────────────

export type TipoGrupoPagamento = "DESPACHANTE" | "TRANSPORTADORA";

export interface ItemGrupoPagamento {
  paciente: string;
  valor: number;
  status: StatusItemGrupo;
}

export interface GrupoPagamento {
  id: string;
  tipo: TipoGrupoPagamento;
  data: string; // ISO date
  empresa: EmpresaPagamento;
  nomeGrupo: string; // nome do despachante ou da transportadora
  chavePix?: string;
  itens: ItemGrupoPagamento[];
  realizado: boolean;
  pagoEm: string | null;
  createdAt: string;
}

// ── DTOs de entrada ─────────────────────────────────────────────────────────

export interface NovoLancamentoBancoDTO {
  empresa: EmpresaPagamento;
  moeda: Moeda;
  fornecedor: string;
  invoice: string;
  cliente: string;
  valorMoeda: number;
  // Escolha do lote de destino. Mutuamente exclusivos; os dois ausentes = comportamento
  // legado (entra no lote aberto dessa empresa+moeda, criando um se não existir).
  //  - loteId: grava neste lote específico (deve estar aberto e com empresa+moeda batendo).
  //  - forcarLoteNovo: cria um lote NOVO (fluxo "+ Novo lote"), ignorando os abertos.
  loteId?: string;
  forcarLoteNovo?: boolean;
}

// Taxa por lançamento no fechamento por ordem do Rendimento.
export interface TaxaLancamentoRendimento {
  lancamentoId: string;
  taxa: number;
}

export interface AtualizarCotacaoDTO {
  // Atualiza taxa/corretagem das opções e, opcionalmente, escolhe um banco.
  opcoes?: Array<Pick<OpcaoCotacao, "banco" | "taxaCorretagem" | "taxa">>;
  bancoEscolhido?: BancoCambio; // dispara o recálculo da regra 3
  // Só quando bancoEscolhido === "RENDIMENTO": uma taxa por lançamento pendente
  // do lote. Obrigatório nesse caso e precisa cobrir TODOS os pendentes
  // (fechamento parcial não é permitido). Ignorado para XP/Intex.
  taxasRendimento?: TaxaLancamentoRendimento[];
}

// Edição de um lançamento já criado (só campos livres; moeda/empresa/lote fixos).
export type AtualizarLancamentoBancoDTO = Partial<
  Pick<LancamentoBanco, "fornecedor" | "invoice" | "cliente" | "valorMoeda">
>;

export interface NovoGrupoPagamentoDTO {
  tipo: TipoGrupoPagamento;
  data: string;
  empresa: EmpresaPagamento;
  nomeGrupo: string;
  chavePix?: string;
  itens: Array<Pick<ItemGrupoPagamento, "paciente" | "valor">>;
}

export interface AtualizarItemGrupoDTO {
  index: number;
  status: StatusItemGrupo;
}

// Edição de um item (paciente) já dentro de um grupo.
export interface EditarItemGrupoDTO {
  index: number;
  paciente: string;
  valor: number;
}
