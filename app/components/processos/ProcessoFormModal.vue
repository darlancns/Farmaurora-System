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

        <ProcessoFormMedicamentos
          :items="medicamentos"
          @nome-input="onMedicamentoNomeInput"
          @dosagem-input="onMedicamentoDosagemInput"
          @quantidade-input="onMedicamentoQuantidadeInput"
          @add="addMedicamento"
          @remove="removeMedicamento"
        />

        <ProcessoFormDatas :values="form" @field-input="onDataFieldInput" />

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
