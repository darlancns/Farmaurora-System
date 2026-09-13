<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type {
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  NewProcessoDTO,
  Processo,
  ProcessoFormUpdatePayload,
  StatusPagamentoProcesso,
  StatusProcesso,
} from "#shared/types/processo";
import { EMPRESAS_PROCESSO, FORNECEDORES_PROCESSO } from "#shared/constants/processos";
import { formatOrdemLabel, maskDataDDMM, maskPastaCode, parseOrdemNumero } from "../../utils/processoFormatters";
import { useTitleCaseInput } from "../../composables/useTitleCaseInput";
import { useOutroSentinel } from "../../composables/useOutroSentinel";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import {
  CONSULTOR_OPTIONS,
  DESPACHANTE_OPTIONS,
  EMPRESA_OPTIONS,
  FORNECEDOR_OPTIONS,
  MODAL_ENVIO_OPTIONS,
  RESPONSAVEL_OPTIONS,
  STATUS_OPTIONS,
  STATUS_PAGAMENTO_OPTIONS,
} from "../../utils/processoOptions";

const props = defineProps<{
  editingProcesso?: Processo | null;
}>();

const emit = defineEmits<{
  submit: [payload: NewProcessoDTO];
  update: [id: string, payload: ProcessoFormUpdatePayload];
  close: [];
  invalid: [message: string];
}>();

// Opções fixas do Fornecedor, sem o sentinela "Outro" — usado só pra decidir se
// um valor existente bate com uma das 4 opções reais ao carregar o form.
const FORNECEDORES_FIXOS = FORNECEDORES_PROCESSO.filter((f) => f !== "Outro");

