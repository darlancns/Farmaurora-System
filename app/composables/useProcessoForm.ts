import { computed, reactive, watch, type ComputedRef } from "vue";
import type {
  BrandMedicamento,
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  Processo,
  DirProtocoloProcesso,
  PagamentoTransportadoraProcesso,
  ProcessoFormPatchPayload,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "#shared/types/processo";
import {
  ciaAereaValidaParaModal,
  dirsDoModal,
  EMPRESAS_PROCESSO,
  FORNECEDORES_PROCESSO,
  ROTULOS_DIR_PROTOCOLO,
} from "#shared/constants/processos";
import {
  controleDirDoModal,
  mapearDirParaModal,
  padroesAoEntregar,
  transportadoraDoPagamento,
} from "#shared/utils/entregaPadroes";
import { capitalizarIniciais, lerMedicamento, normalizarLaboratorio } from "#shared/utils/laboratorio";
import { mascararNumeroPo } from "#shared/utils/numeroPo";
import { NUMERO_REMESSA_PADRAO } from "#shared/utils/numeroRemessa";
import { maskPastaCode } from "../utils/processoFormatters";
import {
  montarPatchDiferencial,
  precisaConfirmarEntrega as statusPrecisaConfirmarEntrega,
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
  numeroPo: string; // PO, já mascarado: PO26-10-0471 (ou vazio; incompleto não salva)
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
  // Datas completas ("AAAA-MM-DD" ou ""): colunas `date` (vazio vai como null no patch, NULL no banco).
  msAnexadoEm: string;
  prazoAnvisa: string;
  // Data de entrega ("AAAA-MM-DD" ou ""): sem campo na tela (etapa 4). Entra pelo modal de confirmação ao salvar um processo
  // que vira Entregue e segue no patch diferencial como as demais datas.
  dataEntrega: string;
  localEntrega: string;
  numeroProcesso: string;
  statusPagamento: StatusPagamentoProcesso | "";
  // Controles do Entregue ("" = não informado / limpar): ver controleEntregaAplicavel (processoFormPayload.ts).
  pagamentoTransportadora: PagamentoTransportadoraProcesso | "";
  dirProtocolo: DirProtocoloProcesso | "";
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
  | "supostaEstimativa"
  | "msAnexadoEm"
  | "prazoAnvisa"
  | "dataEntrega";

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
    msAnexadoEm: "",
    prazoAnvisa: "",
    dataEntrega: "",
    localEntrega: "",
    numeroProcesso: "",
    statusPagamento: "",
    pagamentoTransportadora: "",
    dirProtocolo: "",
  };
}

