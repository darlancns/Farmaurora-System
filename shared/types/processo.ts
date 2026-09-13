export interface Medicamento {
  nome: string;
  dosagem?: string;
  quantidade?: string;
}

export interface AtualizacaoProcesso {
  data: string; // texto livre, ex: "31/08" ou "2026-08-31"
  texto: string;
}

export interface TransportadoraNacional {
  nome: string;
  cotacao?: string;
  valor?: number;
}

export type StatusProcesso =
  | "elaboracao_fornecedores"
  | "aguardando_inicio" // pagamento pendente
  | "em_transito"
  | "desembaraco"
  | "liberado"
  | "liberado_parcial"
  | "entregue";

export type EmpresaProcesso = "FARMAURORA" | "MAINZFARMA";

// Copiados de shared/types/Patient.ts (ConsultorNome) como um tipo independente —
// Processo não tem nenhuma relação/FK com Patient, ver server/utils/processosStore.ts.
export type ConsultorProcesso =
  | "André Vitório"
  | "Mateus Morais"
  | "Paulo Braga"
  | "Thiago Guedes"
  | "Gabriela Megda"
  | "Gabriela Santana"
  | "Vinícius Alves";

// Tipo usado apenas pra montar as opções do select — o campo Processo.modalEnvio
// em si fica com tipo largo (string), porque registros migrados do doc antigo têm
// modalEnvio "Courier" (valor legado que não existe mais aqui). Ver nota em
// Processo.modalEnvio mais abaixo.
export type ModalEnvio = "Air Cargo" | "Courier Formal" | "Courier Simples";

// Idem: tipo usado só pras opções do select de Despachante. Processo.despachante
// continua string livre pra não travar em registros com valor legado que não bate
// com nenhum dos 3 nomes confirmados (ex.: "Marcelo Lopes", "Marcelo" sem sobrenome).
export type DespachanteProcesso = "Andreza Faconi" | "Bruno Lopes" | "Marcelo Lima";

// Idem: tipo usado só pras opções do select de Fornecedor. "Outro" é o valor
// sentinela do select quando o usuário escolhe digitar um fornecedor fora da
// lista fixa — o que é salvo em Processo.fornecedor nesse caso é o texto
// digitado, nunca a string literal "Outro" (ver ProcessoFormModal.vue).
export type FornecedorProcesso =
  | "Beldimed - Bélgica"
  | "Pharyx - China"
  | "Poros - Turquia"
  | "Speciality - Índia"
  | "Outro";

export type StatusPagamentoProcesso = "pago" | "pendente";

export interface ProcessoDatas {
  dataCompraPO?: string;
  dataEmbarque?: string;
  aberturaThread?: string;
  dataChegadaBrasil?: string;
  registroRadar?: string;
  registroDuimp?: string;
  registroLpco?: string;
  previsaoEntrega?: string;
  supostaEstimativa?: string;
}

export interface Processo {
  id: string;
  paciente: string;
  ordem?: string; // ex: "Ordem 2"
  pasta: string; // ex: "2026 - 234" (renomeado de "codigo")
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso;
  responsavelOperacional?: string; // Bruno, Rebeca
  despachante?: string; // um dos DespachanteProcesso, ou valor legado não migrado (ver tipo)
  fornecedor?: string; // um dos FornecedorProcesso, texto livre quando "Outro", ou valor legado
  transportadoraNacional?: TransportadoraNacional;
  // string livre (não ModalEnvio) pelo mesmo motivo de despachante/fornecedor:
  // registros migrados têm modalEnvio "Courier", valor que não existe mais no
  // enum novo (ModalEnvio). Não reclassificar automaticamente — só a Cris decide
  // Simples vs Formal pra cada processo legado.
  modalEnvio?: string;
  companhiaAerea?: string;
  numeroAwb?: string;
  codigoRastreio?: string;
  medicamentos: Medicamento[];
  status: StatusProcesso;
  datas: ProcessoDatas;
  localEntrega?: string;
  numeroProcesso?: string;
  pendencias: string[];
  statusPagamento?: StatusPagamentoProcesso;
  // true = usuário marcou manualmente o alerta de prazo de fornecedor como
  // resolvido pra este processo, suprimindo a notificação mesmo que o prazo
  // já tenha passado (ver app/utils/prazoFornecedor.ts).
  alertaFornecedorResolvido?: boolean;
  atualizacoes: AtualizacaoProcesso[];
  createdAt: string;
  updatedAt: string;
}

export type NewProcessoDTO = Omit<Processo, "id" | "createdAt" | "updatedAt">;

// Payload de edição não inclui `atualizacoes` — a timeline é gerenciada à parte,
// via ProcessoDetail (campo rápido de atualização), pra não sobrescrever entradas
// já registradas quando o usuário só edita outros campos por este formulário.
export type ProcessoFormUpdatePayload = Omit<NewProcessoDTO, "atualizacoes">;
