<script setup lang="ts">
import type { NewProcessoDTO, Processo, ProcessoFormUpdatePayload } from "#shared/types/processo";
import { useProcessoForm } from "../../composables/useProcessoForm";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import ProcessoFormDatas from "./ProcessoFormDatas.vue";
import ProcessoFormMedicamentos from "./ProcessoFormMedicamentos.vue";
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
import {
  BOTAO_REMOVER_CLASS,
  INPUT_CLASS,
  INPUT_COMPACTO_CLASS,
  INPUT_MONO_CLASS,
  LABEL_CLASS,
  MODAL_PAD_X_CLASS,
  SELECT_CAMPO_CLASS,
} from "../../utils/processoFormClasses";

const props = defineProps<{
  editingProcesso?: Processo | null;
}>();

const emit = defineEmits<{
  submit: [payload: NewProcessoDTO];
  update: [id: string, payload: ProcessoFormUpdatePayload];
  close: [];
  invalid: [message: string];
}>();

// Todo o estado do form (FormState, medicamentos, pendências, fornecedor) e os
// handlers de input vivem em useProcessoForm.ts — ver ali pros achados
// preservados (ex.: valor "0" da transportadora vira undefined, em
// processoFormPayload.ts, consumido por validar()).
const {
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
} = useProcessoForm(() => props.editingProcesso);

function handleSubmit(): void {
  const resultado = validar();
  if (!resultado.valido) {
    emit("invalid", resultado.erro);
    return;
  }

  if (props.editingProcesso) {
    emit("update", props.editingProcesso.id, resultado.payload);
    return;
  }

  emit("submit", { ...resultado.payload, atualizacoes: [] });
}
</script>

