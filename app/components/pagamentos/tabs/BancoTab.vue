<script setup lang="ts">
import { computed, ref } from "vue";
import type { BancoCambio, EmpresaPagamento, LancamentoBanco, LoteBanco, Moeda } from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL, BANCOS_CAMBIO, MOEDA_SIMBOLO } from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import { calcularTotalReaisLote, formatFaixaTaxas } from "../../../utils/pagamentoCalculations";
import { normalizeText } from "../../../utils/search";
import AppSelect from "../../AppSelect.vue";
import type { AppSelectOption } from "../../../types/appSelect";
import LancamentoBancoCard from "../cards/LancamentoBancoCard.vue";

const props = withDefaults(
  defineProps<{
    empresa: EmpresaPagamento;
    lotes: LoteBanco[];
    lancamentos: LancamentoBanco[];
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  // "+ Novo lote": abre o modal forçando um lote novo (a moeda é escolhida lá).
  "novo-lote": [];
  // "+ Lançamento" de um card: entra neste lote específico; a moeda vai travada.
  "novo-lancamento-lote": [loteId: string, moeda: Moeda];
  "editar-lancamento": [lancamento: LancamentoBanco];
  "excluir-lancamento": [lancamento: LancamentoBanco];
  "fechar-lote": [loteId: string];
  "exportar-lote": [loteId: string];
}>();

interface LoteResumo {
  lote: LoteBanco;
  lancamentos: LancamentoBanco[];
  totalMoeda: number;
  totalReais: number | null;
  // Faixa das taxas por ordem (só Rendimento) — "5,4000 – 5,4700". null p/ os demais.
  faixaTaxas: string | null;
}

function montarResumo(lote: LoteBanco): LoteResumo {
  const doLote = props.lancamentos.filter((l) => l.loteId === lote.id);
  const totalMoeda = doLote.reduce((s, l) => s + l.valorMoeda, 0);
  return {
    lote,
    lancamentos: doLote,
    totalMoeda,
    totalReais: calcularTotalReaisLote(lote, doLote),
    // Faixa só quando Rendimento fechou "por ordem" (2+): taxaEscolhida null.
    // Fechamento direto com 1 pendente tem taxaEscolhida real e é mostrado como XP/Intex.
    faixaTaxas:
      lote.bancoEscolhido === "RENDIMENTO" && lote.taxaEscolhida === null
        ? formatFaixaTaxas(doLote)
        : null,
  };
}

const lotesEmpresa = computed(() => props.lotes.filter((l) => l.empresa === props.empresa));

// Agrupa por moeda e, dentro dela, por numeroLote crescente — mesma ordem da aba
// Cotação, pra não intercalar USD/EUR nem embaralhar "Lote 1 / Lote 2".
const lotesAbertos = computed<LoteResumo[]>(() =>
  lotesEmpresa.value
    .filter((l) => !l.realizado)
    .sort((a, b) => a.moeda.localeCompare(b.moeda) || a.numeroLote - b.numeroLote)
    .map(montarResumo)
);

// ── Pagamentos realizados: lista plana por cliente + busca/filtros ──────────
interface LancamentoRealizado {
  lancamento: LancamentoBanco;
  lote: LoteBanco;
}

type OrdemRealizados = "recentes" | "antigos";

// Chave de data do pagamento (pagoEm, com fallback pra data do lote).
function chaveDataPagamento(r: LancamentoRealizado): string {
  return r.lote.pagoEm ?? `${r.lote.data}T00:00:00`;
}

const buscaRealizados = ref("");
const filtroBanco = ref<BancoCambio | "">("");
const filtroFornecedor = ref("");
const ordemRealizados = ref<OrdemRealizados>("recentes");

const lancamentosRealizados = computed<LancamentoRealizado[]>(() => {
  const lotesPorId = new Map(
    lotesEmpresa.value.filter((l) => l.realizado).map((l) => [l.id, l] as const)
  );
  const dir = ordemRealizados.value === "recentes" ? 1 : -1;
  return props.lancamentos
    .filter((l) => lotesPorId.has(l.loteId))
    .map((lancamento) => ({ lancamento, lote: lotesPorId.get(lancamento.loteId) as LoteBanco }))
    .sort((a, b) => {
      const porData = chaveDataPagamento(b).localeCompare(chaveDataPagamento(a)) * dir;
      if (porData !== 0) return porData;
      return b.lancamento.createdAt.localeCompare(a.lancamento.createdAt) * dir;
    });
});

const ordemFilterOptions: AppSelectOption<OrdemRealizados>[] = [
  { value: "recentes", label: "Mais recentes primeiro" },
  { value: "antigos", label: "Mais antigos primeiro" },
];

const bancoFilterOptions: AppSelectOption<BancoCambio | "">[] = [
  { value: "", label: "Todos os bancos" },
  ...BANCOS_CAMBIO.map((b) => ({ value: b, label: BANCO_CAMBIO_LABEL[b] })),
];

const fornecedorFilterOptions = computed<AppSelectOption<string>[]>(() => {
  const nomes = [...new Set(lancamentosRealizados.value.map((r) => r.lancamento.fornecedor))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  );
  return [{ value: "", label: "Todos os fornecedores" }, ...nomes.map((f) => ({ value: f, label: f }))];
});

const lancamentosRealizadosFiltrados = computed<LancamentoRealizado[]>(() => {
  const q = normalizeText(buscaRealizados.value);
  return lancamentosRealizados.value.filter((r) => {
    if (filtroBanco.value && r.lote.bancoEscolhido !== filtroBanco.value) return false;
    if (filtroFornecedor.value && r.lancamento.fornecedor !== filtroFornecedor.value) return false;
    if (q && !normalizeText(r.lancamento.cliente).includes(q)) return false;
    return true;
  });
});

function dataLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Data em que o lote foi pago (dd/mm/aaaa) — cai na data do lote se faltar pagoEm.
function dataPagamentoLabel(lote: LoteBanco): string {
  const iso = lote.pagoEm ?? `${lote.data}T00:00:00`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// Título do card do lote em aberto: o banco escolhido (fallback enquanto não cotou).
function tituloLote(lote: LoteBanco): string {
  return lote.bancoEscolhido ? `Banco ${BANCO_CAMBIO_LABEL[lote.bancoEscolhido]}` : "Aguardando banco";
}
</script>

<template>
  <div id="banco-tab" class="flex flex-col gap-5">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pagamentos diários (em aberto)</h2>
        <button
          v-if="!readonly"
          id="btn-novo-lote-banco"
          type="button"
          class="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
          @click="emit('novo-lote')"
        >
          + Novo lote
        </button>
      </div>

      <p
        v-if="!lotesAbertos.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum lançamento em aberto para {{ empresa }}.
      </p>

      <div
        v-for="resumo in lotesAbertos"
        :id="`lote-banco-${resumo.lote.id}`"
        :key="resumo.lote.id"
        class="mb-3 overflow-hidden rounded-lg border border-hairline bg-paper-raised"
      >
        <div class="flex w-full items-stretch border-b border-hairline">
          <div class="flex flex-1 items-center gap-2 py-2.5 pr-2 pl-3.5">
            <span class="font-display text-[14.5px] font-semibold text-ink">
              {{ tituloLote(resumo.lote) }} · {{ dataLabel(resumo.lote.data) }}
            </span>
            <span class="rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
              {{ resumo.lancamentos.length }}
            </span>
          </div>
          <button
            v-if="!readonly"
            :id="`btn-novo-lancamento-lote-${resumo.lote.id}`"
            type="button"
            class="flex shrink-0 items-center border-l border-hairline px-3 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark"
            @click="emit('novo-lancamento-lote', resumo.lote.id, resumo.lote.moeda)"
          >
            + Lançamento
          </button>
          <button
            :id="`btn-exportar-lote-${resumo.lote.id}`"
            type="button"
            title="Gerar foto do lote"
            aria-label="Gerar foto do lote"
            class="flex shrink-0 items-center border-l border-hairline px-3 text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark"
            @click="emit('exportar-lote', resumo.lote.id)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
          </button>
          <button
            v-if="resumo.lote.bancoEscolhido && !readonly"
            :id="`btn-pagar-lote-${resumo.lote.id}`"
            type="button"
            class="flex shrink-0 items-center border-l border-hairline bg-accent-dark px-4 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
            @click="emit('fechar-lote', resumo.lote.id)"
          >
            Pago
          </button>
        </div>

        <p v-if="!resumo.lancamentos.length" class="px-3.5 py-4 text-center text-[12.5px] text-ink-soft">
          Sem lançamentos neste lote ainda.
        </p>
        <LancamentoBancoCard
          v-for="lancamento in resumo.lancamentos"
          :key="lancamento.id"
          :lancamento="lancamento"
          :editavel="!readonly"
          :excluivel="!readonly"
          @editar="emit('editar-lancamento', $event)"
          @excluir="emit('excluir-lancamento', $event)"
        />

        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-hairline px-3.5 py-2.5 text-[12.5px]">
          <span class="text-ink-soft">
            Taxa:
            <template
              v-if="resumo.lote.bancoEscolhido === 'RENDIMENTO' && resumo.lote.taxaEscolhida === null"
            >
              <strong class="font-mono text-ink">por ordem</strong>
              <span v-if="resumo.faixaTaxas" class="mt-0.5 block font-mono text-[11px] text-ink-soft">
                {{ resumo.faixaTaxas }}
              </span>
            </template>
            <strong v-else class="font-mono text-ink">
              {{ resumo.lote.taxaEscolhida === null ? "—" : resumo.lote.taxaEscolhida.toFixed(4) }}
            </strong>
          </span>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span class="text-ink-soft">
              Total {{ resumo.lote.moeda }}:
              <strong class="font-mono text-ink">{{ MOEDA_SIMBOLO[resumo.lote.moeda] }} {{ formatCurrency(resumo.totalMoeda) }}</strong>
            </span>
            <span class="text-ink-soft">
              Total R$:
              <strong class="font-mono text-ink">
                {{ resumo.totalReais === null ? "—" : `R$ ${formatCurrency(resumo.totalReais)}` }}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pagamentos realizados</h2>

      <div class="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div class="relative w-[240px]">
          <input
            id="banco-realizado-busca"
            v-model="buscaRealizados"
            type="text"
            placeholder="Buscar por cliente..."
            class="w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-8 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
          <button
            v-if="buscaRealizados"
            id="btn-clear-banco-realizado-busca"
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            class="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger"
            @click="buscaRealizados = ''"
          >
            ✕
          </button>
        </div>
        <div class="w-[180px]">
          <AppSelect id="filtro-banco-realizado" v-model="filtroBanco" :options="bancoFilterOptions" />
        </div>
        <div class="w-[220px]">
          <AppSelect id="filtro-fornecedor-realizado" v-model="filtroFornecedor" :options="fornecedorFilterOptions" />
        </div>
        <div class="w-[200px]">
          <AppSelect id="ordem-banco-realizado" v-model="ordemRealizados" :options="ordemFilterOptions" />
        </div>
      </div>

      <p
        v-if="!lancamentosRealizados.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum lançamento pago ainda.
      </p>
      <p
        v-else-if="!lancamentosRealizadosFiltrados.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum pagamento encontrado com esses filtros.
      </p>
      <div
        v-else
        id="banco-realizados-lista"
        class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
      >
        <LancamentoBancoCard
          v-for="r in lancamentosRealizadosFiltrados"
          :key="r.lancamento.id"
          :lancamento="r.lancamento"
          :banco="r.lote.bancoEscolhido"
          :data-pagamento="dataPagamentoLabel(r.lote)"
          :excluivel="!readonly"
          @excluir="emit('excluir-lancamento', $event)"
        />
      </div>
    </section>
  </div>
</template>
