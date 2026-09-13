<script setup lang="ts">
import { computed, reactive } from "vue";
import type { LancamentoBanco, Moeda, TaxaLancamentoRendimento } from "#shared/types/Pagamento";
import { MOEDA_SIMBOLO } from "#shared/constants/pagamentos";
import { formatCurrency, parseBrCurrency } from "../../../utils/formatters";
import { taxasRendimentoCompletas } from "../../../utils/pagamentoCalculations";
import BaseModal from "../../BaseModal.vue";

// Fechamento POR ORDEM do Rendimento (regra 3): uma linha por lançamento pendente
// do lote, cada uma com a sua taxa. Confirmar só é liberado quando TODAS as
// linhas têm taxa (fechamento parcial não é permitido).
const props = withDefaults(
  defineProps<{
    loteId: string;
    moeda: Moeda;
    lancamentos: LancamentoBanco[]; // só os pendentes do lote
    corretagem: number; // corretagem do Rendimento — entra uma vez no total
    salvando?: boolean; // true enquanto aguarda a confirmação do servidor
    erro?: string | null; // mensagem de erro da última tentativa, se houve
  }>(),
  { salvando: false, erro: null },
);

const emit = defineEmits<{
  confirmar: [taxas: TaxaLancamentoRendimento[]];
  close: [];
}>();

// taxa digitada por lançamento (string do input; parse em runtime).
const taxaStr = reactive<Record<string, string>>({});

function parseTaxa(str: string | undefined): number | null {
  if (!str || !str.trim()) return null;
  const v = parseBrCurrency(str);
  return v > 0 ? v : null;
}

const simbolo = computed(() => MOEDA_SIMBOLO[props.moeda]);

const totalMoeda = computed(() => props.lancamentos.reduce((s, l) => s + l.valorMoeda, 0));

const taxasValidas = computed<TaxaLancamentoRendimento[]>(() =>
  props.lancamentos
    .map((l) => ({ lancamentoId: l.id, taxa: parseTaxa(taxaStr[l.id]) }))
    .filter((t): t is TaxaLancamentoRendimento => t.taxa !== null)
);

const completo = computed(() =>
  taxasRendimentoCompletas(
    props.lancamentos.map((l) => l.id),
    taxasValidas.value
  )
);

// Total R$ do lote = Σ (valorMoeda × taxa da linha) + corretagem do Rendimento.
const totalReais = computed(() => {
  const base = props.lancamentos.reduce((s, l) => {
    const t = parseTaxa(taxaStr[l.id]);
    return t === null ? s : s + l.valorMoeda * t;
  }, 0);
  return base + props.corretagem;
});

function confirmar(): void {
  if (!completo.value || props.salvando) return;
  emit("confirmar", taxasValidas.value);
}
</script>

<template>
  <BaseModal id="fechamento-rendimento-overlay" @close="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-[460px] flex-col rounded-[10px] border border-hairline bg-paper-raised">
      <div class="border-b border-hairline px-5 pt-5 pb-3">
        <h2 class="font-display text-[16px] font-semibold text-ink">Fechar pelo Rendimento</h2>
        <p class="mt-1 text-[12px] text-ink-soft">
          O Rendimento fecha cada ordem separadamente — informe a taxa de cada lançamento.
        </p>
      </div>

      <ul class="min-h-0 flex-1 overflow-y-auto px-5">
        <li
          v-for="l in lancamentos"
          :key="l.id"
          class="border-b border-hairline py-3 last:border-b-0"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="block truncate text-[13.5px] font-medium text-ink">{{ l.cliente }}</span>
              <span class="block truncate text-[11.5px] text-ink-soft">
                {{ l.fornecedor }} · Invoice {{ l.invoice }}
              </span>
            </div>
            <span class="shrink-0 font-mono text-[12.5px] text-ink">
              {{ simbolo }} {{ formatCurrency(l.valorMoeda) }}
            </span>
          </div>
          <label class="mt-1.5 flex items-center justify-end gap-2 text-[12px] text-ink-soft">
            <span>Taxa</span>
            <input
              :id="`fr-taxa-${l.id}`"
              v-model="taxaStr[l.id]"
              type="text"
              inputmode="decimal"
              placeholder="ex: 5,4231"
              class="w-[110px] rounded-md border border-hairline bg-paper px-2 py-1 text-right font-mono text-[12.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
          </label>
        </li>
      </ul>

      <div class="border-t border-hairline px-5 py-3 text-[12px]">
        <div class="flex items-center justify-between text-ink-soft">
          <span>Total {{ moeda }}</span>
          <span class="font-mono text-ink">{{ simbolo }} {{ formatCurrency(totalMoeda) }}</span>
        </div>
        <div class="flex items-center justify-between text-ink-soft">
          <span>Total R$</span>
          <span class="font-mono font-semibold text-ink">
            {{ completo ? `R$ ${formatCurrency(totalReais)}` : "—" }}
          </span>
        </div>
      </div>

      <p
        v-if="erro"
        id="fechamento-rendimento-erro"
        class="mx-5 mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] font-medium text-danger"
      >
        {{ erro }}
      </p>

      <div class="flex justify-end gap-2 border-t border-hairline px-5 py-3">
        <button
          id="btn-cancel-fechamento-rendimento"
          type="button"
          :disabled="salvando"
          class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          id="btn-confirmar-fechamento-rendimento"
          type="button"
          :disabled="!completo || salvando"
          class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmar"
        >
          {{ salvando ? "Salvando..." : "Usar este banco" }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
