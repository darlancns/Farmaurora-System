<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CHECKLIST_DIR, FECHAMENTO_RESTANTE_ENCERRADA } from "#shared/constants/dir";
import type { ChecklistChaveDir, ChecklistDir, Dir, DirPatchDTO, NewDirDTO } from "#shared/types/dir";
import { useDirForm, type CampoComOutro, type ChaveInstantanea } from "../../composables/useDirForm";
import { formatarDataHoraBrasilia } from "../../utils/dirFormatters";
import {
  BANCO_DIR_OPTIONS,
  DESPACHANTE_DIR_OPTIONS,
  montarEnvioDirOptions,
  FORNECEDOR_DIR_OPTIONS,
  OBSERVACAO_DIR_OPTIONS,
  RECEITA_DIR_OPTIONS,
  RESPONSAVEL_DIR_OPTIONS,
  STATUS_DIR_OPTIONS,
  TEMPERATURA_DIR_OPTIONS,
  montarCiaAereaDirOptions,
  montarVendedorDirOptions,
} from "../../utils/dirOptions";
import {
  INPUT_CLASS,
  INPUT_DATA_CLASS,
  INPUT_MONO_CLASS,
  LABEL_CLASS,
  MODAL_PAD_X_CLASS,
  SELECT_CAMPO_CLASS,
} from "../../utils/processoFormClasses";
import type { AppSelectOption } from "../../types/appSelect";
import AppDatePicker from "../AppDatePicker.vue";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import ConfirmDialog from "../ConfirmDialog.vue";
import DirBancoChip from "./DirBancoChip.vue";
import DirCheckbox from "./DirCheckbox.vue";
import DirChecklist from "./DirChecklist.vue";

const props = withDefaults(
  defineProps<{
    // Registro VIVO da store (muda quando um PATCH dá certo); null = criando um novo.
    editingDir: Dir | null;
    // Quantos registros existem por PO — alimenta o aviso de PO repetido.
    contagemPorPo: ReadonlyMap<string, number>;
    // Somente consulta (permissão "ver" na DIR): todos os campos e toggles desabilitados, sem salvar nem excluir.
    readonly?: boolean;
    // Consultores ATIVOS do Cadastro (lista "consultores"), em ordem alfabética: as opções do select Consultor.
    consultoresAtivos?: readonly string[];
  }>(),
  { readonly: false, consultoresAtivos: () => [] },
);

const emit = defineEmits<{
  submit: [payload: NewDirDTO];
  update: [id: string, payload: DirPatchDTO];
  // Toggles instantâneos (conferido, operação encerrada, checklist) de um PO que já existe.
  patch: [id: string, patch: DirPatchDTO];
  delete: [id: string];
  close: [];
  invalid: [message: string];
}>();

const { form, outros, onPoInput, onMedicamentoInput, onContratoCambioInput, validar, valorToggle } = useDirForm(
  () => props.editingDir,
  () => props.consultoresAtivos,
);

// Consultor: os ativos do Cadastro, sem "Outro" (+ valor antigo fora da lista como "(inativo)", nunca vazio).
const vendedorOptions = computed<AppSelectOption<string>[]>(() =>
  montarVendedorDirOptions(form.vendedor, props.consultoresAtivos),
);

// Cia aérea: a lista do Follow-Up (+ o valor antigo fora da lista como "(inativo)", nunca vazio).
// Envio: as opções do Follow-Up (+ valor antigo fora da lista como "(inativo)", nunca vazio).
const envioOptions = computed<AppSelectOption<string>[]>(() => montarEnvioDirOptions(form.envio));

const ciaAereaOptions = computed<AppSelectOption<string>[]>(() => montarCiaAereaDirOptions(form.companhiaAerea));

interface CampoLista {
  campo: CampoComOutro;
  rotulo: string;
  opcoes: AppSelectOption<string>[];
  // Ocupa a linha inteira em qualquer largura (sem isso: linha inteira abaixo de sm e meia largura a partir de sm).
  larguraTotal?: boolean;
}

