import {
  CONSULTORES_PROCESSO,
  DESPACHANTES_PROCESSO,
  EMPRESAS_PROCESSO,
  FORNECEDORES_PROCESSO,
  MODAIS_ENVIO,
  RESPONSAVEIS_PROCESSO,
  STATUS_PAGAMENTO_PROCESSO,
  STATUS_PROCESSO_ORDER,
} from "#shared/constants/processos";
import { STATUS_PROCESSO_META } from "./processoStatus";
import type { AppSelectOption } from "../types/appSelect";
import type {
  ConsultorProcesso,
  DespachanteProcesso,
  EmpresaProcesso,
  FornecedorProcesso,
  ModalEnvio,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "#shared/types/processo";

export const CONSULTOR_OPTIONS: AppSelectOption<ConsultorProcesso | "">[] = [
  { value: "", label: "Selecione" },
  ...CONSULTORES_PROCESSO.map((nome) => ({ value: nome, label: nome })),
];

export const EMPRESA_OPTIONS: AppSelectOption<EmpresaProcesso>[] = EMPRESAS_PROCESSO.map((empresa) => ({
  value: empresa,
  label: empresa,
}));

export const STATUS_OPTIONS: AppSelectOption<StatusProcesso>[] = STATUS_PROCESSO_ORDER.map((status) => ({
  value: status,
  label: STATUS_PROCESSO_META[status].label,
}));

export const MODAL_ENVIO_OPTIONS: AppSelectOption<ModalEnvio | "">[] = [
  { value: "", label: "Selecione" },
  ...MODAIS_ENVIO.map((modal) => ({ value: modal, label: modal })),
];

export const DESPACHANTE_OPTIONS: AppSelectOption<DespachanteProcesso | "">[] = [
  { value: "", label: "Selecione" },
  ...DESPACHANTES_PROCESSO.map((nome) => ({ value: nome, label: nome })),
];

export const FORNECEDOR_OPTIONS: AppSelectOption<FornecedorProcesso | "">[] = [
  { value: "", label: "Selecione" },
  ...FORNECEDORES_PROCESSO.map((nome) => ({ value: nome, label: nome })),
];

export const RESPONSAVEL_OPTIONS: AppSelectOption<string>[] = [
  { value: "", label: "Selecione" },
  ...RESPONSAVEIS_PROCESSO.map((nome) => ({ value: nome, label: nome })),
];

export const STATUS_PAGAMENTO_OPTIONS: AppSelectOption<StatusPagamentoProcesso | "">[] = [
  { value: "", label: "Selecione" },
  ...STATUS_PAGAMENTO_PROCESSO.map((status) => ({
    value: status,
    label: status === "pago" ? "Pago" : "Pendente",
  })),
];

// Variantes com opção "Todos" pros filtros da toolbar.
export const STATUS_FILTER_OPTIONS: AppSelectOption<StatusProcesso | "">[] = [
  { value: "", label: "Todos os status" },
  ...STATUS_OPTIONS,
];

export const EMPRESA_FILTER_OPTIONS: AppSelectOption<EmpresaProcesso | "">[] = [
  { value: "", label: "Todas as empresas" },
  ...EMPRESA_OPTIONS,
];

export const RESPONSAVEL_FILTER_OPTIONS: AppSelectOption<string>[] = [
  { value: "", label: "Todos os responsáveis" },
  ...RESPONSAVEIS_PROCESSO.map((nome) => ({ value: nome, label: nome })),
];
