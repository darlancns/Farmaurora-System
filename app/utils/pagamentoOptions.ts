import {
  BANCO_CAMBIO_LABEL,
  BANCOS_CAMBIO,
  DESPACHANTES_PAGAMENTO,
  EMPRESA_PAGAMENTO_LABEL,
  EMPRESAS_PAGAMENTO,
  FORNECEDORES_PAGAMENTO,
  MOEDA_LABEL,
  MOEDAS,
  TRANSPORTADORAS_PAGAMENTO,
} from "#shared/constants/pagamentos";
import type { AppSelectOption } from "../types/appSelect";
import type {
  BancoCambio,
  DespachantePagamento,
  EmpresaPagamento,
  FornecedorPagamento,
  Moeda,
  TransportadoraPagamento,
} from "#shared/types/Pagamento";

export const EMPRESA_PAGAMENTO_OPTIONS: AppSelectOption<EmpresaPagamento>[] = EMPRESAS_PAGAMENTO.map(
  (empresa) => ({ value: empresa, label: EMPRESA_PAGAMENTO_LABEL[empresa] })
);

export const MOEDA_OPTIONS: AppSelectOption<Moeda>[] = MOEDAS.map((moeda) => ({
  value: moeda,
  label: MOEDA_LABEL[moeda],
}));

export const BANCO_CAMBIO_OPTIONS: AppSelectOption<BancoCambio>[] = BANCOS_CAMBIO.map((banco) => ({
  value: banco,
  label: BANCO_CAMBIO_LABEL[banco],
}));

function buildNomeOptions<T extends string>(nomes: readonly T[]): AppSelectOption<T | "">[] {
  return [{ value: "", label: "Selecione" }, ...nomes.map((nome) => ({ value: nome, label: nome }))];
}

export const FORNECEDOR_PAGAMENTO_OPTIONS: AppSelectOption<FornecedorPagamento | "">[] = [
  { value: "", label: "Selecione" },
  ...FORNECEDORES_PAGAMENTO.map((nome) => ({ value: nome, label: nome })),
];

export const DESPACHANTE_PAGAMENTO_OPTIONS: AppSelectOption<DespachantePagamento | "">[] =
  buildNomeOptions(DESPACHANTES_PAGAMENTO);

export const TRANSPORTADORA_PAGAMENTO_OPTIONS: AppSelectOption<TransportadoraPagamento | "">[] =
  buildNomeOptions(TRANSPORTADORAS_PAGAMENTO);
