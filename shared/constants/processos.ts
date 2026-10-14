import type {
  ConsultorProcesso,
  DespachanteProcesso,
  EmpresaProcesso,
  FornecedorProcesso,
  ModalEnvio,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "../types/processo";

// Lista canônica de consultores do Follow-Up (e das contas com cargo consultor).
// Inclui os 7 nomes do cadastro de paciente (shared/types/Patient.ts,
// ConsultorNome) + os que só existem no Follow-Up — Processo não importa nada de
// Patient, e Pacientes continua só com os 7 (shared/constants/consultores.ts).
// Ordem alfabética (pt-BR); espelha o enum `consultor_nome` do Postgres.
export const CONSULTORES_PROCESSO: ConsultorProcesso[] = [
  "Alessandra",
  "André Vitório",
  "Bolívar",
  "Bráulio",
  "Dani",
  "Flávia",
  "Flavinha",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulinho",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
];

export const EMPRESAS_PROCESSO: EmpresaProcesso[] = ["FARMAURORA", "MAINZFARMA"];

// Ordem alfabética (regra geral de ordenação dos selects de entidade/nome).
export const MODAIS_ENVIO: ModalEnvio[] = ["Air Cargo", "Courier Formal", "Courier Simples"];

// Ordem alfabética.
export const DESPACHANTES_PROCESSO: DespachanteProcesso[] = ["Andreza Faconi", "Bruno Lopes", "Marcelo Lima"];

// Ordem alfabética, com "Outro" sempre por último (fora da ordem alfabética,
// é o padrão esperado desse tipo de campo).
export const FORNECEDORES_PROCESSO: FornecedorProcesso[] = [
  "Beldimed - Bélgica",
  "Pharyx - China",
  "Poros - Turquia",
  "Speciality - Índia",
  "Outro",
];

// Ordem alfabética.
export const RESPONSAVEIS_PROCESSO: string[] = ["Bruno", "Rebeca"];

export const STATUS_PAGAMENTO_PROCESSO: StatusPagamentoProcesso[] = ["pago", "pendente"];

export const STATUS_PROCESSO_ORDER: StatusProcesso[] = [
  "elaboracao_fornecedores",
  "aguardando_inicio",
  "em_transito",
  "desembaraco",
  "liberado",
  "liberado_parcial",
  "entregue",
  "outro", // sempre por último (fora do pipeline), como o "Outro" do fornecedor
];

export const STATUS_PROCESSO_LABELS: Record<StatusProcesso, string> = {
  elaboracao_fornecedores: "Elaboração / Fornecedores",
  aguardando_inicio: "Aguardando início",
  em_transito: "Em trânsito",
  desembaraco: "Desembaraço",
  liberado: "Liberado",
  liberado_parcial: "Liberado parcial",
  entregue: "Entregue",
  outro: "Outro",
};
