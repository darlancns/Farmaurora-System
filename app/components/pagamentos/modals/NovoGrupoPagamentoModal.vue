<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type {
  EmpresaPagamento,
  NovoGrupoPagamentoDTO,
  TipoGrupoPagamento,
} from "#shared/types/Pagamento";
import { EMPRESA_PAGAMENTO_LABEL, TIPO_GRUPO_PAGAMENTO_LABEL } from "#shared/constants/pagamentos";
import { parseBrCurrency } from "../../../utils/formatters";
import { useTitleCaseInput } from "../../../composables/useTitleCaseInput";
import { useCurrencyField } from "../../../composables/useCurrencyField";
import AppSelect from "../../AppSelect.vue";
import BaseModal from "../../BaseModal.vue";
import type { AppSelectOption } from "../../../types/appSelect";
import {
  DESPACHANTE_PAGAMENTO_OPTIONS,
  TRANSPORTADORA_PAGAMENTO_OPTIONS,
} from "../../../utils/pagamentoOptions";

const props = withDefaults(
  defineProps<{
    tipo: TipoGrupoPagamento;
    empresa: EmpresaPagamento;
    data: string; // ISO date — o dia do lançamento (não é escolhido no form)
    pixMap?: Record<string, string>; // chave PIX efetiva (padrão + salva) por nome
  }>(),
  { pixMap: () => ({}) },
);

const emit = defineEmits<{
  submit: [payload: Omit<NovoGrupoPagamentoDTO, "tipo">];
  "salvar-pix": [nome: string, chavePix: string];
  close: [];
  invalid: [message: string];
}>();

const grupoOptions = (
  props.tipo === "DESPACHANTE" ? DESPACHANTE_PAGAMENTO_OPTIONS : TRANSPORTADORA_PAGAMENTO_OPTIONS
) as AppSelectOption<string>[];

interface ItemDraft {
  pacienteStr: string;
  valorStr: string;
}

const form = reactive({
  nomeGrupo: "",
  chavePix: "",
  itens: [{ pacienteStr: "", valorStr: "" }] as ItemDraft[],
});

// PIX: vem pré-preenchida pelo nome escolhido (valor salvo, ou o padrão) e fica
// travada até clicar em "Editar". Ao editar e sair do campo, a nova chave é
// salva como padrão daquele despachante/transportadora.
const pixEditavel = ref(false);
const pixCarregada = ref("");

function pixDe(nome: string): string {
  return props.pixMap[nome] ?? "";
}

watch(
  () => form.nomeGrupo,
  (nome) => {
    form.chavePix = pixDe(nome);
    pixCarregada.value = form.chavePix;
    pixEditavel.value = false;
  }
);

// Se o mapa de PIX chegar/mudar (fetch async) e o campo não estiver em edição,
// re-sincroniza com o valor salvo do nome atual.
watch(
  () => props.pixMap,
  () => {
    if (!pixEditavel.value && form.nomeGrupo) {
      form.chavePix = pixDe(form.nomeGrupo);
      pixCarregada.value = form.chavePix;
    }
  },
  { deep: true }
);

function onPixBlur(): void {
  if (!pixEditavel.value) return;
  const chave = form.chavePix.trim();
  if (!chave || !form.nomeGrupo || chave === pixCarregada.value) return;
  emit("salvar-pix", form.nomeGrupo, chave);
  pixCarregada.value = chave;
}

function addItem(): void {
  form.itens.push({ pacienteStr: "", valorStr: "" });
}
function removeItem(index: number): void {
  if (form.itens.length > 1) form.itens.splice(index, 1);
}

function onPacienteInput(index: number, event: Event): void {
  const item = form.itens[index];
  if (!item) return;
  useTitleCaseInput((value) => {
    item.pacienteStr = value;
  })(event);
}

// Mesma normalização do formulário do Banco: o valor costuma ser colado em
// formatos variados e sai sempre como "nn.nnn,nn".
function normalizarValor(index: number): void {
  const item = form.itens[index];
  if (!item) return;
  useCurrencyField(
    () => item.valorStr,
    (value) => {
      item.valorStr = value;
    }
  ).normalizar();
}
function onPasteValor(index: number, event: ClipboardEvent): void {
  const item = form.itens[index];
  if (!item) return;
  useCurrencyField(
    () => item.valorStr,
    (value) => {
      item.valorStr = value;
    }
  ).onPaste(event);
}

