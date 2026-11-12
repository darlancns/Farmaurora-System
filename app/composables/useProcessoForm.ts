import { computed, reactive, watch, type ComputedRef } from "vue";
import type {
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  Processo,
  ProcessoFormPatchPayload,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "#shared/types/processo";
import { ciaAereaValidaParaModal, EMPRESAS_PROCESSO, FORNECEDORES_PROCESSO } from "#shared/constants/processos";
import { mascararNumeroOrdem } from "#shared/utils/numeroOrdem";
import { NUMERO_REMESSA_PADRAO } from "#shared/utils/numeroRemessa";
import { maskPastaCode } from "../utils/processoFormatters";
import {
  montarPatchDiferencial,
  precisaDespachanteTransportadora,
  validarProcessoForm,
  type EstadoEdicao,
  type ValidarProcessoFormResult,
} from "../utils/processoFormPayload";
import { useOutroSentinel } from "./useOutroSentinel";
import { useTitleCaseInput } from "./useTitleCaseInput";
import { montarCiaAereaOptions, STATUS_OPTIONS } from "../utils/processoOptions";
import type { AppSelectOption } from "../types/appSelect";

// Extraído de ProcessoFormModal.vue (Round 9, Parte 2) — todo o estado do
// formulário de Processo, os handlers de input, e o wiring com
// validarProcessoForm/precisaDespachanteTransportadora (extraídos na Parte 1,
// consumidos aqui, não duplicados). Comportamento preservado exatamente como
// estava.

export interface FormState {
  paciente: string;
  numeroRemessa: string; // Nº Remessa: só dígitos (ex.: "2"); novo processo começa em "1"; vazio ao salvar vale 1
  numeroPo: string; // Nº Ordem (PO), já mascarado: PO-00-0000[/números]
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
    numeroRemessa: String(NUMERO_REMESSA_PADRAO),
    numeroPo: "",
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
  // O formulário não cria mais dosagem (o campo saiu da tela); a de um item existente continua no objeto e é preservada.
  return { nome: "", quantidade: "" };
}

// Resultado de salvar uma EDIÇÃO: inválido (mensagem), ou válido com o patch diferencial — `null` quando
// o usuário não alterou nada (não há o que gravar).
export type ValidarEdicaoResult =
  | { valido: true; patch: ProcessoFormPatchPayload | null }
  | { valido: false; erro: string };

export interface UseProcessoFormReturn {
  form: FormState;
  medicamentos: Medicamento[];
  pendencias: string[];
  fornecedor: ReturnType<typeof useOutroSentinel>;
  showDespachanteTransportadora: ComputedRef<boolean>;
  // Cia. aérea depende do modal: opções, desabilitado sem modal e limpeza automática ao trocar o modal.
  ciaAereaOptions: ComputedRef<AppSelectOption<string>[]>;
  ciaAereaDesabilitada: ComputedRef<boolean>;
  onModalEnvioChange: (modal: string) => void;
  onCiaAereaChange: (cia: string) => void;
  addMedicamento: () => void;
  removeMedicamento: (index: number) => void;
  addPendencia: () => void;
  removePendencia: (index: number) => void;
  onPacienteInput: (event: Event) => void;
  onPastaInput: (event: Event) => void;
  onNumeroPoInput: (event: Event) => void;
  onMedicamentoNomeInput: (index: number, event: Event) => void;
  onMedicamentoQuantidadeInput: (index: number, event: Event) => void;
  onDataFieldChange: (field: DataField, value: string) => void;
  validar: () => ValidarProcessoFormResult;
  validarEdicao: () => ValidarEdicaoResult;
}

export function useProcessoForm(editingProcesso: () => Processo | null | undefined): UseProcessoFormReturn {
  const form = reactive<FormState>(emptyForm());
  const medicamentos = reactive<Medicamento[]>([emptyMedicamento()]);
  const pendencias = reactive<string[]>([]);
  const fornecedor = useOutroSentinel(FORNECEDORES_FIXOS);
  // Estado do formulário logo depois de carregar o processo (só na edição): base do patch diferencial.
  let inicial: EstadoEdicao | null = null;
  // updatedAt do processo no instante em que o formulário o carregou (abertura, ou "Recarregar dados atuais").
  // NUNCA o da lista de agora: é a versão que ESTA pessoa viu, contra a qual o servidor confere a gravação.
  let versaoAbertura: string | undefined;

  function estadoAtual(): EstadoEdicao {
    return {
      form: { ...form },
      medicamentos: medicamentos.map((m) => ({ ...m })),
      pendencias: [...pendencias],
      fornecedor: fornecedor.build(),
    };
  }

  // Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier
  // Simples esconde os dois. Qualquer outro valor (vazio, ou o legado "Courier"
  // de registros migrados) cai no comportamento padrão de mostrar os campos —
  // nunca esconde dado já preenchido por causa de um valor que não reconhecemos.
  const showDespachanteTransportadora = computed(() => precisaDespachanteTransportadora(form.modalEnvio));

  // Cia. aérea: opções do modal atual (+ valor antigo fora da lista, se for o caso). Sem modal, desabilitada.
  const ciaAereaOptions = computed(() => montarCiaAereaOptions(form.modalEnvio, form.companhiaAerea));
  const ciaAereaDesabilitada = computed(() => form.modalEnvio.trim() === "");

  // O USUÁRIO trocou o modal: se a cia atual não vale para o novo, ela é limpa (vira null no patch);
  // se continua válida, é mantida. Só o handler (não carregar/resetar o form) dispara isso.
  function onModalEnvioChange(modal: string): void {
    form.modalEnvio = modal;
    if (ciaAereaValidaParaModal(modal, form.companhiaAerea)) return;
    form.companhiaAerea = "";
  }

  function onCiaAereaChange(cia: string): void {
    form.companhiaAerea = cia;
  }

  function resetFormState(): void {
    Object.assign(form, emptyForm());
    medicamentos.splice(0, medicamentos.length, emptyMedicamento());
    pendencias.splice(0, pendencias.length);
    fornecedor.load(undefined);
    inicial = null;
    versaoAbertura = undefined;
  }

  function loadProcessoIntoForm(processo: Processo): void {
    form.paciente = processo.paciente;
    form.numeroRemessa = String(processo.numeroRemessa ?? NUMERO_REMESSA_PADRAO);
    form.numeroPo = processo.numeroPo ?? "";
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

    inicial = estadoAtual();
    versaoAbertura = processo.updatedAt;
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

  // Nº Ordem: a máscara cuida do prefixo, dos números, da barra e das MAIÚSCULAS. Incompleto salva normalmente. O input leva
  // data-sem-maiuscula: o plugin global só capitaliza a 1ª letra e disputaria o valor). Roda em todo "input",
  // inclusive colar. O valor mascarado é escrito de volta no campo, com o cursor no lugar certo (nada de
  // pular para o fim ao digitar/apagar no meio).
  function onNumeroPoInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const { valor, cursor } = mascararNumeroOrdem(target.value, {
      anterior: form.numeroPo,
      cursor: target.selectionStart,
    });
    form.numeroPo = valor;
    if (target.value !== valor) target.value = valor;
    try {
      target.setSelectionRange(cursor, cursor);
    } catch {
      // sem seleção (campo fora do DOM): nada a restaurar
    }
  }

  function onMedicamentoNomeInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.nome = target.value.toUpperCase();
  }

  function onMedicamentoQuantidadeInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.quantidade = target.value.toUpperCase();
  }

  // As datas vêm do calendário (AppDatePicker): "DD/MM", "DD/MM/AAAA" ou "" (limpar). O campo não é
  // digitável, então não há máscara; o texto antigo que já existe só muda depois de confirmado no painel.
  function onDataFieldChange(field: DataField, value: string): void {
    form[field] = value;
  }

  function validar(): ValidarProcessoFormResult {
    // Edição: compara com o estado carregado. Criação: com o formulário vazio (tudo que o usuário
    // digitou conta como alterado).
    return validarProcessoForm(form, medicamentos, pendencias, fornecedor.build(), inicial?.form ?? emptyForm());
  }

  // Edição: valida o formulário inteiro (as mesmas regras de sempre) e monta o patch só com o que mudou.
  function validarEdicao(): ValidarEdicaoResult {
    const resultado = validar();
    if (!resultado.valido) return resultado;
    if (!inicial) return { valido: true, patch: null };
    return { valido: true, patch: montarPatchDiferencial(inicial, estadoAtual(), versaoAbertura) };
  }

  return {
    form,
    medicamentos,
    pendencias,
    fornecedor,
    showDespachanteTransportadora,
    ciaAereaOptions,
    ciaAereaDesabilitada,
    onModalEnvioChange,
    onCiaAereaChange,
    addMedicamento,
    removeMedicamento,
    addPendencia,
    removePendencia,
    onPacienteInput,
    onPastaInput,
    onNumeroPoInput,
    onMedicamentoNomeInput,
    onMedicamentoQuantidadeInput,
    onDataFieldChange,
    validar,
    validarEdicao,
  };
}
