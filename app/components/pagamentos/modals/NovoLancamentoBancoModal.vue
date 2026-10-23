<script setup lang="ts">
import { computed, reactive } from "vue";
import type {
  AtualizarLancamentoBancoDTO,
  EmpresaPagamento,
  LancamentoBanco,
  LoteBanco,
  Moeda,
  NovoLancamentoBancoDTO,
} from "#shared/types/Pagamento";
import { EMPRESA_PAGAMENTO_LABEL, FORNECEDORES_PAGAMENTO } from "#shared/constants/pagamentos";
import { parseBrCurrency } from "../../../utils/formatters";
import { useTitleCaseInput } from "../../../composables/useTitleCaseInput";
import { useOutroSentinel } from "../../../composables/useOutroSentinel";
import { initialCurrencyStr, useCurrencyField } from "../../../composables/useCurrencyField";
import AppSelect from "../../AppSelect.vue";
import BaseModal from "../../BaseModal.vue";
import SegmentedControl from "../../SegmentedControl.vue";
import { FORNECEDOR_PAGAMENTO_OPTIONS, MOEDA_OPTIONS } from "../../../utils/pagamentoOptions";
import { avisosDestinoNovoPagamento } from "../../../utils/pagamentoLoteDestino";
import { INPUT_CLASS, INPUT_MONO_CLASS, SELECT_CAMPO_CLASS } from "../../../utils/processoFormClasses";

const props = withDefaults(
  defineProps<{
    empresa: EmpresaPagamento;
    editing?: LancamentoBanco | null;
    // Lotes do Banco, só para os avisos informativos de destino (quem decide o
    // lote é o servidor: a moeda escolhida define o lote em aberto).
    lotes?: LoteBanco[];
  }>(),
  { editing: null, lotes: () => [] },
);

const emit = defineEmits<{
  submit: [payload: NovoLancamentoBancoDTO];
  update: [id: string, payload: AtualizarLancamentoBancoDTO];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editing !== null);

// Opções fixas (sem o sentinela "Outro") — usado só pra decidir se um fornecedor
// já salvo bate com uma das opções reais ao abrir o form em modo edição.
const FORNECEDORES_FIXOS = FORNECEDORES_PAGAMENTO.filter((f) => f !== "Outro");

const fornecedor = useOutroSentinel(FORNECEDORES_FIXOS);
fornecedor.load(props.editing?.fornecedor);

// valorMoeda fica como string no form — nunca usar type="number" + v-model
// (autocast silencioso já mordeu este projeto duas vezes).
const form = reactive({
  moeda: (props.editing?.moeda ?? "USD") as Moeda,
  invoice: props.editing?.invoice ?? "",
  cliente: props.editing?.cliente ?? "",
  valorMoedaStr: initialCurrencyStr(props.editing?.valorMoeda),
});

// Avisos só em criação: lote da moeda já cotado / mais de um lote da moeda em aberto.
const avisosDestino = computed<string[]>(() =>
  isEdit.value ? [] : avisosDestinoNovoPagamento(props.lotes, props.empresa, form.moeda),
);

// O valor costuma ser colado da PI em formatos variados ($8,550.00 / 20.680,00 /
// $9,835 …). Normaliza sempre pro formato BR "nn.nnn,nn".
const { normalizar: normalizarValor, onPaste: onPasteValor } = useCurrencyField(
  () => form.valorMoedaStr,
  (value) => {
    form.valorMoedaStr = value;
  }
);

// Cliente é nome próprio — capitaliza como nos outros formulários (Paciente).
const onClienteInput = useTitleCaseInput((value) => {
  form.cliente = value;
});

function submit(): void {
  normalizarValor();
  const fornecedorValue = fornecedor.build();
  const invoice = form.invoice.trim();
  const cliente = form.cliente.trim();
  const valorMoeda = parseBrCurrency(form.valorMoedaStr);

  if (!fornecedorValue) {
    emit("invalid", fornecedor.state.select === "Outro" ? "Informe o fornecedor." : "Selecione o fornecedor.");
    return;
  }
  if (!invoice || !cliente) {
    emit("invalid", "Preencha invoice e cliente.");
    return;
  }
  if (!(valorMoeda > 0)) {
    emit("invalid", "Informe um valor na moeda maior que zero.");
    return;
  }

  if (props.editing) {
    emit("update", props.editing.id, { fornecedor: fornecedorValue, invoice, cliente, valorMoeda });
    return;
  }

  emit("submit", {
    empresa: props.empresa,
    moeda: form.moeda,
    fornecedor: fornecedorValue,
    invoice,
    cliente,
    valorMoeda,
  });
}
</script>

<template>
  <BaseModal id="novo-lancamento-banco-overlay" @close="emit('close')">
    <div class="w-full max-w-[440px] rounded-[10px] border border-hairline bg-paper-raised p-5 max-lg:max-h-full max-lg:overflow-y-auto">
      <h2 class="mb-1 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? "Editar lançamento — Banco" : "Novo pagamento" }}
      </h2>
      <p class="mb-4 text-[12px] text-ink-soft">
        {{ EMPRESA_PAGAMENTO_LABEL[empresa] }}
        <template v-if="isEdit">· alterar o valor reabre a cotação do lote.</template>
      </p>

      <form id="form-novo-lancamento-banco" class="flex flex-col gap-3" @submit.prevent="submit">
        <div class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          <span aria-hidden="true">Moeda</span>
          <SegmentedControl id="nl-moeda" v-model="form.moeda" label="Moeda" :options="MOEDA_OPTIONS" :disabled="isEdit" />
        </div>

        <div
          id="nl-avisos-destino"
          role="status"
          aria-live="polite"
          class="flex-col gap-1.5"
          :class="avisosDestino.length ? 'flex' : 'hidden'"
        >
          <p
            v-for="(aviso, i) in avisosDestino"
            :id="`nl-aviso-destino-${i}`"
            :key="aviso"
            class="rounded-md bg-farm-blue-soft px-2.5 py-2 text-[12px] font-normal text-ink"
          >
            {{ aviso }}
          </p>
        </div>

        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Fornecedor
          <div :class="SELECT_CAMPO_CLASS">
            <AppSelect id="nl-fornecedor" v-model="fornecedor.state.select" :options="FORNECEDOR_PAGAMENTO_OPTIONS" />
          </div>
        </label>

        <label v-if="fornecedor.state.select === 'Outro'" class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Qual fornecedor?
          <input
            id="nl-fornecedor-outro"
            v-model="fornecedor.state.outroTexto"
            type="text"
            :class="INPUT_CLASS"
          />
        </label>

        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          Cliente
          <input
            id="nl-cliente"
            :value="form.cliente"
            type="text"
            :class="INPUT_CLASS"
            @input="onClienteInput"
          />
        </label>

        <div class="flex gap-3">
          <label class="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
            Invoice
            <input
              id="nl-invoice"
              v-model="form.invoice"
              type="text"
              :class="INPUT_CLASS"
            />
          </label>
          <label class="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
            Valor ({{ form.moeda }})
            <input
              id="nl-valor-moeda"
              v-model="form.valorMoedaStr"
              type="text"
              inputmode="decimal"
              placeholder="0,00"
              :class="[INPUT_MONO_CLASS, 'text-right']"
              @paste="onPasteValor"
              @blur="normalizarValor"
            />
          </label>
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-cancel-novo-lancamento"
            type="button"
            class="min-h-11 rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink lg:min-h-0"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-save-novo-lancamento"
            type="submit"
            class="min-h-11 rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 lg:min-h-0"
          >
            {{ isEdit ? "Salvar" : "Adicionar" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