const CAMPOS_IDENTIFICACAO: CampoLista[] = [
  { campo: "responsavel", rotulo: "Responsável", opcoes: RESPONSAVEL_DIR_OPTIONS },
  { campo: "receita", rotulo: "Receita", opcoes: RECEITA_DIR_OPTIONS },
  { campo: "temperatura", rotulo: "Temperatura", opcoes: TEMPERATURA_DIR_OPTIONS },
];
const CAMPOS_LOGISTICA: CampoLista[] = [
  // O Fornecedor ocupa a linha inteira (nenhum campo faz par com ele): Envio | Despachante e Cia aérea | AWB seguem em pares.
  { campo: "fornecedor", rotulo: "Fornecedor", opcoes: FORNECEDOR_DIR_OPTIONS, larguraTotal: true },
];
// Despachante vem depois do Envio (que é um select simples, sem "Outro"; ver o template).
const CAMPOS_DESPACHANTE: CampoLista[] = [
  { campo: "despachante", rotulo: "Despachante", opcoes: DESPACHANTE_DIR_OPTIONS },
];
const CAMPOS_FINANCEIRO: CampoLista[] = [{ campo: "banco", rotulo: "Banco", opcoes: BANCO_DIR_OPTIONS }];
const CAMPOS_OBSERVACAO: CampoLista[] = [{ campo: "observacao", rotulo: "Observação", opcoes: OBSERVACAO_DIR_OPTIONS }];

const checklistValues = computed<ChecklistDir>(
  () => Object.fromEntries(CHECKLIST_DIR.map((item) => [item.chave, valorToggle(item.chave)])) as ChecklistDir,
);

// Chip do banco do cabeçalho: acompanha o select de Banco (valor do formulário, mesmo antes de salvar).
const bancoAtual = computed<string>(() => outros.banco.build());

// "Em fechamento restante": PO com operação encerrada não pode ser MARCADO (o servidor devolve 400).
// Desabilitado só quando ainda não está marcado; um PO já marcado e depois encerrado pode ser
// desmarcado (a marca fica guardada e a lista só o esconde enquanto a operação estiver encerrada).
const fechamentoMarcado = computed<boolean>(() => valorToggle("fechamentoRestante"));
const operacaoEncerrada = computed<boolean>(() => valorToggle("operacaoEncerrada"));
const fechamentoDesabilitado = computed<boolean>(() => !fechamentoMarcado.value && operacaoEncerrada.value);
const fechamentoNota = computed<string>(() => {
  if (fechamentoDesabilitado.value) return FECHAMENTO_RESTANTE_ENCERRADA;
  const dir = props.editingDir;
  if (!fechamentoMarcado.value || !dir) return "";
  const quem = dir.fechamentoRestantePor || "—";
  const quando = formatarDataHoraBrasilia(dir.fechamentoRestanteEm);
  const base = `(incluído por ${quem}${quando ? `, ${quando}` : ""})`;
  return operacaoEncerrada.value ? `${base} — fora da lista enquanto a operação estiver encerrada` : base;
});

// Na edição o toggle grava na hora (PATCH); na criação só vira parte do payload do "Adicionar".
function alternar(chave: ChaveInstantanea | ChecklistChaveDir): void {
  if (props.readonly) return;
  const dir = props.editingDir;
  if (dir) {
    emit("patch", dir.id, { [chave]: !dir[chave] });
    return;
  }
  form[chave] = !form[chave];
  // Criando: encerrar a operação desmarca o fechamento restante (não se marca PO encerrado).
  if (chave === "operacaoEncerrada" && form.operacaoEncerrada) form.fechamentoRestante = false;
}

const avisoPoRepetido = computed<string>(() => {
  const po = form.po.trim().toUpperCase();
  if (!po) return "";
  const proprio = props.editingDir && props.editingDir.po === po ? 1 : 0;
  const outrosRegistros = (props.contagemPorPo.get(po) ?? 0) - proprio;
  if (outrosRegistros <= 0) return "";
  return `Já existe${outrosRegistros > 1 ? "m" : ""} ${outrosRegistros} registro${outrosRegistros > 1 ? "s" : ""} com este PO. É permitido (ex.: ordem 2 ou complemento), só confira.`;
});

const showDeleteConfirm = ref(false);

// Esc com a confirmação de exclusão aberta: o ConfirmDialog (outro BaseModal) e o BaseModal deste
// formulário ouvem o MESMO Esc no document — sem tratamento o Esc fechava os dois. Aqui o formulário
// ignora o Esc que chegou com a confirmação aberta (quem fecha é o ConfirmDialog). O estado é lido na
// fase de CAPTURA, antes de qualquer ouvinte normal rodar, então não depende da ordem em que os dois
// ouvintes foram registrados. (Correção só da DIR: o BaseModal compartilhado não foi alterado.)
let escChegouComConfirmacao = false;