<template>
  <!--
    Abaixo de lg o casco vira tela cheia (fixed inset-0 h-dvh, por cima do
    BottomNav — o overlay do BaseModal está em z-900 e o BottomNav em z-40):
    cabeçalho fixo, corpo que rola por dentro e rodapé fixo (sticky) com
    Cancelar + Salvar. Em lg+ as classes de lg: devolvem o modal de antes (o
    corpo vira o próprio <form> rolável e o rodapé "some" via contents, deixando
    só o botão de salvar no fim do formulário, como era).
  -->
  <BaseModal id="processo-form-modal-overlay" @close="emit('close')">
    <div
      class="fixed inset-0 flex h-dvh w-full flex-col bg-paper-raised lg:static lg:inset-auto lg:h-auto lg:max-h-[90vh] lg:max-w-[720px] lg:rounded-[10px] lg:border lg:border-hairline"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-hairline py-2 lg:px-5 lg:py-4"
        :class="MODAL_PAD_X_CLASS"
      >
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
          class="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-danger lg:mr-0 lg:block lg:h-auto lg:w-auto lg:px-2 lg:py-1"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <form
        id="processo-form"
        class="flex min-h-0 flex-1 scroll-pb-[calc(5rem+env(safe-area-inset-bottom,0px))] flex-col overflow-y-auto overscroll-contain lg:flex-[0_1_auto] lg:scroll-pb-[auto] lg:gap-3.5 lg:overscroll-auto lg:p-5"
        @submit.prevent="handleSubmit"
      >
        <div class="flex flex-col gap-3.5 py-4 lg:contents" :class="MODAL_PAD_X_CLASS">
          <!-- Paciente/Pasta e Ordem/Empresa/Consultor: dois grids de 3 colunas no
               desktop; abaixo de lg viram uma grade só pra Pasta e Ordem ficarem
               lado a lado (contents nos dois grids internos). -->
          <div class="grid grid-cols-2 gap-x-2.5 gap-y-3.5 sm:grid-cols-3 lg:contents">
            <div class="contents lg:grid lg:grid-cols-3 lg:gap-2.5">
              <div class="col-span-2">
                <label for="pf-paciente" :class="LABEL_CLASS">Paciente</label>
                <input id="pf-paciente" :value="form.paciente" type="text" :class="INPUT_CLASS" @input="onPacienteInput" />
              </div>
              <div>
                <label for="pf-pasta" :class="LABEL_CLASS">Pasta</label>
                <input
                  id="pf-pasta"
                  :value="form.pasta"
                  type="text"
                  inputmode="numeric"
                  placeholder="2026 - 234"
                  :class="INPUT_MONO_CLASS"
                  @input="onPastaInput"
                />
              </div>
            </div>

            <div class="contents lg:grid lg:grid-cols-3 lg:gap-2.5">
              <div>
                <label for="pf-ordem" :class="LABEL_CLASS">Ordem</label>
                <input id="pf-ordem" v-model="form.ordem" type="number" min="1" :class="INPUT_MONO_CLASS" />
              </div>
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="pf-empresa" :class="LABEL_CLASS">Empresa</label>
                <AppSelect id="pf-empresa" v-model="form.empresa" :options="EMPRESA_OPTIONS" />
              </div>
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="pf-consultor" :class="LABEL_CLASS">Consultor</label>
                <AppSelect id="pf-consultor" v-model="form.consultor" :options="CONSULTOR_OPTIONS" />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-3">
            <div class="col-span-2 lg:col-span-1" :class="SELECT_CAMPO_CLASS">
              <label for="pf-status" :class="LABEL_CLASS">Status</label>
              <AppSelect id="pf-status" v-model="form.status" :options="STATUS_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-responsavel" :class="LABEL_CLASS">Responsável</label>
              <AppSelect id="pf-responsavel" v-model="form.responsavelOperacional" :options="RESPONSAVEL_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-status-pagamento" :class="LABEL_CLASS">Pagamento</label>
              <AppSelect id="pf-status-pagamento" v-model="form.statusPagamento" :options="STATUS_PAGAMENTO_OPTIONS" />
            </div>
          </div>

          <div v-if="form.status === 'outro'">
            <label for="pf-status-outro" :class="LABEL_CLASS">Qual status?</label>
            <input id="pf-status-outro" v-model="form.statusOutro" type="text" :class="INPUT_CLASS" />
          </div>

          <div
            class="grid grid-cols-1 gap-2.5"
            :class="showDespachanteTransportadora ? 'md:grid-cols-3' : 'sm:grid-cols-2'"
          >
            <div v-if="showDespachanteTransportadora" :class="SELECT_CAMPO_CLASS">
              <label for="pf-despachante" :class="LABEL_CLASS">Despachante</label>
              <AppSelect id="pf-despachante" v-model="form.despachante" :options="DESPACHANTE_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-fornecedor" :class="LABEL_CLASS">Fornecedor</label>
              <AppSelect id="pf-fornecedor" v-model="fornecedor.state.select" :options="FORNECEDOR_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-modal" :class="LABEL_CLASS">Modal</label>
              <AppSelect id="pf-modal" v-model="form.modalEnvio" :options="MODAL_ENVIO_OPTIONS" />
            </div>
          </div>

          <div v-if="fornecedor.state.select === 'Outro'">
            <label for="pf-fornecedor-outro" :class="LABEL_CLASS">Qual fornecedor?</label>
            <input id="pf-fornecedor-outro" v-model="fornecedor.state.outroTexto" type="text" :class="INPUT_CLASS" />
          </div>

          <fieldset
            v-if="showDespachanteTransportadora"
            class="min-w-0 rounded-md border border-hairline p-3 lg:min-w-min"
          >
            <legend class="px-1 text-[11px] font-semibold text-ink-soft uppercase">Transportadora nacional</legend>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div class="col-span-2 sm:col-span-1">
                <label for="pf-transp-nome" :class="LABEL_CLASS">Nome</label>
                <input id="pf-transp-nome" v-model="form.transportadoraNome" type="text" :class="INPUT_CLASS" />
              </div>
              <div>
                <label for="pf-transp-cotacao" :class="LABEL_CLASS">Cotação</label>
                <input id="pf-transp-cotacao" v-model="form.transportadoraCotacao" type="text" :class="INPUT_CLASS" />
              </div>
              <div>
                <label for="pf-transp-valor" :class="LABEL_CLASS">Valor (R$)</label>
                <input
                  id="pf-transp-valor"
                  v-model="form.transportadoraValor"
                  type="number"
                  step="0.01"
                  min="0"
                  :class="INPUT_MONO_CLASS"
                />
              </div>
            </div>
          </fieldset>

          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div>
              <label for="pf-cia-aerea" :class="LABEL_CLASS">Cia. aérea</label>
              <input id="pf-cia-aerea" v-model="form.companhiaAerea" type="text" :class="INPUT_CLASS" />
            </div>
            <div>
              <label for="pf-awb" :class="LABEL_CLASS">Nº AWB</label>
              <input id="pf-awb" v-model="form.numeroAwb" type="text" :class="INPUT_MONO_CLASS" />
            </div>
            <div class="col-span-2 sm:col-span-1">
              <label for="pf-rastreio" :class="LABEL_CLASS">Rastreio</label>
              <input id="pf-rastreio" v-model="form.codigoRastreio" type="text" :class="INPUT_MONO_CLASS" />
            </div>
          </div>

          <ProcessoFormMedicamentos
            :items="medicamentos"
            @nome-input="onMedicamentoNomeInput"
            @dosagem-input="onMedicamentoDosagemInput"
            @quantidade-input="onMedicamentoQuantidadeInput"
            @add="addMedicamento"
            @remove="removeMedicamento"
          />

          <ProcessoFormDatas :values="form" @field-input="onDataFieldInput" />

          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label for="pf-local-entrega" :class="LABEL_CLASS">Local de entrega</label>
              <input id="pf-local-entrega" v-model="form.localEntrega" type="text" :class="INPUT_CLASS" />
            </div>
            <div>
              <label for="pf-numero-processo" :class="LABEL_CLASS">Nº do processo</label>
              <input id="pf-numero-processo" v-model="form.numeroProcesso" type="text" :class="INPUT_MONO_CLASS" />
            </div>
          </div>

          <div>
            <p :class="LABEL_CLASS">Pendências</p>
            <div v-for="(_, index) in pendencias" :key="index" class="mb-1.5 flex items-center gap-2">
              <input v-model="pendencias[index]" type="text" :class="INPUT_COMPACTO_CLASS" />
              <button type="button" title="Remover pendência" :class="BOTAO_REMOVER_CLASS" @click="removePendencia(index)">
                ✕
              </button>
            </div>
            <button
              id="btn-add-pendencia"
              type="button"
              class="min-h-11 w-full rounded-md border border-hairline px-2.5 py-2 text-[14px] font-semibold text-accent-dark transition-colors hover:bg-paper lg:min-h-auto lg:w-auto lg:text-[13px]"
              @click="addPendencia"
            >
              + Pendência
            </button>
          </div>
        </div>

        <div
          class="sticky bottom-0 z-10 mt-auto flex gap-2.5 border-t border-hairline bg-paper-raised pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:contents"
          :class="MODAL_PAD_X_CLASS"
        >
          <button
            id="btn-cancel-processo"
            type="button"
            class="min-h-11 flex-1 rounded-lg border border-hairline bg-paper px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-white lg:hidden"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-save-processo"
            type="submit"
            class="min-h-11 flex-[2] rounded-lg bg-accent-dark px-4 py-2.5 text-[14px] font-semibold text-white transition-colors lg:mt-1 lg:min-h-auto lg:w-full lg:flex-[0_1_auto] lg:text-[13px]"
          >
            {{ editingProcesso ? "Salvar alterações" : "+ Adicionar processo" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
