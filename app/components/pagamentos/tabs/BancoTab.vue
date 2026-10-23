<script setup lang="ts">
import { computed, ref } from "vue";
import type { BancoCambio, EmpresaPagamento, LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL, BANCOS_CAMBIO, MOEDA_SIMBOLO } from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import { calcularTotalReaisLote, formatFaixaTaxas, formatTaxa } from "../../../utils/pagamentoCalculations";
import { formatDataLote } from "../../../utils/pagamentoLoteDestino";
import { TITULO_CONFIRMAR_LOTE, mensagemConfirmarLote } from "../../../utils/pagamentoConfirmacao";
import type { PedidoPagamento } from "../../../composables/usePagamentoConfirmacao";
import { dataBrasiliaDe, formatarDataBR } from "#shared/utils/dataBrasilia";
import { normalizeText } from "../../../utils/search";
import AppSelect from "../../AppSelect.vue";
import type { AppSelectOption } from "../../../types/appSelect";
import { COLUNA_ACOES_CLASSES } from "../../../utils/pagamentoColunaAcoes";
import LancamentoBancoCard from "../cards/LancamentoBancoCard.vue";
import PagamentosFiltrosSheet from "../PagamentosFiltrosSheet.vue";

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
  // "+ Novo pagamento": abre o modal; a moeda escolhida lá define o lote.
  "novo-pagamento": [];
  "editar-lancamento": [lancamento: LancamentoBanco];
  "excluir-lancamento": [lancamento: LancamentoBanco];
  // "Pago": só PEDE a confirmação (a página abre a janela e, ao confirmar, chama o handler de sempre).
  "pedir-fechar-lote": [pedido: PedidoPagamento];
  "exportar-lote": [loteId: string];
  "editar-lancamento-realizado": [lancamento: LancamentoBanco, lote: LoteBanco];
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

// Abaixo de lg os 3 selects moram no bottom sheet (PagamentosFiltrosSheet), aberto pelo ícone
// dentro da busca; a bolinha do ícone conta só os filtros (banco e fornecedor), não a ordenação.
const showFiltros = ref(false);
const filtrosAtivos = computed<number>(() => [filtroBanco.value, filtroFornecedor.value].filter(Boolean).length);

function limparFiltros(): void {
  filtroBanco.value = "";
  filtroFornecedor.value = "";
  ordemRealizados.value = "recentes";
}

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

// Data em que o lote foi pago (dd/mm/aaaa) — cai na data do lote se faltar pagoEm.
function dataPagamentoLabel(lote: LoteBanco): string {
  return formatarDataBR(lote.pagoEm ? dataBrasiliaDe(lote.pagoEm) : lote.data);
}

// Título do card do lote em aberto: o banco escolhido (fallback enquanto não cotou).
function tituloLote(lote: LoteBanco): string {
  return lote.bancoEscolhido ? `Banco ${BANCO_CAMBIO_LABEL[lote.bancoEscolhido]}` : "Aguardando banco";
}

// Pedido de confirmação do "Pago": banco, data, quantidade e total R$ são os mesmos que o card já mostra.
function pedidoFecharLote(resumo: LoteResumo): PedidoPagamento {
  return {
    id: resumo.lote.id,
    titulo: TITULO_CONFIRMAR_LOTE,
    mensagem: mensagemConfirmarLote({
      titulo: tituloLote(resumo.lote),
      dataBR: formatarDataBR(resumo.lote.data),
      quantidade: resumo.lancamentos.length,
      totalReaisLabel: resumo.totalReais === null ? "—" : formatCurrency(resumo.totalReais),
    }),
  };
}
</script>