function registrarEstadoNoEsc(event: KeyboardEvent): void {
  if (event.key === "Escape") escChegouComConfirmacao = showDeleteConfirm.value;
}

onMounted(() => document.addEventListener("keydown", registrarEstadoNoEsc, true));
onBeforeUnmount(() => document.removeEventListener("keydown", registrarEstadoNoEsc, true));

function aoFecharPeloModal(): void {
  if (escChegouComConfirmacao) {
    escChegouComConfirmacao = false;
    return;
  }
  emit("close");
}

function handleSubmit(): void {
  if (props.readonly) return;
  const resultado = validar();
  if (!resultado.valido) {
    emit("invalid", resultado.erro);
    return;
  }

  if (props.editingDir) {
    emit("update", props.editingDir.id, resultado.atualizacao);
    return;
  }

  emit("submit", resultado.payload);
}

function confirmarExclusao(): void {
  showDeleteConfirm.value = false;
  if (props.readonly) return;
  if (props.editingDir) emit("delete", props.editingDir.id);
}
</script>

<template>
  <!-- Mesmo casco do ProcessoFormModal: tela cheia abaixo de lg (cabeçalho e rodapé fixos), modal em lg+. -->
  <BaseModal id="dir-form-modal-overlay" @close="aoFecharPeloModal">
    <div
      class="fixed inset-0 flex h-dvh w-full flex-col bg-paper-raised lg:static lg:inset-auto lg:h-auto lg:max-h-[90vh] lg:max-w-[720px] lg:rounded-[10px] lg:border lg:border-hairline"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-hairline py-2 lg:px-5 lg:py-4"
        :class="MODAL_PAD_X_CLASS"
      >
        <div class="min-w-0">
          <p class="mb-1 font-mono text-[11px] tracking-wider text-accent-dark uppercase">DIR</p>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-display text-[18px] font-semibold text-ink">
              {{ editingDir ? `${readonly ? "Consultar" : "Editar"} ${editingDir.po}` : "Novo PO" }}
            </h2>
            <DirBancoChip v-if="bancoAtual" id="dir-form-banco-chip" :banco="bancoAtual" />
          </div>
        </div>
        <button
          id="btn-close-dir-form"
          type="button"
          title="Fechar"
          class="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-danger lg:mr-0 lg:block lg:h-auto lg:w-auto lg:px-2 lg:py-1"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <form
        id="dir-form"
        class="flex min-h-0 flex-1 scroll-pb-[calc(5rem+env(safe-area-inset-bottom,0px))] flex-col overflow-y-auto overscroll-contain lg:flex-[0_1_auto] lg:scroll-pb-[auto] lg:gap-3.5 lg:overscroll-auto lg:p-5"
        @submit.prevent="handleSubmit"
      >
        <div class="flex flex-col gap-3.5 py-4 lg:contents" :class="MODAL_PAD_X_CLASS">
          <p
            v-if="readonly"
            id="dir-form-somente-leitura"
            class="rounded-md border border-hairline bg-paper px-3 py-2 text-[12.5px] text-ink-soft"
          >
            Somente consulta: você não tem permissão para alterar a DIR.
          </p>
          <!-- Identificação -->
          <fieldset id="dir-secao-identificacao" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Identificação</legend>
            <div class="grid grid-cols-2 gap-2.5">
              <div class="col-span-2 sm:col-span-1">
                <label for="df-po" :class="LABEL_CLASS">PO</label>
                <input
                  id="df-po"
                  :value="form.po"
                  :readonly="readonly"
                  type="text"
                  placeholder="PO26-10-0471"
                  autocapitalize="characters"
                  data-sem-maiuscula
                  :class="INPUT_MONO_CLASS"
                  @input="onPoInput"
                />
                <p v-if="avisoPoRepetido" id="dir-po-aviso" class="mt-1 text-[12px] text-warning-gold">
                  ⚠ {{ avisoPoRepetido }}
                </p>
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label for="df-paciente" :class="LABEL_CLASS">Paciente</label>
                <input id="df-paciente" v-model="form.paciente" :readonly="readonly" type="text" :class="INPUT_CLASS" />
              </div>
              <div class="col-span-2">
                <label for="df-medicamento" :class="LABEL_CLASS">Medicamento</label>
                <input
                  id="df-medicamento"
                  :value="form.medicamento"
                  :readonly="readonly"
                  type="text"
                  autocapitalize="characters"
                  :class="INPUT_CLASS"
                  @input="onMedicamentoInput"
                />
              </div>
              <!-- Consultor: select simples, só os consultores ativos do Cadastro (sem "Outro"). -->
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="df-vendedor" :class="LABEL_CLASS">Consultor</label>
                <AppSelect id="df-vendedor" v-model="form.vendedor" :options="vendedorOptions" :disabled="readonly" />
              </div>
              <template v-for="c in CAMPOS_IDENTIFICACAO" :key="c.campo">
                <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                  <label :for="`df-${c.campo}`" :class="LABEL_CLASS">{{ c.rotulo }}</label>
                  <AppSelect :id="`df-${c.campo}`" v-model="outros[c.campo].state.select" :options="c.opcoes" :disabled="readonly" />
                  <input
                    v-if="outros[c.campo].state.select === 'Outro'"
                    :id="`df-${c.campo}-outro`"
                    v-model="outros[c.campo].state.outroTexto"
                    :readonly="readonly"
                    type="text"
                    :aria-label="`${c.rotulo} (outro)`"
                    placeholder="Digite"
                    class="mt-1.5"
                    :class="INPUT_CLASS"
                  />
                </div>
              </template>
            </div>
          </fieldset>

          <!-- Datas -->
          <fieldset id="dir-secao-datas" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Datas</legend>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label for="df-data-emissao" :class="LABEL_CLASS">Emissão</label>
                <AppDatePicker
                  id="df-data-emissao"
                  v-model="form.dataEmissao"
                  formato="iso"
                  :disabled="readonly"
                  placeholder="Escolher"
                  label="Emissão"
                  :classe-campo="INPUT_DATA_CLASS"
                />
              </div>
              <div>
                <label for="df-data-cobranca" :class="LABEL_CLASS">Cobrança aos fornecedores</label>
                <AppDatePicker
                  id="df-data-cobranca"
                  v-model="form.dataCobrancaFornecedores"
                  formato="iso"
                  :disabled="readonly"
                  placeholder="Escolher"
                  label="Cobrança aos fornecedores"
                  :classe-campo="INPUT_DATA_CLASS"
                />
              </div>
              <div>
                <label for="df-data-entrega" :class="LABEL_CLASS">Entrega</label>
                <AppDatePicker
                  id="df-data-entrega"
                  v-model="form.dataEntrega"
                  formato="iso"
                  :disabled="readonly"
                  placeholder="Escolher"
                  label="Entrega"
                  :classe-campo="INPUT_DATA_CLASS"
                />
              </div>
              <div>
                <label for="df-data-pagamento" :class="LABEL_CLASS">Pagamento</label>
                <AppDatePicker
                  id="df-data-pagamento"
                  v-model="form.dataPagamento"
                  formato="iso"
                  :disabled="readonly"
                  placeholder="Escolher"
                  label="Pagamento"
                  :classe-campo="INPUT_DATA_CLASS"
                />
              </div>
            </div>
          </fieldset>

          <!-- Logística -->
          <fieldset id="dir-secao-logistica" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Logística</legend>
            <div class="grid grid-cols-2 gap-2.5">
              <template v-for="c in CAMPOS_LOGISTICA" :key="c.campo">
                <div :class="[c.larguraTotal ? 'col-span-2' : 'col-span-2 sm:col-span-1', SELECT_CAMPO_CLASS]">
                  <label :for="`df-${c.campo}`" :class="LABEL_CLASS">{{ c.rotulo }}</label>
                  <AppSelect :id="`df-${c.campo}`" v-model="outros[c.campo].state.select" :options="c.opcoes" :disabled="readonly" />
                  <input
                    v-if="outros[c.campo].state.select === 'Outro'"
                    :id="`df-${c.campo}-outro`"
                    v-model="outros[c.campo].state.outroTexto"
                    :readonly="readonly"
                    type="text"
                    :aria-label="`${c.rotulo} (outro)`"
                    placeholder="Digite"
                    class="mt-1.5"
                    :class="INPUT_CLASS"
                  />
                </div>
              </template>
              <!-- Envio: as opções do Follow-Up (Air Cargo, Courier Formal, Courier Simples), sem "Outro". -->
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="df-envio" :class="LABEL_CLASS">Envio</label>
                <AppSelect id="df-envio" v-model="form.envio" :options="envioOptions" :disabled="readonly" />
              </div>
              <template v-for="c in CAMPOS_DESPACHANTE" :key="c.campo">
                <div :class="[c.larguraTotal ? 'col-span-2' : 'col-span-2 sm:col-span-1', SELECT_CAMPO_CLASS]">
                  <label :for="`df-${c.campo}`" :class="LABEL_CLASS">{{ c.rotulo }}</label>
                  <AppSelect :id="`df-${c.campo}`" v-model="outros[c.campo].state.select" :options="c.opcoes" :disabled="readonly" />
                  <input
                    v-if="outros[c.campo].state.select === 'Outro'"
                    :id="`df-${c.campo}-outro`"
                    v-model="outros[c.campo].state.outroTexto"
                    :readonly="readonly"
                    type="text"
                    :aria-label="`${c.rotulo} (outro)`"
                    placeholder="Digite"
                    class="mt-1.5"
                    :class="INPUT_CLASS"
                  />
                </div>
              </template>
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="df-companhia-aerea" :class="LABEL_CLASS">Cia aérea</label>
                <AppSelect id="df-companhia-aerea" v-model="form.companhiaAerea" :options="ciaAereaOptions" :disabled="readonly" />
              </div>
              <!-- Cia aérea e AWB lado a lado (meia largura cada) a partir de sm; abaixo de sm, um embaixo do outro em largura total. -->
              <div class="col-span-2 sm:col-span-1">
                <label for="df-awb" :class="LABEL_CLASS">AWB</label>
                <input
                  id="df-awb"
                  v-model="form.awb"
                  :readonly="readonly"
                  type="text"
                  placeholder="020-00000000"
                  data-sem-maiuscula
                  :class="INPUT_MONO_CLASS"
                />
              </div>
            </div>
          </fieldset>

          <!-- Financeiro -->
          <fieldset id="dir-secao-financeiro" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Financeiro</legend>
            <div class="grid grid-cols-2 gap-2.5">
              <div class="col-span-2 sm:col-span-1">
                <label for="df-contrato" :class="LABEL_CLASS">Contrato de câmbio</label>
                <input
                  id="df-contrato"
                  :value="form.contratoCambio"
                  :readonly="readonly"
                  type="text"
                  inputmode="numeric"
                  placeholder="123456 789012"
                  data-sem-maiuscula
                  :class="INPUT_MONO_CLASS"
                  @input="onContratoCambioInput"
                />
              </div>
              <template v-for="c in CAMPOS_FINANCEIRO" :key="c.campo">
                <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                  <label :for="`df-${c.campo}`" :class="LABEL_CLASS">{{ c.rotulo }}</label>
                  <AppSelect :id="`df-${c.campo}`" v-model="outros[c.campo].state.select" :options="c.opcoes" :disabled="readonly" />
                  <input
                    v-if="outros[c.campo].state.select === 'Outro'"
                    :id="`df-${c.campo}-outro`"
                    v-model="outros[c.campo].state.outroTexto"
                    :readonly="readonly"
                    type="text"
                    :aria-label="`${c.rotulo} (outro)`"
                    placeholder="Digite"
                    class="mt-1.5"
                    :class="INPUT_CLASS"
                  />
                </div>
              </template>
            </div>
          </fieldset>

          <!-- Situação -->
          <fieldset id="dir-secao-situacao" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Situação</legend>
            <div class="grid grid-cols-2 gap-2.5">
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="df-status" :class="LABEL_CLASS">Status</label>
                <AppSelect id="df-status" v-model="form.status" :options="STATUS_DIR_OPTIONS" :disabled="readonly" />
              </div>
              <template v-for="c in CAMPOS_OBSERVACAO" :key="c.campo">
                <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                  <label :for="`df-${c.campo}`" :class="LABEL_CLASS">{{ c.rotulo }}</label>
                  <AppSelect :id="`df-${c.campo}`" v-model="outros[c.campo].state.select" :options="c.opcoes" :disabled="readonly" />
                  <input
                    v-if="outros[c.campo].state.select === 'Outro'"
                    :id="`df-${c.campo}-outro`"
                    v-model="outros[c.campo].state.outroTexto"
                    :readonly="readonly"
                    type="text"
                    :aria-label="`${c.rotulo} (outro)`"
                    placeholder="Digite"
                    class="mt-1.5"
                    :class="INPUT_CLASS"
                  />
                </div>
              </template>
              <div class="col-span-2 flex flex-col gap-0.5 sm:flex-row sm:gap-6">
                <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
                  <input
                    id="df-exigencia"
                    v-model="form.exigencia"
                    type="checkbox"
                    :disabled="readonly"
                    class="h-[18px] w-[18px] accent-accent-dark"
                  />
                  <span class="text-[14px] text-ink lg:text-[13px]">Exigência</span>
                </label>
                <DirCheckbox
                  id="df-conferido"
                  :model-value="valorToggle('conferido')"
                  label="Conferido"
                  mostrar-rotulo
                  :desabilitado="readonly"
                  @toggle="alternar('conferido')"
                />
                <DirCheckbox
                  id="df-operacao-encerrada"
                  :model-value="valorToggle('operacaoEncerrada')"
                  label="Operação encerrada"
                  mostrar-rotulo
                  :desabilitado="readonly"
                  @toggle="alternar('operacaoEncerrada')"
                />
              </div>
              <div class="col-span-2 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                <DirCheckbox
                  id="df-fechamento-restante"
                  :model-value="fechamentoMarcado"
                  label="Em fechamento restante"
                  mostrar-rotulo
                  :desabilitado="fechamentoDesabilitado || readonly"
                  @toggle="alternar('fechamentoRestante')"
                />
                <span
                  v-if="fechamentoNota"
                  id="df-fechamento-restante-nota"
                  class="text-[12px]"
                  :class="fechamentoDesabilitado ? 'font-semibold text-danger' : 'text-ink-soft'"
                >{{ fechamentoNota }}</span>
              </div>
              <p v-if="editingDir && !readonly" class="col-span-2 text-[11.5px] text-ink-soft">
                Conferido, operação encerrada, fechamento restante e checklist gravam na hora; os demais campos, em "Salvar alterações".
              </p>
            </div>
          </fieldset>

          <!-- Checklist -->
          <fieldset id="dir-secao-checklist" class="min-w-0 rounded-md border border-hairline p-3">
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Checklist</legend>
            <DirChecklist :values="checklistValues" :desabilitado="readonly" @toggle="alternar($event)" />
          </fieldset>

          <button
            v-if="editingDir && !readonly"
            id="btn-excluir-dir"
            type="button"
            class="min-h-11 rounded-md border border-danger/40 px-3 py-2 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/5 lg:min-h-0 lg:self-start lg:text-[13px]"
            @click="showDeleteConfirm = true"
          >
            Excluir PO
          </button>
        </div>

        <div
          class="sticky bottom-0 z-10 mt-auto flex gap-2.5 border-t border-hairline bg-paper-raised pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:contents"
          :class="MODAL_PAD_X_CLASS"
        >
          <button
            id="btn-cancel-dir"
            type="button"
            class="min-h-11 flex-1 rounded-lg border border-hairline bg-paper px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-white lg:hidden"
            @click="emit('close')"
          >
            {{ readonly ? "Fechar" : "Cancelar" }}
          </button>
          <button
            v-if="!readonly"
            id="btn-save-dir"
            type="submit"
            class="min-h-11 flex-[2] rounded-lg bg-accent-dark px-4 py-2.5 text-[14px] font-semibold text-white transition-colors lg:mt-1 lg:min-h-auto lg:w-full lg:flex-[0_1_auto] lg:text-[13px]"
          >
            {{ editingDir ? "Salvar alterações" : "+ Adicionar PO" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>

  <ConfirmDialog
    v-if="showDeleteConfirm && editingDir && !readonly"
    :message="`Excluir o registro do ${editingDir.po}? Essa ação não pode ser desfeita.`"
    confirm-label="Excluir"
    danger
    reforcado
    @confirm="confirmarExclusao"
    @close="showDeleteConfirm = false"
  />
</template>
