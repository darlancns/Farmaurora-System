export type EmpresaCodigo = "FARMAURORA" | "MAINZFARMA";

export type ConsultorNome =
  | "André Vitório"
  | "Mateus Morais"
  | "Paulo Braga"
  | "Thiago Guedes"
  | "Gabriela Megda"
  | "Gabriela Santana"
  | "Vinícius Alves";

export type AttachmentSlotKey = string;

/** Andamento da prestação (marca manual, salva no banco). */
export type PatientStatus = "em_andamento" | "concluida";

export interface MedicamentoItem {
  qtd: string;
  medicamento: string;
}

export interface Patient {
  id: string;
  data: string;
  paciente: string;
  descricaoCompra: string;
  descricaoResumo: string;
  medicamentos: MedicamentoItem[];
  empresa: EmpresaCodigo;
  consultor: ConsultorNome | "";
  alvara: number;
  custoImportacao: number;
  despesaTotal: number;
  transporteTotal: number;
  despachanteRemessas: number;
  transporteRemessas: number;
  despesasPorRemessa: string[];
  transportesPorRemessa: string[];
  remessas: number;
  attachedSlots: AttachmentSlotKey[];
  status: PatientStatus;
  createdAt: string;
}

// `status` fica de fora: criar não envia (vale o padrão do banco) e editar nunca o sobrescreve — só o PATCH dedicado.
export type NewPatientDTO = Omit<Patient, "id" | "createdAt" | "attachedSlots" | "status">;

export interface PatientComputed extends Patient {
  valorNota: number;
  imposto: number;
  taxaImposto: number;
  valorTotal: number;
  isNotaCheia: boolean;
}
