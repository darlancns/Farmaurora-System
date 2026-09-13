import { reactive, computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { ConsultorNome, MedicamentoItem, NewPatientDTO, Patient } from "#shared/types/Patient";
import {
  formatCurrency,
  maskCurrencyDigits,
  maskDateDdMm,
  normalizeCurrencyInput,
  parseBrCurrency,
} from "../utils/formatters";
import {
  buildDescricaoCompra,
  buildDescricaoResumo,
  countFilled,
  resizeArray,
  sumFilledValues,
} from "../utils/patientFormCalculations";
import { useTitleCaseInput } from "./useTitleCaseInput";

export interface FormState {
  data: string;
  paciente: string;
  consultor: ConsultorNome | "";
  alvara: string;
  custoImportacao: string;
  remessas: string;
}

type CurrencyField = "alvara" | "custoImportacao";

function emptyForm(): FormState {
  return {
    data: "",
    paciente: "",
    consultor: "",
    alvara: "",
    custoImportacao: "",
    remessas: "1",
  };
}

function emptyMedicamentoItem(): MedicamentoItem {
  return { qtd: "", medicamento: "" };
}

export interface ReducaoRemessasPendente {
  novoCount: number;
  remessasAfetadas: number[]; // 1-based, pra exibir ao usuário
}

export interface UsePatientFormOptions {
  editingPatient: () => Patient | null | undefined;
  onSubmit: (payload: NewPatientDTO) => void;
  onUpdate: (id: string, payload: NewPatientDTO) => void;
  onInvalid: (message: string) => void;
}

export interface UsePatientFormReturn {
  form: FormState;
  medicamentos: MedicamentoItem[];
  despesasPorRemessa: string[];
  transportesPorRemessa: string[];
  reducaoRemessasPendente: Ref<ReducaoRemessasPendente | null>;
  mensagemReducaoRemessas: ComputedRef<string>;
  confirmarReducaoRemessas: () => void;
  cancelarReducaoRemessas: () => void;
  addMedicamentoItem: () => void;
  removeMedicamentoItem: (index: number) => void;
  resetFormState: () => void;
  onDataInput: (event: Event) => void;
  onPacienteInput: (event: Event) => void;
  onMedicamentoInput: (index: number, event: Event) => void;
  onCurrencyInput: (field: CurrencyField, event: Event) => void;
  onCurrencyPaste: (field: CurrencyField, event: ClipboardEvent) => void;
  onDespesaInput: (index: number, event: Event) => void;
  onDespesaPaste: (index: number, event: ClipboardEvent) => void;
  onTransporteInput: (index: number, event: Event) => void;
  onTransportePaste: (index: number, event: ClipboardEvent) => void;
  handleSubmit: () => void;
}

export function usePatientForm(options: UsePatientFormOptions): UsePatientFormReturn {
  const form = reactive<FormState>(emptyForm());
  const medicamentos = reactive<MedicamentoItem[]>([emptyMedicamentoItem()]);

  const despesasPorRemessa = reactive<string[]>([""]);
  const transportesPorRemessa = reactive<string[]>([""]);

  // Quantas remessas estão de fato refletidas em despesasPorRemessa/
  // transportesPorRemessa agora — só muda quando o resize é realmente aplicado
  // (direto, ou após confirmação). Junto com remessasCampoAnterior, permite
  // reverter o campo "Remessas" se o usuário cancelar uma redução destrutiva.
  let remessasAplicadas = despesasPorRemessa.length;
  let remessasCampoAnterior = form.remessas;

  const reducaoRemessasPendente = ref<ReducaoRemessasPendente | null>(null);

  const mensagemReducaoRemessas = computed(() => {
    const alvo = reducaoRemessasPendente.value;
    if (!alvo) return "";
    const plural = alvo.remessasAfetadas.length > 1;
    const lista = alvo.remessasAfetadas.join(", ");
    return `Reduzir para ${alvo.novoCount} remessas vai apagar os valores de despachante/transporte já preenchidos na${plural ? "s" : ""} remessa${plural ? "s" : ""} ${lista}. Deseja continuar?`;
  });

  function aplicarResizeRemessas(count: number): void {
    resizeArray(despesasPorRemessa, count);
    resizeArray(transportesPorRemessa, count);
    remessasAplicadas = count;
    remessasCampoAnterior = form.remessas;
  }

  function confirmarReducaoRemessas(): void {
    const alvo = reducaoRemessasPendente.value;
    if (!alvo) return;
    aplicarResizeRemessas(alvo.novoCount);
    reducaoRemessasPendente.value = null;
  }

  function cancelarReducaoRemessas(): void {
    reducaoRemessasPendente.value = null;
    form.remessas = remessasCampoAnterior;
  }

  watch(
    () => Math.max(1, Number(form.remessas) || 1),
    (count) => {
      if (count >= remessasAplicadas) {
        aplicarResizeRemessas(count);
        return;
      }
      // Encolhendo: alguma posição além do novo tamanho, em qualquer um dos dois
      // arrays, tem valor preenchido? Se sim, pausa e pergunta antes de truncar.
      const afetadas: number[] = [];
      for (let i = count; i < remessasAplicadas; i++) {
        const temDespesa = parseBrCurrency(despesasPorRemessa[i] ?? "") > 0;
        const temTransporte = parseBrCurrency(transportesPorRemessa[i] ?? "") > 0;
        if (temDespesa || temTransporte) afetadas.push(i + 1);
      }
      if (!afetadas.length) {
        aplicarResizeRemessas(count);
        return;
      }
      reducaoRemessasPendente.value = { novoCount: count, remessasAfetadas: afetadas };
    },
    { immediate: true }
  );

  function addMedicamentoItem(): void {
    medicamentos.push(emptyMedicamentoItem());
  }

  function removeMedicamentoItem(index: number): void {
    medicamentos.splice(index, 1);
  }

  function resetFormState(): void {
    Object.assign(form, emptyForm());
    medicamentos.splice(0, medicamentos.length, emptyMedicamentoItem());
    despesasPorRemessa.splice(0, despesasPorRemessa.length, "");
    transportesPorRemessa.splice(0, transportesPorRemessa.length, "");
  }

  function loadPatientIntoForm(patient: Patient): void {
    form.data = patient.data;
    form.paciente = patient.paciente;
    form.consultor = patient.consultor ?? "";
    form.alvara = formatCurrency(patient.alvara);
    form.custoImportacao = formatCurrency(patient.custoImportacao);

    const medicamentosSource = patient.medicamentos?.length ? patient.medicamentos : [emptyMedicamentoItem()];
    medicamentos.splice(0, medicamentos.length, ...medicamentosSource.map((item) => ({ ...item })));

    const remessaCount = Math.max(1, patient.remessas);
    const nextDespesas = patient.despesasPorRemessa?.length ? [...patient.despesasPorRemessa] : [""];
    const nextTransportes = patient.transportesPorRemessa?.length ? [...patient.transportesPorRemessa] : [""];
    resizeArray(nextDespesas, remessaCount);
    resizeArray(nextTransportes, remessaCount);
    despesasPorRemessa.splice(0, despesasPorRemessa.length, ...nextDespesas);
    transportesPorRemessa.splice(0, transportesPorRemessa.length, ...nextTransportes);

    form.remessas = String(patient.remessas);
  }

  watch(
    options.editingPatient,
    (patient) => {
      if (patient) {
        loadPatientIntoForm(patient);
      } else {
        resetFormState();
      }
    },
    { immediate: true }
  );

  function onDataInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    form.data = maskDateDdMm(target.value);
  }

  const onPacienteInput = useTitleCaseInput((value) => {
    form.paciente = value;
  });

  function onMedicamentoInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const item = medicamentos[index];
    if (!item) return;
    item.medicamento = target.value.toUpperCase();
  }

  function pastedText(event: ClipboardEvent): string {
    return event.clipboardData?.getData("text") ?? "";
  }

  function onCurrencyInput(field: CurrencyField, event: Event): void {
    const target = event.target as HTMLInputElement;
    form[field] = maskCurrencyDigits(target.value);
  }

  function onCurrencyPaste(field: CurrencyField, event: ClipboardEvent): void {
    event.preventDefault();
    form[field] = normalizeCurrencyInput(pastedText(event));
  }

  function onDespesaInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    despesasPorRemessa[index] = maskCurrencyDigits(target.value);
  }

  function onDespesaPaste(index: number, event: ClipboardEvent): void {
    event.preventDefault();
    despesasPorRemessa[index] = normalizeCurrencyInput(pastedText(event));
  }

  function onTransporteInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    transportesPorRemessa[index] = maskCurrencyDigits(target.value);
  }

  function onTransportePaste(index: number, event: ClipboardEvent): void {
    event.preventDefault();
    transportesPorRemessa[index] = normalizeCurrencyInput(pastedText(event));
  }

  function handleSubmit(): void {
    if (!form.paciente.trim()) {
      options.onInvalid("Informe o nome do paciente.");
      return;
    }
    if (form.alvara === "" || form.custoImportacao === "") {
      options.onInvalid("Informe os valores de alvará e custo de importação.");
      return;
    }
    const consultor: ConsultorNome | "" = form.consultor;

    const descricaoCompra = buildDescricaoCompra(medicamentos);
    const descricaoResumo = buildDescricaoResumo(medicamentos);
    if (!descricaoCompra) {
      options.onInvalid("Informe ao menos um medicamento.");
      return;
    }

    const payload: NewPatientDTO = {
      data: form.data.trim(),
      paciente: form.paciente.trim(),
      descricaoCompra,
      descricaoResumo,
      medicamentos: medicamentos
        .filter((item) => Number(item.qtd) > 0 && item.medicamento.trim() !== "")
        .map((item) => ({ qtd: String(item.qtd), medicamento: item.medicamento })),
      empresa: "FARMAURORA",
      consultor,
      alvara: parseBrCurrency(form.alvara),
      custoImportacao: parseBrCurrency(form.custoImportacao),
      despesaTotal: sumFilledValues(despesasPorRemessa),
      transporteTotal: sumFilledValues(transportesPorRemessa),
      despachanteRemessas: countFilled(despesasPorRemessa),
      transporteRemessas: countFilled(transportesPorRemessa),
      despesasPorRemessa: [...despesasPorRemessa],
      transportesPorRemessa: [...transportesPorRemessa],
      remessas: Number(form.remessas) || 1,
    };

    const editingPatient = options.editingPatient();
    if (editingPatient) {
      options.onUpdate(editingPatient.id, payload);
      return;
    }

    options.onSubmit(payload);
  }

  return {
    form,
    medicamentos,
    despesasPorRemessa,
    transportesPorRemessa,
    reducaoRemessasPendente,
    mensagemReducaoRemessas,
    confirmarReducaoRemessas,
    cancelarReducaoRemessas,
    addMedicamentoItem,
    removeMedicamentoItem,
    resetFormState,
    onDataInput,
    onPacienteInput,
    onMedicamentoInput,
    onCurrencyInput,
    onCurrencyPaste,
    onDespesaInput,
    onDespesaPaste,
    onTransporteInput,
    onTransportePaste,
    handleSubmit,
  };
}
