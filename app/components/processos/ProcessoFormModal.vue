<script setup lang="ts">
import type { NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import { MENSAGEM_CONFLITO_EDICAO } from "../../composables/useConflitoEdicaoProcesso";
import { useProcessoForm } from "../../composables/useProcessoForm";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import ProcessoFormDatas from "./ProcessoFormDatas.vue";
import ProcessoFormMedicamentos from "./ProcessoFormMedicamentos.vue";
import ProcessoRemessaStepper from "./ProcessoRemessaStepper.vue";
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
  FIELDSET_CLASS,
  INPUT_CLASS,
  INPUT_COMPACTO_CLASS,
  INPUT_MONO_CLASS,
  LABEL_CLASS,
  LEGEND_CLASS,
  MODAL_PAD_X_CLASS,
  SELECT_CAMPO_CLASS,
} from "../../utils/processoFormClasses";

const props = defineProps<{
  editingProcesso?: Processo | null;
  // Outra pessoa gravou o processo enquanto o formulário estava aberto (409): mostra o aviso e o botão de recarregar.
  conflito?: boolean;
  recarregando?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: NewProcessoDTO];
  update: [id: string, payload: ProcessoFormPatchPayload];
  // "Recarregar dados atuais": descarta o que está sendo editado e abre a versão atual do servidor.
  recarregar: [];
  close: [];
  invalid: [message: string];
  // Edição sem nenhuma alteração: nada é enviado ao servidor.
  unchanged: [];
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
} = useProcessoForm(() => props.editingProcesso);

