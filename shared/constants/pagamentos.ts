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

// Empresas de Pagamentos, redeclaradas aqui como valores independentes — Pagamento não
// importa nada de Patient nem de Processo.
export const EMPRESAS_PAGAMENTO: EmpresaPagamento[] = ["FARMAURORA"];

export const EMPRESA_PAGAMENTO_LABEL: Record<EmpresaPagamento, string> = {
  FARMAURORA: "Farmaurora",
};

export const MOEDAS: Moeda[] = ["USD", "EUR"];

export const MOEDA_LABEL: Record<Moeda, string> = {
  USD: "Dólar · USD",
  EUR: "Euro · EUR",
};

export const MOEDA_SIMBOLO: Record<Moeda, string> = {
  USD: "US$",
  EUR: "€",
};

// LISTAS ANTIGAS DE PAGAMENTOS — FORA DO FLUXO NOVO. Fornecedores, despachantes e transportadoras (e a chave PIX
// de cada um) agora são lidos dos Cadastros (Configurações → Cadastros): ver server/utils/cadastroPagamentos.ts e
// app/utils/pagamentoOptions.ts. As constantes abaixo, e as chaves PIX padrão escritas nelas, NÃO são mais usadas pelo
// app nem pelo servidor; ficam só até a conversão dos dados antigos. a remover na etapa 3 (junto com a tabela
// `pagamento_pix_chaves`, os data/pagamentos-*-pix.json e os scripts de migração/smoke que têm cópia das chaves).

// Mesma lista do campo Fornecedor do Follow-Up (FORNECEDORES_PROCESSO em
// shared/constants/processos.ts), replicada aqui — Pagamento não importa nada de
// Processo. Ordem alfabética, com "Outro" sempre por último. a remover na etapa 3.
export const FORNECEDORES_PAGAMENTO: FornecedorPagamento[] = [
  "Beldimed - Bélgica",
  "Pharyx - China",
  "Poros - Turquia",
  "Speciality - Índia",
  "Outro",
];

// Mesma lista do campo Despachante do Follow-Up (DESPACHANTES_PROCESSO em
// shared/constants/processos.ts), replicada aqui — Pagamento não importa nada de
// Processo. Ordem alfabética. a remover na etapa 3.
export const DESPACHANTES_PAGAMENTO: DespachantePagamento[] = [
  "Andreza Faconi",
  "Bruno Lopes",
  "Marcelo Lima",
];

// Chave PIX padrão por despachante — antigo fallback inicial do formulário "Adicionar pagamento", sobrescrito pela
// tabela `pagamento_pix_chaves`. Não é mais lido: a chave vem do Cadastro de despachantes (campo da chave PIX). a remover na etapa 3.
export const DESPACHANTE_PIX_PADRAO: Record<DespachantePagamento, string> = {
  "Andreza Faconi": "67.592.120/0001-04",
  "Bruno Lopes": "036.223.838-36",
  "Marcelo Lima": "05.342.805/0001-37",
};

// Transportadoras da aba Transportes + chave PIX padrão (mesma lógica do despachante). Não são mais lidas: vêm do
// Cadastro de transportadoras (nome e chave PIX). a remover na etapa 3.
export const TRANSPORTADORAS_PAGAMENTO: TransportadoraPagamento[] = ["AJC", "Doctor"];

export const TRANSPORTADORA_PIX_PADRAO: Record<TransportadoraPagamento, string> = {
  AJC: "09.614.254/0001-74",
  Doctor: "22.095.367/0001-79",
};

// Agrupa as 2 constantes acima por tipo. Sem uso depois que Pagamentos passou a ler dos Cadastros. a remover na etapa 3.
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

// Trava de sanidade das taxas de câmbio (R$ por 1 unidade da moeda). Evita que um
// erro de digitação (ex.: "5.4231" lido como 54231) vire valorReais absurdo.
// Validada no servidor (pagamentoValidation.ts) e no cliente (parseTaxa.ts).
export const TAXA_MIN = 1;
export const TAXA_MAX = 20;

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