<template>
  <div id="banco-tab" class="flex flex-col gap-5">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pagamentos diários (em aberto)</h2>
        <button
          v-if="!readonly"
          id="btn-novo-pagamento-banco"
          type="button"
          class="hidden rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 lg:block"
          @click="emit('novo-pagamento')"
        >
          + Novo pagamento
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
        <!--
          Abaixo de lg (qualquer largura): grid de 2 colunas. Esquerda: linha 1 = título + selo de contagem; linha
          2 = data curta (DD/MM/AAAA), coladas (só o line-height entre elas) e o par centralizado na vertical pelas
          linhas 1fr de cima e de baixo. A altura é fixa (min-h 69px = 68 + a borda) e a MESMA com ou sem banco
          definido. Direita: coluna de largura única (COLUNA_ACOES_CLASSES, a mesma
          dos itens) na altura toda, com "Pago" (só com banco definido; célula azul suave, linha fina embaixo) na
          metade de cima e a câmera na de baixo; sem "Pago" a câmera ocupa a coluna inteira
          (centralizada). Em lg+ é uma única linha, com as divisórias, e o título leva a data longa,
          num span próprio (a variante oculta fica display:none).
        -->
        <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch border-b border-hairline max-lg:min-h-[69px] max-lg:grid-rows-[1fr_auto_auto_1fr] lg:flex lg:flex-nowrap lg:gap-0">
          <div class="col-start-1 row-start-2 flex min-w-0 items-center gap-2 pr-2 pl-3.5 lg:min-w-auto lg:flex-1 lg:pt-2.5 lg:pb-2.5">
            <span class="hidden min-w-0 font-display text-[14.5px] font-semibold text-ink lg:block">
              {{ tituloLote(resumo.lote) }} · {{ formatDataLote(resumo.lote.data) }}
            </span>
            <span class="min-w-0 font-display text-[14.5px] leading-tight font-semibold text-ink lg:hidden">{{ tituloLote(resumo.lote) }}</span>
            <span class="shrink-0 rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft max-lg:leading-4">
              {{ resumo.lancamentos.length }}
            </span>
          </div>
          <span class="col-start-1 row-start-3 ml-3.5 flex items-center font-mono text-[12px] leading-4 text-ink-soft lg:hidden">
            {{ formatarDataBR(resumo.lote.data) }}
          </span>
          <div class="col-start-2 row-span-4 row-start-1 flex flex-col-reverse lg:contents" :class="COLUNA_ACOES_CLASSES">
            <button
              :id="`btn-exportar-lote-${resumo.lote.id}`"
              type="button"
              title="Gerar foto do lote"
              aria-label="Gerar foto do lote"
              class="flex min-h-[34px] shrink-0 items-center justify-center text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark max-lg:flex-1 max-lg:focus-visible:outline-2 max-lg:focus-visible:-outline-offset-2 max-lg:focus-visible:outline-accent-dark lg:min-h-0 lg:justify-start lg:border-l lg:border-hairline lg:px-3"
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
              class="flex min-h-[34px] shrink-0 items-center justify-center bg-farm-blue-soft px-1 text-[12px] font-semibold text-accent-dark transition-colors hover:opacity-90 max-lg:basis-1/2 max-lg:border-b max-lg:border-hairline max-lg:focus-visible:outline-2 max-lg:focus-visible:-outline-offset-2 max-lg:focus-visible:outline-accent-dark lg:min-h-0 lg:justify-start lg:border-l lg:border-hairline lg:bg-accent-dark lg:px-4 lg:text-white"
              @click="emit('pedir-fechar-lote', pedidoFecharLote(resumo))"
            >
              Pago
            </button>
          </div>
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
              {{ resumo.lote.taxaEscolhida === null ? "—" : formatTaxa(resumo.lote.taxaEscolhida) }}
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

      <!-- Abaixo de lg: só a busca, com o ícone de filtros DENTRO dela (os selects vão pro painel).
           Em lg+ os selects voltam à linha e o ícone some, como sempre foi. -->
      <div class="mb-2.5 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div class="relative w-full lg:w-[240px]">
          <input
            id="banco-realizado-busca"
            v-model="buscaRealizados"
            type="text"
            placeholder="Buscar por cliente..."
            class="min-h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-[68px] text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:min-h-0 lg:pr-8"
          />
          <button
            v-if="buscaRealizados"
            id="btn-clear-banco-realizado-busca"
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            class="absolute top-1/2 right-11 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger lg:right-2"
            @click="buscaRealizados = ''"
          >
            ✕
          </button>
          <button
            id="btn-filtros-banco-realizado"
            type="button"
            title="Filtros"
            aria-label="Filtros"
            aria-haspopup="dialog"
            class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-accent-dark lg:hidden"
            @click="showFiltros = true"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
              />
            </svg>
            <span
              v-if="filtrosAtivos > 0"
              id="badge-filtros-banco-realizado"
              class="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-farm-blue px-1 text-[10px] font-semibold text-white"
            >
              {{ filtrosAtivos }}
            </span>
          </button>
        </div>
        <div class="hidden lg:block lg:w-[180px]">
          <AppSelect id="filtro-banco-realizado" v-model="filtroBanco" :options="bancoFilterOptions" />
        </div>
        <div class="hidden lg:block lg:w-[220px]">
          <AppSelect id="filtro-fornecedor-realizado" v-model="filtroFornecedor" :options="fornecedorFilterOptions" />
        </div>
        <div class="hidden lg:block lg:w-[200px]">
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
          :realizado-editavel="!readonly"
          @excluir="emit('excluir-lancamento', $event)"
          @editar-realizado="emit('editar-lancamento-realizado', r.lancamento, r.lote)"
        />
      </div>
    </section>

    <PagamentosFiltrosSheet v-if="showFiltros" id="banco-filtros-sheet" @close="showFiltros = false" @limpar="limparFiltros">
      <AppSelect id="sheet-filtro-banco-realizado" v-model="filtroBanco" :options="bancoFilterOptions" drop-up />
      <AppSelect id="sheet-filtro-fornecedor-realizado" v-model="filtroFornecedor" :options="fornecedorFilterOptions" drop-up />
      <AppSelect id="sheet-ordem-banco-realizado" v-model="ordemRealizados" :options="ordemFilterOptions" drop-up />
    </PagamentosFiltrosSheet>
  </div>
</template>