function submit(): void {
  const nomeGrupo = form.nomeGrupo.trim();
  if (!nomeGrupo) {
    emit("invalid", `Selecione o ${TIPO_GRUPO_PAGAMENTO_LABEL[props.tipo].toLowerCase()}.`);
    return;
  }

  form.itens.forEach((_, i) => normalizarValor(i));
  const itens = form.itens
    .map((i) => ({ paciente: i.pacienteStr.trim(), valor: parseBrCurrency(i.valorStr) }))
    .filter((i) => i.paciente && i.valor > 0);

  if (!itens.length) {
    emit("invalid", "Adicione ao menos um paciente com valor maior que zero.");
    return;
  }

  emit("submit", {
    data: props.data,
    empresa: props.empresa,
    nomeGrupo,
    chavePix: form.chavePix.trim() || undefined,
    itens,
  });
}
</script>

<template>
  <BaseModal id="novo-grupo-pagamento-overlay" @close="emit('close')">
    <div class="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-1 font-display text-[16px] font-semibold text-ink">
        Adicionar pagamento — {{ TIPO_GRUPO_PAGAMENTO_LABEL[tipo] }}
      </h2>
      <p class="mb-4 text-[12px] text-ink-soft">
        {{ EMPRESA_PAGAMENTO_LABEL[empresa] }} · o grupo inteiro é pago de uma vez.
      </p>

      <form id="form-novo-grupo-pagamento" class="flex flex-col gap-3" @submit.prevent="submit">
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          {{ TIPO_GRUPO_PAGAMENTO_LABEL[tipo] }}
          <AppSelect id="ng-nome-grupo" v-model="form.nomeGrupo" :options="grupoOptions" />
        </label>

        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Chave PIX (opcional)
          <div class="flex items-center gap-2">
            <input
              id="ng-chave-pix"
              v-model="form.chavePix"
              type="text"
              :readonly="!pixEditavel"
              class="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13px] text-ink read-only:text-ink-soft focus:bg-white focus:outline-2 focus:outline-accent-dark"
              @blur="onPixBlur"
            />
            <button
              v-if="!pixEditavel"
              id="ng-chave-pix-editar"
              type="button"
              class="shrink-0 rounded-md border border-hairline bg-paper px-2.5 py-2 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
              @click="pixEditavel = true"
            >
              Editar
            </button>
          </div>
        </label>

        <div class="flex flex-col gap-2">
          <div class="flex items-end gap-2">
            <span class="min-w-0 flex-1 text-[12px] font-semibold text-ink-soft">Paciente</span>
            <span class="w-[130px] text-[12px] font-semibold text-ink-soft">Valor</span>
            <span class="w-[34px] shrink-0"></span>
          </div>

          <div v-for="(item, index) in form.itens" :key="index" class="flex items-center gap-2">
            <input
              :id="`ng-item-paciente-${index}`"
              :value="item.pacienteStr"
              type="text"
              placeholder="Nome do paciente"
              class="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
              @input="(e) => onPacienteInput(index, e)"
            />
            <input
              :id="`ng-item-valor-${index}`"
              v-model="item.valorStr"
              type="text"
              inputmode="decimal"
              placeholder="0,00"
              class="w-[130px] rounded-md border border-hairline bg-paper px-2.5 py-2 text-right font-mono text-[13.5px] text-ink focus:bg-white focus:outline-2 focus:outline-accent-dark"
              @paste="(e) => onPasteValor(index, e)"
              @blur="() => normalizarValor(index)"
            />
            <button
              :id="`ng-item-remove-${index}`"
              type="button"
              title="Remover"
              aria-label="Remover paciente"
              class="w-[34px] shrink-0 rounded-md py-2 text-center text-ink-soft transition-colors hover:text-danger disabled:opacity-30"
              :disabled="form.itens.length === 1"
              @click="removeItem(index)"
            >
              ✕
            </button>
          </div>

          <button
            id="ng-add-item"
            type="button"
            class="self-start rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
            @click="addItem"
          >
            + Paciente
          </button>
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-cancel-novo-grupo"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-save-novo-grupo"
            type="submit"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
          >
            Adicionar
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
