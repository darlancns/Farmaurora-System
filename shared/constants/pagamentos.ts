import type {
  BancoCambio,
  DespachantePagamento,
  EmpresaPagamento,
  FornecedorPagamento,
  Moeda,
  StatusItemGrupo,
  TipoGrupoPagamento,
  TransportadoraPagamento,
} from "../types/Pagamento";

// Mesmas 2 empresas usadas em Patient/Processo, redeclaradas aqui como valores
// independentes — Pagamento não importa nada de Patient nem de Processo.
export const EMPRESAS_PAGAMENTO: EmpresaPagamento[] = ["FARMAURORA", "MAINZFARMA"];

export const EMPRESA_PAGAMENTO_LABEL: Record<EmpresaPagamento, string> = {
  FARMAURORA: "Farmaurora",
  MAINZFARMA: "MainzFarma",
};

export const MOEDAS: Moeda[] = ["USD", "EUR"];

export const MOEDA_LABEL: Record<Moeda, string> = {
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
};

export const MOEDA_SIMBOLO: Record<Moeda, string> = {
  USD: "US$",
  EUR: "€",
};

// Mesma lista do campo Fornecedor do Follow-Up (FORNECEDORES_PROCESSO em
// shared/constants/processos.ts), replicada aqui — Pagamento não importa nada de
// Processo. Ordem alfabética, com "Outro" sempre por último.
export const FORNECEDORES_PAGAMENTO: FornecedorPagamento[] = [
  "Beldimed - Bélgica",
  "Pharyx - China",
  "Poros - Turquia",
  "Speciality - Índia",
  "Outro",
];

// Mesma lista do campo Despachante do Follow-Up (DESPACHANTES_PROCESSO em
// shared/constants/processos.ts), replicada aqui — Pagamento não importa nada de
// Processo. Ordem alfabética.
export const DESPACHANTES_PAGAMENTO: DespachantePagamento[] = [
  "Andreza Faconi",
  "Bruno Lopes",
  "Marcelo Lima",
];

// Chave PIX padrão por despachante — usada para pré-preencher o formulário
// "Adicionar pagamento". O valor efetivo pode ser sobrescrito pelo usuário e fica
// persistido em data/pagamentos-despachante-pix.json (ver pagamentosStore.ts);
// esta constante é só o fallback inicial.
export const DESPACHANTE_PIX_PADRAO: Record<DespachantePagamento, string> = {
  "Andreza Faconi": "67.592.120/0001-04",
  "Bruno Lopes": "036.223.838-36",
  "Marcelo Lima": "05.342.805/0001-37",
};

// Transportadoras da aba Transportes + chave PIX padrão (mesma lógica do
// despachante — override persistido em data/pagamentos-transportadora-pix.json).
export const TRANSPORTADORAS_PAGAMENTO: TransportadoraPagamento[] = ["AJC", "Doctor"];

export const TRANSPORTADORA_PIX_PADRAO: Record<TransportadoraPagamento, string> = {
  AJC: "09.614.254/0001-74",
  Doctor: "22.095.367/0001-79",
};

// Agrupa as 2 constantes acima por tipo — usado onde despachante/transportadora
// precisam ser tratados de forma genérica (ex: isNomeConhecido em
// pagamentosPixStore.ts). As constantes individuais continuam exportadas
// como estavam, pros imports existentes.
interface GrupoPagamentoConfig {
  nomes: readonly string[];
  pixPadrao: Record<string, string>;
}

export const GRUPO_PAGAMENTO_CONFIG: Record<TipoGrupoPagamento, GrupoPagamentoConfig> = {
  DESPACHANTE: { nomes: DESPACHANTES_PAGAMENTO, pixPadrao: DESPACHANTE_PIX_PADRAO },
  TRANSPORTADORA: { nomes: TRANSPORTADORAS_PAGAMENTO, pixPadrao: TRANSPORTADORA_PIX_PADRAO },
};

// Bancos candidatos da Cotação Câmbio, sempre nesta ordem.
export const BANCOS_CAMBIO: BancoCambio[] = ["XP", "RENDIMENTO", "INTEX"];

export const BANCO_CAMBIO_LABEL: Record<BancoCambio, string> = {
  XP: "XP",
  RENDIMENTO: "Rendimento",
  INTEX: "Intex",
};

// Corretagem começa em R$ 0,00 para todos os bancos, editável na UI (por lote).
export const TAXA_CORRETAGEM_PADRAO = 0;

// Todos os status possíveis por item (inclui PAGO por causa de dados antigos).
export const STATUS_ITEM_GRUPO_ORDER: StatusItemGrupo[] = ["NAO_PAGO", "PAGO", "COMPLEMENTO"];

// Ciclo clicável na aba Despachante/Transportes: só "Não pago" ↔ "Complemento".
// "Pago" saiu do ciclo — o grupo inteiro é pago pelo botão "Marcar grupo como
// pago", que já move o grupo para "Pagamentos realizados".
export const STATUS_ITEM_GRUPO_CICLO: StatusItemGrupo[] = ["NAO_PAGO", "COMPLEMENTO"];

export const STATUS_ITEM_GRUPO_LABEL: Record<StatusItemGrupo, string> = {
  NAO_PAGO: "Não pago",
  PAGO: "Pago",
  COMPLEMENTO: "Complemento",
};

export const TIPOS_GRUPO_PAGAMENTO: TipoGrupoPagamento[] = ["DESPACHANTE", "TRANSPORTADORA"];

export const TIPO_GRUPO_PAGAMENTO_LABEL: Record<TipoGrupoPagamento, string> = {
  DESPACHANTE: "Despachante",
  TRANSPORTADORA: "Transportadora",
};
