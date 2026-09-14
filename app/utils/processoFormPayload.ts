import type {
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  ProcessoDatas,
  ProcessoFormUpdatePayload,
  StatusPagamentoProcesso,
  StatusProcesso,
  TransportadoraNacional,
} from "#shared/types/processo";
import { formatOrdemLabel } from "./processoFormatters";

// Funções puras extraídas de ProcessoFormModal.vue (Round 9) — caracterizadas
// em tests/unit/processoFormPayload.spec.ts. Comportamento preservado
// exatamente como estava; nada foi corrigido aqui, mesmo onde algo pareça
// estranho (ver achados no relatório da extração).

// Mesmo shape do FormState de ProcessoFormModal.vue — declarado aqui (não
// importado do componente) pra este módulo não depender de Vue. O `form`
// reativo do componente já bate estruturalmente com esta interface.
export interface ProcessoFormState {
  paciente: string;
  ordem: string;
  pasta: string;
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso | "";
  responsavelOperacional: string;
  despachante: string;
  transportadoraNome: string;
  transportadoraCotacao: string;
  transportadoraValor: string;
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

// Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier
// Simples esconde os dois. Qualquer outro valor (vazio, ou o legado "Courier"
// de registros migrados) cai no comportamento padrão de mostrar os campos —
// nunca esconde dado já preenchido por causa de um valor que não reconhecemos.
export function precisaDespachanteTransportadora(modalEnvio: string): boolean {
  return modalEnvio !== "Courier Simples";
}

export function buildDatas(form: ProcessoFormState): ProcessoDatas {
  return {
    dataCompraPO: form.dataCompraPO.trim() || undefined,
    dataEmbarque: form.dataEmbarque.trim() || undefined,
    aberturaThread: form.aberturaThread.trim() || undefined,
    dataChegadaBrasil: form.dataChegadaBrasil.trim() || undefined,
    registroRadar: form.registroRadar.trim() || undefined,
    registroDuimp: form.registroDuimp.trim() || undefined,
    registroLpco: form.registroLpco.trim() || undefined,
    previsaoEntrega: form.previsaoEntrega.trim() || undefined,
    supostaEstimativa: form.supostaEstimativa.trim() || undefined,
  };
}

export function buildTransportadoraNacional(form: ProcessoFormState): TransportadoraNacional | undefined {
  if (!form.transportadoraNome.trim()) return undefined;
  return {
    nome: form.transportadoraNome.trim(),
    cotacao: form.transportadoraCotacao.trim() || undefined,
    // O input type="number" faz o Vue 3.4+ converter form.transportadoraValor pra
    // number em runtime mesmo o campo sendo tipado como string aqui — por isso
    // nunca confiamos no tipo declarado e sempre coagimos explicitamente com
    // Number() neste ponto de montagem do payload (mesmo tratamento usado em
    // PatientForm.vue pra remessas/qtd).
    valor: form.transportadoraValor === "" ? undefined : Number(form.transportadoraValor) || undefined,
  };
}

export function buildBasePayload(
  form: ProcessoFormState,
  medicamentos: Medicamento[],
  pendencias: string[],
  fornecedor: string,
): ProcessoFormUpdatePayload {
  return {
    paciente: form.paciente.trim(),
    ordem: formatOrdemLabel(form.ordem),
    pasta: form.pasta.trim(),
    empresa: form.empresa,
    consultor: form.consultor as ConsultorProcesso,
    responsavelOperacional: form.responsavelOperacional.trim() || undefined,
    despachante: form.despachante.trim() || undefined,
    fornecedor: fornecedor || undefined,
    transportadoraNacional: buildTransportadoraNacional(form),
    modalEnvio: form.modalEnvio || undefined,
    companhiaAerea: form.companhiaAerea.trim() || undefined,
    numeroAwb: form.numeroAwb.trim() || undefined,
    codigoRastreio: form.codigoRastreio.trim() || undefined,
    medicamentos: medicamentos
      .filter((item) => item.nome.trim() !== "")
      .map((item) => ({
        nome: item.nome.trim(),
        dosagem: item.dosagem?.trim() || undefined,
        quantidade: item.quantidade?.trim() || undefined,
      })),
    status: form.status,
    datas: buildDatas(form),
    localEntrega: form.localEntrega.trim() || undefined,
    numeroProcesso: form.numeroProcesso.trim() || undefined,
    pendencias: pendencias.map((p) => p.trim()).filter((p) => p !== ""),
    statusPagamento: form.statusPagamento || undefined,
  };
}

export type ValidarProcessoFormResult =
  | { valido: true; payload: ProcessoFormUpdatePayload }
  | { valido: false; erro: string };

// Validação de handleSubmit, reformulada como função pura: decide só
// valido/inválido + payload ou mensagem de erro. O componente decide o que
// fazer com o resultado (emitir "invalid", ou "update"/"submit" com o
// payload). Ordem de checagem preservada exatamente: paciente, pasta,
// consultor, e só então despachante/transportadora condicionados ao
// modalEnvio.
export function validarProcessoForm(
  form: ProcessoFormState,
  medicamentos: Medicamento[],
  pendencias: string[],
  fornecedor: string,
): ValidarProcessoFormResult {
  if (!form.paciente.trim()) {
    return { valido: false, erro: "Informe o nome do paciente." };
  }
  if (!form.pasta.trim()) {
    return { valido: false, erro: "Informe a pasta do processo." };
  }
  if (form.consultor === "") {
    return { valido: false, erro: "Selecione o consultor responsável." };
  }
  if (form.modalEnvio === "Air Cargo" || form.modalEnvio === "Courier Formal") {
    if (!form.despachante.trim()) {
      return { valido: false, erro: "Despachante é obrigatório para o modal de envio selecionado." };
    }
    if (!form.transportadoraNome.trim()) {
      return { valido: false, erro: "Transportadora é obrigatória para o modal de envio selecionado." };
    }
  }

  return { valido: true, payload: buildBasePayload(form, medicamentos, pendencias, fornecedor) };
}