function emptyMedicamento(): Medicamento {
  // O formulário não cria mais dosagem (o campo saiu da tela); a de um item existente continua no objeto e é preservada.
  return { nome: "", quantidade: "", laboratorio: "", brand: "" };
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
  onMedicamentoLaboratorioInput: (index: number, event: Event) => void;
  onMedicamentoLaboratorioBlur: (index: number) => void;
  onMedicamentoBrandChange: (index: number, brand: BrandMedicamento | "") => void;
  onDataFieldChange: (field: DataField, value: string) => void;
  // Selects do Entregue (só com status Entregue e quando o envio/transportadora os comportam).
  mostrarPagamentoTransportadora: ComputedRef<boolean>;
  pagamentoTransportadoraOptions: ComputedRef<AppSelectOption<PagamentoTransportadoraProcesso | "">[]>;
  mostrarDirProtocolo: ComputedRef<boolean>;
  dirProtocoloRotulo: ComputedRef<string>;
  dirProtocoloOptions: ComputedRef<AppSelectOption<DirProtocoloProcesso | "">[]>;
  // O USUÁRIO escolheu o status: ao virar Entregue preenche os padrões (só campo vazio); ao sair, desfaz os que ele mesmo pôs.
  onStatusChange: (status: StatusProcesso) => void;
  // Antes de enviar uma transição para Entregue: garante os padrões no que ainda está vazio (o que o servidor também faria).
  garantirPadroesEntrega: () => void;
  // Modal da data de entrega ao salvar: o Salvar o abre só na transição para Entregue (ver precisaConfirmarEntrega).
  precisaConfirmarEntrega: () => boolean;
  dataEntregaParaConfirmar: () => string;
  definirDataEntrega: (iso: string) => void;
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
    // DIR salvo que não vale para o novo envio (Courier Simples <-> Formal): mapeia mantendo pendente/concluído, para o
    // servidor não recusar (400). Fora do Courier o valor fica como está (oculto).
    if (form.dirProtocolo) {
      const anterior = form.dirProtocolo;
      const mapeado = mapearDirParaModal(anterior, modal) ?? "";
      form.dirProtocolo = mapeado;
      if (padroesAplicados.dir && padroesAplicados.dir.valor === anterior) padroesAplicados.dir.valor = mapeado;
    }
    if (ciaAereaValidaParaModal(modal, form.companhiaAerea)) return;
    form.companhiaAerea = "";
  }

  // ── Controles do Entregue ───────────────────────────────────────────────────────────────────────────
  // Pagamento da transportadora: só com status Entregue, envio que mostra a transportadora e nome AJC ou Doctor. As opções
  // levam o NOME ("AJC pendente" / "Doctor pago"); o valor é só pendente | pago. DIR e Protocolo: só com status Entregue e
  // envio Courier; Simples tem os 3 com protocolo, Formal só "Pegar DIR" e "DIR no Drive". "—" (vazio) limpa.
  const transportadoraDoNome = computed(() => transportadoraDoPagamento(form.transportadoraNome));
  const mostrarPagamentoTransportadora = computed(
    () => form.status === "entregue" && showDespachanteTransportadora.value && transportadoraDoNome.value !== null,
  );
  const pagamentoTransportadoraOptions = computed<AppSelectOption<PagamentoTransportadoraProcesso | "">[]>(() => {
    const nome = transportadoraDoNome.value ?? "";
    return [
      { value: "", label: "—" },
      { value: "pendente", label: `${nome} pendente` },
      { value: "pago", label: `${nome} pago` },
    ];
  });
  const mostrarDirProtocolo = computed(() => form.status === "entregue" && controleDirDoModal(form.modalEnvio) !== null);
  const dirProtocoloRotulo = computed(() => (controleDirDoModal(form.modalEnvio) === "formal" ? "DIR" : "DIR e Protocolo"));
  const dirProtocoloOptions = computed<AppSelectOption<DirProtocoloProcesso | "">[]>(() => [
    { value: "", label: "—" },
    ...dirsDoModal(form.modalEnvio).map((valor) => ({ value: valor, label: ROTULOS_DIR_PROTOCOLO[valor] })),
  ]);

  // Padrões que ESTE formulário pôs (e o valor de antes): ao tirar o Entregue sem ter mexido neles, voltam ao que eram.
  const padroesAplicados: {
    pagamento?: { antes: PagamentoTransportadoraProcesso | ""; valor: string };
    dir?: { antes: DirProtocoloProcesso | ""; valor: string };
  } = {};

  function aplicarPadroesNoFormulario(): void {
    const padroes = padroesAoEntregar({
      modalEnvio: form.modalEnvio || undefined,
      transportadoraNacional: form.transportadoraNome.trim() ? { nome: form.transportadoraNome.trim() } : undefined,
      pagamentoTransportadora: form.pagamentoTransportadora || undefined,
      dirProtocolo: form.dirProtocolo || undefined,
    });
    if (padroes.pagamentoTransportadora) {
      padroesAplicados.pagamento = { antes: form.pagamentoTransportadora, valor: padroes.pagamentoTransportadora };
      form.pagamentoTransportadora = padroes.pagamentoTransportadora;
    }
    if (padroes.dirProtocolo) {
      padroesAplicados.dir = { antes: form.dirProtocolo, valor: padroes.dirProtocolo };
      form.dirProtocolo = padroes.dirProtocolo;
    }
  }

  function desfazerPadroesAplicados(): void {
    if (padroesAplicados.pagamento && form.pagamentoTransportadora === padroesAplicados.pagamento.valor) {
      form.pagamentoTransportadora = padroesAplicados.pagamento.antes;
    }
    if (padroesAplicados.dir && form.dirProtocolo === padroesAplicados.dir.valor) {
      form.dirProtocolo = padroesAplicados.dir.antes;
    }
    delete padroesAplicados.pagamento;
    delete padroesAplicados.dir;
  }

  function onStatusChange(status: StatusProcesso): void {
    const anterior = form.status;
    form.status = status;
    if (status === "entregue" && anterior !== "entregue") aplicarPadroesNoFormulario();
    else if (status !== "entregue" && anterior === "entregue") desfazerPadroesAplicados();
  }

  function garantirPadroesEntrega(): void {
    if (form.status === "entregue") aplicarPadroesNoFormulario();
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
    delete padroesAplicados.pagamento;
    delete padroesAplicados.dir;
  }

  function loadProcessoIntoForm(processo: Processo): void {
    form.paciente = processo.paciente;
    form.numeroRemessa = String(processo.numeroRemessa ?? NUMERO_REMESSA_PADRAO);
    form.numeroPo = processo.numeroPo ?? "";
    form.pasta = (processo.pasta ?? "").trim(); // opcional: "" = sem pasta; null de linha antiga não quebra
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
    form.msAnexadoEm = processo.datas.msAnexadoEm ?? "";
    form.prazoAnvisa = processo.datas.prazoAnvisa ?? "";
    form.dataEntrega = processo.datas.dataEntrega ?? "";
    form.localEntrega = processo.localEntrega ?? "";
    form.numeroProcesso = processo.numeroProcesso ?? "";
    form.statusPagamento = processo.statusPagamento ?? "";
    // Carregar NUNCA preenche padrão: Entregue antigo (sem valor) abre com os selects em branco.
    form.pagamentoTransportadora = processo.pagamentoTransportadora ?? "";
    form.dirProtocolo = processo.dirProtocolo ?? "";

    const medicamentosSource = processo.medicamentos.length ? processo.medicamentos : [emptyMedicamento()];
    // lerMedicamento: item antigo sem laboratório/brand entra com "" (as outras chaves ficam como estão).
    medicamentos.splice(0, medicamentos.length, ...medicamentosSource.map((item) => lerMedicamento({ ...item })));
    pendencias.splice(0, pendencias.length, ...processo.pendencias);

    inicial = estadoAtual();
    versaoAbertura = processo.updatedAt;
    delete padroesAplicados.pagamento;
    delete padroesAplicados.dir;
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

  // PO: a máscara cuida do prefixo, dos números, dos hífens e das MAIÚSCULAS (PO26-10-0471); só o PO completo (ou vazio) salva. O input leva
  // data-sem-maiuscula: o plugin global só capitaliza a 1ª letra e disputaria o valor). Roda em todo "input",
  // inclusive colar. O valor mascarado é escrito de volta no campo, com o cursor no lugar certo (nada de
  // pular para o fim ao digitar/apagar no meio).
  function onNumeroPoInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const { valor, cursor } = mascararNumeroPo(target.value, {
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

  // Laboratório (o campo leva data-sem-maiuscula: o plugin global, que só mexe na 1ª letra do texto, fica de fora).
  // Ao DIGITAR (input e fim de composição): a 1ª letra de cada palavra vira maiúscula e o resto fica como foi digitado
  // (capitalizarIniciais: sem trim, sem juntar espaços). O núcleo nunca muda o tamanho do texto, então a seleção/cursor
  // salva antes é reaplicada no mesmo lugar (digitar ou colar no começo, no meio ou no fim não faz o cursor pular).
  // Durante uma composição (IME, acento "morto", teclado de celular que compõe a palavra) o valor não é tocado: a regra
  // roda no `compositionend`. Ao SAIR do campo: normalização completa (normalizarLaboratorio), a mesma do payload e do
  // servidor.
  function onMedicamentoLaboratorioInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    if (event.type === "input" && (event as InputEvent).isComposing) {
      item.laboratorio = target.value;
      return;
    }
    const capitalizado = capitalizarIniciais(target.value);
    if (capitalizado !== target.value) {
      const inicio = target.selectionStart;
      const fim = target.selectionEnd;
      const direcao = target.selectionDirection ?? undefined;
      target.value = capitalizado;
      if (inicio !== null && fim !== null) {
        try {
          target.setSelectionRange(inicio, fim, direcao);
        } catch {
          // campo sem seleção (fora do DOM): nada a restaurar
        }
      }
    }
    item.laboratorio = capitalizado;
  }

  function onMedicamentoLaboratorioBlur(index: number): void {
    const item = medicamentos[index];
    if (!item) return;
    item.laboratorio = normalizarLaboratorio(item.laboratorio);
  }

  function onMedicamentoBrandChange(index: number, brand: BrandMedicamento | ""): void {
    const item = medicamentos[index];
    if (!item) return;
    item.brand = brand;
  }

  // As datas vêm do AppDatePicker com ano automático (digitadas ou do calendário): valor novo "DD/MM/AAAA" ou ""
  // (limpar); MS Anexado em e Prazo da ANVISA vêm como "AAAA-MM-DD" (formato iso). A máscara e o ano ficam no componente; o texto antigo só muda depois de confirmado no painel.
  function onDataFieldChange(field: DataField, value: string): void {
    form[field] = value;
  }

  // O status ORIGINAL é o do estado carregado (edição); na criação não há original (`inicial` nulo) e Entregue sempre confirma.
  function precisaConfirmarEntrega(): boolean {
    return statusPrecisaConfirmarEntrega(inicial?.form.status, form.status);
  }

  function dataEntregaParaConfirmar(): string {
    return form.dataEntrega;
  }

  function definirDataEntrega(iso: string): void {
    form.dataEntrega = iso;
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
    onMedicamentoLaboratorioInput,
    onMedicamentoLaboratorioBlur,
    onMedicamentoBrandChange,
    onDataFieldChange,
    mostrarPagamentoTransportadora,
    pagamentoTransportadoraOptions,
    mostrarDirProtocolo,
    dirProtocoloRotulo,
    dirProtocoloOptions,
    onStatusChange,
    garantirPadroesEntrega,
    precisaConfirmarEntrega,
    dataEntregaParaConfirmar,
    definirDataEntrega,
    validar,
    validarEdicao,
  };
}