interface FormState {
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
  transportadoraValor: string; // ver nota sobre o bug de type="number" mais abaixo
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

const form = reactive<FormState>(emptyForm());
const medicamentos = reactive<Medicamento[]>([emptyMedicamento()]);
const pendencias = reactive<string[]>([]);
const fornecedor = useOutroSentinel(FORNECEDORES_FIXOS);

// Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier
// Simples esconde os dois. Qualquer outro valor (vazio, ou o legado "Courier"
// de registros migrados) cai no comportamento padrão de mostrar os campos —
// nunca esconde dado já preenchido por causa de um valor que não reconhecemos.
const showDespachanteTransportadora = computed(() => form.modalEnvio !== "Courier Simples");

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
  () => props.editingProcesso,
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

type DataField =
  | "dataCompraPO"
  | "dataEmbarque"
  | "aberturaThread"
  | "dataChegadaBrasil"
  | "registroRadar"
  | "registroDuimp"
  | "registroLpco"
  | "previsaoEntrega"
  | "supostaEstimativa";

function onDataFieldInput(field: DataField, event: Event): void {
  const target = event.target as HTMLInputElement;
  form[field] = maskDataDDMM(target.value);
}

function buildDatas() {
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

function buildTransportadoraNacional() {
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

function buildBasePayload(): Omit<NewProcessoDTO, "atualizacoes"> {
  return {
    paciente: form.paciente.trim(),
    ordem: formatOrdemLabel(form.ordem),
    pasta: form.pasta.trim(),
    empresa: form.empresa,
    consultor: form.consultor as ConsultorProcesso,
    responsavelOperacional: form.responsavelOperacional.trim() || undefined,
    despachante: form.despachante.trim() || undefined,
    fornecedor: fornecedor.build() || undefined,
    transportadoraNacional: buildTransportadoraNacional(),
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
    datas: buildDatas(),
    localEntrega: form.localEntrega.trim() || undefined,
    numeroProcesso: form.numeroProcesso.trim() || undefined,
    pendencias: pendencias.map((p) => p.trim()).filter((p) => p !== ""),
    statusPagamento: form.statusPagamento || undefined,
  };
}

function handleSubmit(): void {
  if (!form.paciente.trim()) {
    emit("invalid", "Informe o nome do paciente.");
    return;
  }
  if (!form.pasta.trim()) {
    emit("invalid", "Informe a pasta do processo.");
    return;
  }
  if (form.consultor === "") {
    emit("invalid", "Selecione o consultor responsável.");
    return;
  }
  if (form.modalEnvio === "Air Cargo" || form.modalEnvio === "Courier Formal") {
    if (!form.despachante.trim()) {
      emit("invalid", "Despachante é obrigatório para o modal de envio selecionado.");
      return;
    }
    if (!form.transportadoraNome.trim()) {
      emit("invalid", "Transportadora é obrigatória para o modal de envio selecionado.");
      return;
    }
  }

  const basePayload = buildBasePayload();

  if (props.editingProcesso) {
    emit("update", props.editingProcesso.id, basePayload);
    return;
  }

  emit("submit", { ...basePayload, atualizacoes: [] });
}
</script>

<template>
  <BaseModal id="processo-form-modal-overlay" @close="emit('close')">
    <div class="flex max-h-[90vh] w-full max-w-[720px] flex-col rounded-[10px] border border-hairline bg-paper-raised">
      <div class="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div>
          <p class="mb-1 font-mono text-[11px] tracking-wider text-accent-dark uppercase">Processo</p>
          <h2 class="font-display text-[18px] font-semibold text-ink">
            {{ editingProcesso ? "Editar processo" : "Novo processo" }}
          </h2>
        </div>
        <button
          id="btn-close-processo-form"
          type="button"
          title="Fechar"
          class="rounded-md px-2 py-1 text-ink-soft transition-colors hover:text-danger"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <form id="processo-form" class="flex flex-col gap-3.5 overflow-y-auto p-5" @submit.prevent="handleSubmit">
        <div class="grid grid-cols-3 gap-2.5">
          <div class="col-span-2">
            <label for="pf-paciente" class="mb-1.5 block text-[10.5px] text-ink-soft">Paciente</label>
            <input
              id="pf-paciente"
              :value="form.paciente"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
              @input="onPacienteInput"
            />
          </div>
          <div>
            <label for="pf-pasta" class="mb-1.5 block text-[10.5px] text-ink-soft">Pasta</label>
            <input
              id="pf-pasta"
              :value="form.pasta"
              type="text"
              inputmode="numeric"
              placeholder="2026 - 234"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
              @input="onPastaInput"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2.5">
          <div>
            <label for="pf-ordem" class="mb-1.5 block text-[10.5px] text-ink-soft">Ordem</label>
            <input
              id="pf-ordem"
              v-model="form.ordem"
              type="number"
              min="1"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
          <div>
            <label for="pf-empresa" class="mb-1.5 block text-[10.5px] text-ink-soft">Empresa</label>
            <AppSelect id="pf-empresa" v-model="form.empresa" :options="EMPRESA_OPTIONS" />
          </div>
          <div>
            <label for="pf-consultor" class="mb-1.5 block text-[10.5px] text-ink-soft">Consultor</label>
            <AppSelect id="pf-consultor" v-model="form.consultor" :options="CONSULTOR_OPTIONS" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2.5">
          <div>
            <label for="pf-status" class="mb-1.5 block text-[10.5px] text-ink-soft">Status</label>
            <AppSelect id="pf-status" v-model="form.status" :options="STATUS_OPTIONS" />
          </div>
          <div>
            <label for="pf-responsavel" class="mb-1.5 block text-[10.5px] text-ink-soft">Responsável</label>
            <AppSelect id="pf-responsavel" v-model="form.responsavelOperacional" :options="RESPONSAVEL_OPTIONS" />
          </div>
          <div>
            <label for="pf-status-pagamento" class="mb-1.5 block text-[10.5px] text-ink-soft">Pagamento</label>
            <AppSelect id="pf-status-pagamento" v-model="form.statusPagamento" :options="STATUS_PAGAMENTO_OPTIONS" />
          </div>
        </div>

        <div class="grid gap-2.5" :class="showDespachanteTransportadora ? 'grid-cols-3' : 'grid-cols-2'">
          <div v-if="showDespachanteTransportadora">
            <label for="pf-despachante" class="mb-1.5 block text-[10.5px] text-ink-soft">Despachante</label>
            <AppSelect id="pf-despachante" v-model="form.despachante" :options="DESPACHANTE_OPTIONS" />
          </div>
          <div>
            <label for="pf-fornecedor" class="mb-1.5 block text-[10.5px] text-ink-soft">Fornecedor</label>
            <AppSelect id="pf-fornecedor" v-model="fornecedor.state.select" :options="FORNECEDOR_OPTIONS" />
          </div>
          <div>
            <label for="pf-modal" class="mb-1.5 block text-[10.5px] text-ink-soft">Modal</label>
            <AppSelect id="pf-modal" v-model="form.modalEnvio" :options="MODAL_ENVIO_OPTIONS" />
          </div>
        </div>

        <div v-if="fornecedor.state.select === 'Outro'">
          <label for="pf-fornecedor-outro" class="mb-1.5 block text-[10.5px] text-ink-soft">
            Qual fornecedor?
          </label>
          <input
            id="pf-fornecedor-outro"
            v-model="fornecedor.state.outroTexto"
            type="text"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <fieldset v-if="showDespachanteTransportadora" class="rounded-md border border-hairline p-3">
          <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Transportadora nacional</legend>
          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label for="pf-transp-nome" class="mb-1.5 block text-[10.5px] text-ink-soft">Nome</label>
              <input
                id="pf-transp-nome"
                v-model="form.transportadoraNome"
                type="text"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
              />
            </div>
            <div>
              <label for="pf-transp-cotacao" class="mb-1.5 block text-[10.5px] text-ink-soft">Cotação</label>
              <input
                id="pf-transp-cotacao"
                v-model="form.transportadoraCotacao"
                type="text"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
              />
            </div>
            <div>
              <label for="pf-transp-valor" class="mb-1.5 block text-[10.5px] text-ink-soft">Valor (R$)</label>
              <input
                id="pf-transp-valor"
                v-model="form.transportadoraValor"
                type="number"
                step="0.01"
                min="0"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
              />
            </div>
          </div>
        </fieldset>

        <div class="grid grid-cols-3 gap-2.5">
          <div>
            <label for="pf-cia-aerea" class="mb-1.5 block text-[10.5px] text-ink-soft">Cia. aérea</label>
            <input
              id="pf-cia-aerea"
              v-model="form.companhiaAerea"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
          <div>
            <label for="pf-awb" class="mb-1.5 block text-[10.5px] text-ink-soft">Nº AWB</label>
            <input
              id="pf-awb"
              v-model="form.numeroAwb"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
          <div>
            <label for="pf-rastreio" class="mb-1.5 block text-[10.5px] text-ink-soft">Rastreio</label>
            <input
              id="pf-rastreio"
              v-model="form.codigoRastreio"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
        </div>

        <div>
          <p class="mb-1.5 text-[10.5px] text-ink-soft">Medicamentos</p>
          <div
            v-for="(item, index) in medicamentos"
            :key="index"
            class="mb-1.5 grid grid-cols-[1.4fr_1fr_0.7fr_auto] items-end gap-2"
          >
            <div>
              <label :for="`pf-medicamento-nome-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Nome</label>
              <input
                :id="`pf-medicamento-nome-${index}`"
                :value="item.nome"
                type="text"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onMedicamentoNomeInput(index, $event)"
              />
            </div>
            <div>
              <label :for="`pf-medicamento-dosagem-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Dosagem</label>
              <input
                :id="`pf-medicamento-dosagem-${index}`"
                :value="item.dosagem"
                type="text"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onMedicamentoDosagemInput(index, $event)"
              />
            </div>
            <div>
              <label :for="`pf-medicamento-quantidade-${index}`" class="mb-1.5 block text-[10.5px] text-ink-soft">Quantidade</label>
              <input
                :id="`pf-medicamento-quantidade-${index}`"
                :value="item.quantidade"
                type="text"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onMedicamentoQuantidadeInput(index, $event)"
              />
            </div>
            <div class="flex gap-1">
              <button
                v-if="index > 0"
                type="button"
                title="Remover medicamento"
                class="rounded-md px-1.5 py-2 text-ink-soft transition-colors hover:text-danger"
                @click="removeMedicamento(index)"
              >
                ✕
              </button>
              <button
                v-if="index === medicamentos.length - 1"
                type="button"
                title="Adicionar medicamento"
                class="rounded-md border border-hairline px-2.5 py-2 text-[13px] font-semibold text-accent-dark transition-colors hover:bg-paper"
                @click="addMedicamento"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <fieldset class="rounded-md border border-hairline p-3">
          <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Datas</legend>
          <div class="grid grid-cols-4 gap-2.5">
            <div>
              <label for="pf-data-po" class="mb-1.5 block text-[10.5px] text-ink-soft">Compra (PO)</label>
              <input
                id="pf-data-po"
                :value="form.dataCompraPO"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('dataCompraPO', $event)"
              />
            </div>
            <div>
              <label for="pf-data-embarque" class="mb-1.5 block text-[10.5px] text-ink-soft">Embarque</label>
              <input
                id="pf-data-embarque"
                :value="form.dataEmbarque"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('dataEmbarque', $event)"
              />
            </div>
            <div>
              <label for="pf-thread" class="mb-1.5 block text-[10.5px] text-ink-soft">Abertura thread</label>
              <input
                id="pf-thread"
                :value="form.aberturaThread"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('aberturaThread', $event)"
              />
            </div>
            <div>
              <label for="pf-chegada" class="mb-1.5 block text-[10.5px] text-ink-soft">Chegada Brasil</label>
              <input
                id="pf-chegada"
                :value="form.dataChegadaBrasil"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('dataChegadaBrasil', $event)"
              />
            </div>
            <div>
              <label for="pf-radar" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Radar</label>
              <input
                id="pf-radar"
                :value="form.registroRadar"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('registroRadar', $event)"
              />
            </div>
            <div>
              <label for="pf-duimp" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Duimp</label>
              <input
                id="pf-duimp"
                :value="form.registroDuimp"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('registroDuimp', $event)"
              />
            </div>
            <div>
              <label for="pf-lpco" class="mb-1.5 block text-[10.5px] text-ink-soft">Registro Lpco</label>
              <input
                id="pf-lpco"
                :value="form.registroLpco"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('registroLpco', $event)"
              />
            </div>
            <div>
              <label for="pf-previsao" class="mb-1.5 block text-[10.5px] text-ink-soft">Previsão entrega</label>
              <input
                id="pf-previsao"
                :value="form.previsaoEntrega"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('previsaoEntrega', $event)"
              />
            </div>
            <div>
              <label for="pf-suposta-estimativa" class="mb-1.5 block text-[10.5px] text-ink-soft">Suposta estimativa</label>
              <input
                id="pf-suposta-estimativa"
                :value="form.supostaEstimativa"
                type="text"
                inputmode="numeric"
                placeholder="DD/MM"
                class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
                @input="onDataFieldInput('supostaEstimativa', $event)"
              />
            </div>
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label for="pf-local-entrega" class="mb-1.5 block text-[10.5px] text-ink-soft">Local de entrega</label>
            <input
              id="pf-local-entrega"
              v-model="form.localEntrega"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
          <div>
            <label for="pf-numero-processo" class="mb-1.5 block text-[10.5px] text-ink-soft">Nº do processo</label>
            <input
              id="pf-numero-processo"
              v-model="form.numeroProcesso"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </div>
        </div>

        <div>
          <p class="mb-1.5 text-[10.5px] text-ink-soft">Pendências</p>
          <div v-for="(_, index) in pendencias" :key="index" class="mb-1.5 flex items-center gap-2">
            <input
              v-model="pendencias[index]"
              type="text"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
            <button
              type="button"
              title="Remover pendência"
              class="rounded-md px-1.5 py-2 text-ink-soft transition-colors hover:text-danger"
              @click="removePendencia(index)"
            >
              ✕
            </button>
          </div>
          <button
            id="btn-add-pendencia"
            type="button"
            class="rounded-md border border-hairline px-2.5 py-2 text-[13px] font-semibold text-accent-dark transition-colors hover:bg-paper"
            @click="addPendencia"
          >
            + Pendência
          </button>
        </div>

        <button
          id="btn-save-processo"
          type="submit"
          class="mt-1 w-full rounded-lg bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
        >
          {{ editingProcesso ? "Salvar alterações" : "+ Adicionar processo" }}
        </button>
      </form>
    </div>
  </BaseModal>
</template>
