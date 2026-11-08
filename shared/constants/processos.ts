import type {
  CampoProcessoLimpavel,
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
export const MODAL_AIR_CARGO = "Air Cargo" satisfies ModalEnvio;
export const MODAL_COURIER_FORMAL = "Courier Formal" satisfies ModalEnvio;
export const MODAL_COURIER_SIMPLES = "Courier Simples" satisfies ModalEnvio;
export const MODAIS_ENVIO: ModalEnvio[] = [MODAL_AIR_CARGO, MODAL_COURIER_FORMAL, MODAL_COURIER_SIMPLES];

const CIAS_COURIER: readonly string[] = ["FedEx", "DHL"];

// Cia. aérea depende do modal de envio (a escolha vale na ordem listada). A cia continua OPCIONAL (pode
// ficar vazia). O valor guardado em `companhia_aerea` é exatamente um destes textos.
export const CIAS_AEREAS_POR_MODAL: Record<ModalEnvio, readonly string[]> = {
  [MODAL_AIR_CARGO]: ["Lufthansa", "Emirates", "Turkish", "Qatar", "Swiss"],
  [MODAL_COURIER_FORMAL]: CIAS_COURIER,
  [MODAL_COURIER_SIMPLES]: CIAS_COURIER,
};

// Cias do modal; lista vazia se o modal for vazio ou desconhecido (inclui o legado "Courier"). O modal é
// comparado exatamente como vem.
export function ciasAereasDoModal(modal: string | null | undefined): readonly string[] {
  if (typeof modal !== "string" || !Object.prototype.hasOwnProperty.call(CIAS_AEREAS_POR_MODAL, modal)) return [];
  return CIAS_AEREAS_POR_MODAL[modal as ModalEnvio];
}

// A cia vale para o modal? Vazia (null, undefined, "" ou só espaços) é sempre válida. Preenchida: precisa
// ser exatamente uma das cias do modal (compara após trim; sensível a maiúsculas e minúsculas).
export function ciaAereaValidaParaModal(modal: string | null | undefined, cia: string | null | undefined): boolean {
  const texto = typeof cia === "string" ? cia.trim() : "";
  if (texto === "") return true;
  return ciasAereasDoModal(modal).includes(texto);
}

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

// Limites das atualizações (timeline) de um processo. Escolhidos com folga sobre a produção
// (medido em 2026-11-06, só SELECT): maior texto = 296 caracteres, maior data = 5, mais itens num
// processo = 16 (82 processos, 128 itens) — ou seja, nunca rejeitam um dado já existente.
export const LIMITE_ATUALIZACAO_TEXTO = 2000;
export const LIMITE_ATUALIZACAO_DATA = 40;
export const LIMITE_ATUALIZACOES_POR_PROCESSO = 200;

// Campos opcionais do formulário de processo que podem ser ESVAZIADOS na edição (viram null no PATCH).
// Fora desta lista ficam o que o formulário não controla ou que é obrigatório: atualizações, alertas
// resolvidos, medicamentos, pendências, datas (objeto próprio) e paciente/pasta/empresa/consultor/status.
export const CAMPOS_PROCESSO_LIMPAVEIS: readonly CampoProcessoLimpavel[] = [
  "ordem",
  "responsavelOperacional",
  "despachante",
  "fornecedor",
  "transportadoraNacional",
  "modalEnvio",
  "companhiaAerea",
  "numeroAwb",
  "localEntrega",
  "numeroProcesso",
  "statusPagamento",
];
