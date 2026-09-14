import { computed, reactive, watch, type ComputedRef } from "vue";
import type {
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  Processo,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "#shared/types/processo";
import { EMPRESAS_PROCESSO, FORNECEDORES_PROCESSO } from "#shared/constants/processos";
import { maskDataDDMM, maskPastaCode, parseOrdemNumero } from "../utils/processoFormatters";
import {
  precisaDespachanteTransportadora,
  validarProcessoForm,
  type ValidarProcessoFormResult,
} from "../utils/processoFormPayload";
import { useOutroSentinel } from "./useOutroSentinel";
import { useTitleCaseInput } from "./useTitleCaseInput";
import { STATUS_OPTIONS } from "../utils/processoOptions";

// Extraído de ProcessoFormModal.vue (Round 9, Parte 2) — todo o estado do
// formulário de Processo, os handlers de input, e o wiring com
// validarProcessoForm/precisaDespachanteTransportadora (extraídos na Parte 1,
// consumidos aqui, não duplicados). Comportamento preservado exatamente como
// estava.

export interface FormState {
  paciente: string;
  ordem: string; // só o número (ex.: "2") — o rótulo "Ordem 2" é montado no submit
  pasta: string;
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso | "";
  responsavelOperacional: string;
  // Despachante fica string solta (não union) de propósito: precisa aceitar e
  // devolver sem erro valores legados que não batem com nenhuma das 3 opções
  // do select (ex.: "Marcelo Lopes", "Marcelo" sem sobrenome) sem reclassificar
  // nada sozinho — ver AppSelect, que já mostra "Selecione" quando o valor
  // atual não bate com nenhuma opção, em vez de travar.
  despachante: string;
  transportadoraNome: string;
  transportadoraCotacao: string;
  transportadoraValor: string; // ver nota sobre o bug de type="number" em processoFormPayload.ts
  // Mesma lógica de despachante: string solta pra aceitar o valor legado
  // "Courier" (não existe mais no ModalEnvio novo) sem travar a tela.
  modalEnvio: string;
  companhiaAerea: string;
  numeroAwb: string;
  codigoRastreio: string;
  status: StatusProcesso;
  dataCompraPO: string;
  dataEmbarque: string;
  aberturaThread: string;
  dataChegadaBrasil: string;
  registroRadar: string;
  registroDuimp: string;
  registroLpco: string;
  previsaoEntrega: string;
  supostaEstimativa: string;
  localEntrega: string;
  numeroProcesso: string;
  statusPagamento: StatusPagamentoProcesso | "";
}

export type DataField =
  | "dataCompraPO"
  | "dataEmbarque"
  | "aberturaThread"
  | "dataChegadaBrasil"
  | "registroRadar"
  | "registroDuimp"
  | "registroLpco"
  | "previsaoEntrega"
  | "supostaEstimativa";

// Opções fixas do Fornecedor, sem o sentinela "Outro" — usado só pra decidir se
// um valor existente bate com uma das 4 opções reais ao carregar o form.
const FORNECEDORES_FIXOS = FORNECEDORES_PROCESSO.filter((f) => f !== "Outro");

function emptyForm(): FormState {
  return {
    paciente: "",
    ordem: "",
    pasta: "",
    empresa: EMPRESAS_PROCESSO[0] as EmpresaProcesso,
    consultor: "",
    responsavelOperacional: "",
    despachante: "",
    transportadoraNome: "",
    transportadoraCotacao: "",
    transportadoraValor: "",
    modalEnvio: "",
    companhiaAerea: "",
    numeroAwb: "",
    codigoRastreio: "",
    status: STATUS_OPTIONS[0]!.value,
    dataCompraPO: "",
    dataEmbarque: "",
    aberturaThread: "",
    dataChegadaBrasil: "",
    registroRadar: "",
    registroDuimp: "",
    registroLpco: "",
    previsaoEntrega: "",
    supostaEstimativa: "",
    localEntrega: "",
    numeroProcesso: "",
    statusPagamento: "",
  };
}

function emptyMedicamento(): Medicamento {
  return { nome: "", dosagem: "", quantidade: "" };
}

export interface UseProcessoFormReturn {
  form: FormState;
  medicamentos: Medicamento[];
  pendencias: string[];
  fornecedor: ReturnType<typeof useOutroSentinel>;
  showDespachanteTransportadora: ComputedRef<boolean>;
  addMedicamento: () => void;
  removeMedicamento: (index: number) => void;
  addPendencia: () => void;
  removePendencia: (index: number) => void;
  onPacienteInput: (event: Event) => void;
  onPastaInput: (event: Event) => void;
  onMedicamentoNomeInput: (index: number, event: Event) => void;
  onMedicamentoDosagemInput: (index: number, event: Event) => void;
  onMedicamentoQuantidadeInput: (index: number, event: Event) => void;
  onDataFieldInput: (field: DataField, event: Event) => void;
  validar: () => ValidarProcessoFormResult;
}

export function useProcessoForm(editingProcesso: () => Processo | null | undefined): UseProcessoFormReturn {
  const form = reactive<FormState>(emptyForm());
  const medicamentos = reactive<Medicamento[]>([emptyMedicamento()]);
  const pendencias = reactive<string[]>([]);
  const fornecedor = useOutroSentinel(FORNECEDORES_FIXOS);

  // Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier
  // Simples esconde os dois. Qualquer outro valor (vazio, ou o legado "Courier"
  // de registros migrados) cai no comportamento padrão de mostrar os campos —
  // nunca esconde dado já preenchido por causa de um valor que não reconhecemos.
  const showDespachanteTransportadora = computed(() => precisaDespachanteTransportadora(form.modalEnvio));

  function resetFormState(): void {
    Object.assign(form, emptyForm());
    medicamentos.splice(0, medicamentos.length, emptyMedicamento());
    pendencias.splice(0, pendencias.length);
    fornecedor.load(undefined);
  }

  function loadProcessoIntoForm(processo: Processo): void {
    form.paciente = processo.paciente;
    form.ordem = parseOrdemNumero(processo.ordem);
    form.pasta = processo.pasta;
    form.empresa = processo.empresa;
    form.consultor = processo.consultor;
    form.responsavelOperacional = processo.responsavelOperacional ?? "";
    form.despachante = processo.despachante ?? "";
    fornecedor.load(processo.fornecedor);
    form.transportadoraNome = processo.transportadoraNacional?.nome ?? "";
    form.transportadoraCotacao = processo.transportadoraNacional?.cotacao ?? "";
    form.transportadoraValor =
      processo.transportadoraNacional?.valor !== undefined ? String(processo.transportadoraNacional.valor) : "";
    form.modalEnvio = processo.modalEnvio ?? "";
    form.companhiaAerea = processo.companhiaAerea ?? "";
    form.numeroAwb = processo.numeroAwb ?? "";
    form.codigoRastreio = processo.codigoRastreio ?? "";
    form.status = processo.status;
    form.dataCompraPO = processo.datas.dataCompraPO ?? "";
    form.dataEmbarque = processo.datas.dataEmbarque ?? "";
    form.aberturaThread = processo.datas.aberturaThread ?? "";
    form.dataChegadaBrasil = processo.datas.dataChegadaBrasil ?? "";
    form.registroRadar = processo.datas.registroRadar ?? "";
    form.registroDuimp = processo.datas.registroDuimp ?? "";
    form.registroLpco = processo.datas.registroLpco ?? "";
    form.previsaoEntrega = processo.datas.previsaoEntrega ?? "";
    form.supostaEstimativa = processo.datas.supostaEstimativa ?? "";
    form.localEntrega = processo.localEntrega ?? "";
    form.numeroProcesso = processo.numeroProcesso ?? "";
    form.statusPagamento = processo.statusPagamento ?? "";

    const medicamentosSource = processo.medicamentos.length ? processo.medicamentos : [emptyMedicamento()];
    medicamentos.splice(0, medicamentos.length, ...medicamentosSource.map((item) => ({ ...item })));
    pendencias.splice(0, pendencias.length, ...processo.pendencias);
  }

  watch(
    editingProcesso,
    (processo) => {
      if (processo) {
        loadProcessoIntoForm(processo);
      } else {
        resetFormState();
      }
    },
    { immediate: true }
  );

  function addMedicamento(): void {
    medicamentos.push(emptyMedicamento());
  }

  function removeMedicamento(index: number): void {
    medicamentos.splice(index, 1);
  }

  function addPendencia(): void {
    pendencias.push("");
  }

  function removePendencia(index: number): void {
    pendencias.splice(index, 1);
  }

  const onPacienteInput = useTitleCaseInput((value) => {
    form.paciente = value;
  });

  function onPastaInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    form.pasta = maskPastaCode(target.value);
  }

  function onMedicamentoNomeInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.nome = target.value.toUpperCase();
  }

  function onMedicamentoDosagemInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.dosagem = target.value.toUpperCase();
  }

  function onMedicamentoQuantidadeInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.quantidade = target.value.toUpperCase();
  }

  function onDataFieldInput(field: DataField, event: Event): void {
    const target = event.target as HTMLInputElement;
    form[field] = maskDataDDMM(target.value);
  }

  function validar(): ValidarProcessoFormResult {
    return validarProcessoForm(form, medicamentos, pendencias, fornecedor.build());
  }

  return {
    form,
    medicamentos,
    pendencias,
    fornecedor,
    showDespachanteTransportadora,
    addMedicamento,
    removeMedicamento,
    addPendencia,
    removePendencia,
    onPacienteInput,
    onPastaInput,
    onMedicamentoNomeInput,
    onMedicamentoDosagemInput,
    onMedicamentoQuantidadeInput,
    onDataFieldInput,
    validar,
  };
}