function handleSubmit(): void {
  if (props.editingProcesso) {
    // Edição: só vai o que o usuário alterou (patch diferencial, ver montarPatchDiferencial).
    const edicao = validarEdicao();
    if (!edicao.valido) {
      emit("invalid", edicao.erro);
      return;
    }
    if (edicao.patch === null) {
      emit("unchanged");
      return;
    }
    emit("update", props.editingProcesso.id, edicao.patch);
    return;
  }

  const resultado = validar();
  if (!resultado.valido) {
    emit("invalid", resultado.erro);
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

      <!-- Conflito de versão (409): fica FORA do corpo que rola, sempre visível. O formulário abaixo segue
           intacto (o texto digitado não se perde). Não há "salvar mesmo assim". -->
      <div
        v-if="conflito && editingProcesso"
        id="processo-conflito-aviso"
        role="alert"
        class="flex shrink-0 flex-col gap-2 border-b border-hairline bg-paper py-3 lg:px-5"
        :class="MODAL_PAD_X_CLASS"
      >
        <p id="processo-conflito-texto" class="text-[13.5px] leading-snug text-danger">
          {{ MENSAGEM_CONFLITO_EDICAO }}
        </p>
        <button
          id="btn-recarregar-processo"
          type="button"
          :disabled="recarregando"
          class="min-h-11 w-full rounded-md border border-hairline bg-paper-raised px-3 py-2 text-[14px] font-semibold text-accent-dark transition-colors hover:bg-white disabled:opacity-60 lg:min-h-auto lg:w-auto lg:self-start lg:text-[13px]"
          @click="emit('recarregar')"
        >
          {{ recarregando ? "Recarregando..." : "Recarregar dados atuais" }}
        </button>
      </div>

      <form
        id="processo-form"
        class="flex min-h-0 flex-1 scroll-pb-[calc(5rem+env(safe-area-inset-bottom,0px))] flex-col overflow-y-auto overscroll-contain lg:flex-[0_1_auto] lg:scroll-pb-[auto] lg:gap-3.5 lg:overscroll-auto lg:p-5"
        @submit.prevent="handleSubmit"
      >
        <!-- Ordem dos blocos (a ordem do DOM é a ordem de tabulação; nenhum tabindex positivo):
             1) Paciente / Pasta / Nº Ordem  2) Nº Remessa / Nº do processo  3) Medicamentos e local de entrega
             4) Empresa / Responsável / Consultor / Fornecedor  5) Status / Pagamento  6) Envio internacional (Envio /
             Cia. aérea / Nº AWB)  7) Despachante  8) Transportadora nacional  9) Datas  10) Pendências.
             Cada linha e cada fieldset é filho DIRETO deste contêiner: em lg+ ele vira `contents` e os filhos passam a ser
             itens do <form> (flex-col com gap-3.5). -->
        <div class="flex flex-col gap-3.5 py-4 lg:contents" :class="MODAL_PAD_X_CLASS">
          <!-- Linha 1: Paciente / Pasta / Nº Ordem. lg+: Paciente flexível, Pasta 7rem (112px) e Nº Ordem 10,5rem (168px).
               A Pasta comporta o MAIOR valor da máscara (maskPastaCode: 4 dígitos + " - " + 3 = 10 caracteres, 81px em JetBrains
               Mono 13,5px) com o padding de sempre: 112 − 2 de borda − 20 de padding = 90px de conteúdo. Abaixo de lg:
               Paciente em linha inteira e Pasta | Nº Ordem em 2 colunas (≥ 166px cada, 16px de fonte: 96px de texto + 22).
               A ordem visual é a do DOM (nenhuma classe order-*), então o Tab acompanha o que se vê. -->
          <div class="grid grid-cols-2 gap-x-2.5 gap-y-3.5 lg:grid-cols-[minmax(0,1fr)_7rem_10.5rem]">
            <div class="col-span-2 lg:col-span-1">
              <label for="pf-paciente" :class="LABEL_CLASS">Paciente</label>
              <input id="pf-paciente" :value="form.paciente" type="text" :class="INPUT_CLASS" @input="onPacienteInput" />
            </div>
            <div>
              <label for="pf-pasta" :class="LABEL_CLASS">Pasta</label>
              <input
                id="pf-pasta"
                data-sem-maiuscula
                :value="form.pasta"
                type="text"
                inputmode="numeric"
                placeholder="2026 - 234"
                :class="INPUT_MONO_CLASS"
                @input="onPastaInput"
              />
            </div>
            <!-- Nº Ordem (PO): máscara PO-00-0000[/números] (useProcessoForm.onNumeroPoInput); incompleto salva.
                 data-sem-maiuscula: a máscara já cuida das maiúsculas; o plugin global não deve disputar o valor. -->
            <div>
              <label for="pf-numero-po" :class="LABEL_CLASS">Nº Ordem</label>
              <input
                id="pf-numero-po"
                data-sem-maiuscula
                :value="form.numeroPo"
                type="text"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                placeholder="PO-00-0000"
                :class="INPUT_MONO_CLASS"
                @input="onNumeroPoInput"
              />
            </div>
          </div>

          <!-- Linha 2: Nº Remessa (estreito: 5rem = 80px, cabem 2 dígitos + as setas dentro do campo; mais dígitos rolam dentro
               do input) / Nº do processo (o resto da linha; no desktop no máximo 22rem). -->
          <div class="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2.5 lg:grid-cols-[5rem_minmax(0,22rem)]">
            <div>
              <label for="pf-numero-remessa" :class="LABEL_CLASS">Nº Remessa</label>
              <!-- Input de quantidade (−, campo, +): ver ProcessoRemessaStepper.vue. Mínimo 1; vazio/0 vira 1. -->
              <ProcessoRemessaStepper id="pf-numero-remessa" v-model="form.numeroRemessa" rotulo="Nº Remessa" />
            </div>
            <div>
              <label for="pf-numero-processo" :class="LABEL_CLASS">Nº do processo</label>
              <input id="pf-numero-processo" data-sem-maiuscula v-model="form.numeroProcesso" type="text" :class="INPUT_MONO_CLASS" />
            </div>
          </div>

          <!-- Medicamentos + local de entrega. O título "Medicamentos" vem da legenda (semRotulo esconde o do componente). -->
          <fieldset :class="FIELDSET_CLASS">
            <legend :class="LEGEND_CLASS">Medicamentos e local de entrega</legend>
            <div class="flex flex-col gap-3.5">
              <ProcessoFormMedicamentos
                :items="medicamentos"
                sem-rotulo
                @nome-input="onMedicamentoNomeInput"
                @quantidade-input="onMedicamentoQuantidadeInput"
                @add="addMedicamento"
                @remove="removeMedicamento"
              />
              <div>
                <label for="pf-local-entrega" :class="LABEL_CLASS">Local de entrega</label>
                <input id="pf-local-entrega" v-model="form.localEntrega" type="text" :class="INPUT_CLASS" />
              </div>
            </div>
          </fieldset>

          <!-- Grade 2x2 em ordem de leitura: Empresa / Responsável (operacional) // Consultor / Fornecedor. 1 coluna no
               celular (os nomes longos dos selects não cabem em ~159px). -->
          <div class="grid grid-cols-1 gap-x-2.5 gap-y-3.5 sm:grid-cols-2">
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-empresa" :class="LABEL_CLASS">Empresa</label>
              <AppSelect id="pf-empresa" v-model="form.empresa" :options="EMPRESA_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-responsavel" :class="LABEL_CLASS">Responsável</label>
              <AppSelect id="pf-responsavel" v-model="form.responsavelOperacional" :options="RESPONSAVEL_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-consultor" :class="LABEL_CLASS">Consultor</label>
              <AppSelect id="pf-consultor" v-model="form.consultor" :options="CONSULTOR_OPTIONS" />
            </div>
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-fornecedor" :class="LABEL_CLASS">Fornecedor</label>
              <AppSelect id="pf-fornecedor" v-model="fornecedor.state.select" :options="FORNECEDOR_OPTIONS" />
            </div>
          </div>

          <!-- "Qual fornecedor?" em linha inteira logo abaixo da grade (e não dentro da célula do Fornecedor: aquela célula
               ficaria mais alta que a do Consultor e sobraria um buraco debaixo dela). Nenhuma célula da grade se move. -->
          <div v-if="fornecedor.state.select === 'Outro'">
            <label for="pf-fornecedor-outro" :class="LABEL_CLASS">Qual fornecedor?</label>
            <input id="pf-fornecedor-outro" v-model="fornecedor.state.outroTexto" type="text" :class="INPUT_CLASS" />
          </div>

          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-status" :class="LABEL_CLASS">Status</label>
              <AppSelect id="pf-status" v-model="form.status" :options="STATUS_OPTIONS" />
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

          <!-- Envio internacional: Envio (campo pf-modal) / Cia. aérea / Nº AWB. A Cia. depende do Envio (opções e desabilitada sem Envio). -->
          <fieldset :class="FIELDSET_CLASS">
            <legend :class="LEGEND_CLASS">Envio internacional</legend>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div class="col-span-2 sm:col-span-1" :class="SELECT_CAMPO_CLASS">
                <label for="pf-modal" :class="LABEL_CLASS">Envio</label>
                <AppSelect
                  id="pf-modal"
                  :model-value="form.modalEnvio"
                  :options="MODAL_ENVIO_OPTIONS"
                  @update:model-value="onModalEnvioChange"
                />
              </div>
              <div :class="SELECT_CAMPO_CLASS">
                <label for="pf-cia-aerea" :class="LABEL_CLASS">Cia. aérea</label>
                <AppSelect
                  id="pf-cia-aerea"
                  :model-value="form.companhiaAerea"
                  :options="ciaAereaOptions"
                  :disabled="ciaAereaDesabilitada"
                  @update:model-value="onCiaAereaChange"
                />
              </div>
              <div>
                <label for="pf-awb" :class="LABEL_CLASS">Nº AWB</label>
                <input id="pf-awb" data-sem-maiuscula v-model="form.numeroAwb" type="text" :class="INPUT_MONO_CLASS" />
              </div>
            </div>
          </fieldset>

          <!-- Despachante: fora do bloco, logo depois dele; 1 coluna de 3 em lg+. Mesma condição de sempre (some no Courier Simples). -->
          <div v-if="showDespachanteTransportadora" class="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
            <div :class="SELECT_CAMPO_CLASS">
              <label for="pf-despachante" :class="LABEL_CLASS">Despachante</label>
              <AppSelect id="pf-despachante" v-model="form.despachante" :options="DESPACHANTE_OPTIONS" />
            </div>
          </div>

          <fieldset v-if="showDespachanteTransportadora" :class="FIELDSET_CLASS">
            <legend :class="LEGEND_CLASS">Transportadora nacional</legend>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div class="col-span-2 sm:col-span-1">
                <label for="pf-transp-nome" :class="LABEL_CLASS">Nome</label>
                <input id="pf-transp-nome" v-model="form.transportadoraNome" type="text" :class="INPUT_CLASS" />
              </div>
              <div>
                <label for="pf-transp-cotacao" :class="LABEL_CLASS">Cotação</label>
                <input id="pf-transp-cotacao" data-sem-maiuscula v-model="form.transportadoraCotacao" type="text" :class="INPUT_CLASS" />
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

          <ProcessoFormDatas :values="form" @update:field="onDataFieldChange" />

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
