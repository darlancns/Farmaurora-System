<script setup lang="ts">
import { computed } from "vue";
import type { LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import {
  BANCO_CAMBIO_LABEL,
  EMPRESA_PAGAMENTO_LABEL,
  MOEDA_SIMBOLO,
} from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import { calcularTotalReaisLote, formatFaixaTaxas } from "../../../utils/pagamentoCalculations";
import { EMPRESA_EXPORT_HEADER_CLASS, paisFornecedor } from "../../../utils/pagamentoExport";

const props = defineProps<{
  lote: LoteBanco;
  lancamentos: LancamentoBanco[];
  // Momento do clique no botão de exportar — o lote ainda está aberto aqui
  // (pagoEm é sempre null), então "hoje" é a melhor representação da
  // intenção real (gerar o recibo pra pagar agora).
  dataExibicao: Date;
}>();

// Sem banco escolhido: ainda não há taxa nem valor em reais, então o cartão
// mostra só o total na moeda (e o país do fornecedor em vez do nome).
const aguardando = computed<boolean>(() => props.lote.bancoEscolhido === null);
// Rendimento fechado "por ordem" (2+ pendentes): sem taxa única no lote. O
// fechamento direto com 1 pendente tem taxaEscolhida real e mostra a taxa como
// qualquer outro banco.
const rendimentoPorOrdem = computed<boolean>(
  () => props.lote.bancoEscolhido === "RENDIMENTO" && props.lote.taxaEscolhida === null,
);

const totalMoeda = computed<number>(() =>
  props.lancamentos.reduce((soma, l) => soma + l.valorMoeda, 0)
);
const totalReais = computed<number | null>(() =>
  calcularTotalReaisLote(props.lote, props.lancamentos)
);

const simbolo = computed<string>(() => MOEDA_SIMBOLO[props.lote.moeda]);

const titulo = computed<string>(() =>
  props.lote.bancoEscolhido ? `Banco ${BANCO_CAMBIO_LABEL[props.lote.bancoEscolhido]}` : "Aguardando banco"
);

// Rendimento por ordem → faixa "5,4000 – 5,4700". XP/Intex (e Rendimento com 1
// pendente) usam a taxa única do lote.
const taxaLabel = computed<string>(() => {
  if (aguardando.value) return "—";
  if (rendimentoPorOrdem.value) return formatFaixaTaxas(props.lancamentos) ?? "—";
  const taxa = props.lote.taxaEscolhida;
  return taxa === null ? "—" : taxa.toFixed(4).replace(".", ",");
});

const dataLabel = computed<string>(() =>
  props.dataExibicao.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
);

const ordensLabel = computed<string>(() =>
  props.lancamentos.length === 1 ? "1 ordem" : `${props.lancamentos.length} ordens`
);

// Linha de apoio sob o cliente: sem banco escolhido mostramos só o país; com
// banco definido, o fornecedor inteiro. null = nada a mostrar.
function subtituloLancamento(l: LancamentoBanco): string | null {
  if (aguardando.value) return paisFornecedor(l.fornecedor);
  return l.fornecedor.toLocaleUpperCase("pt-BR");
}

// Acima deste comprimento o nome não cabe em uma linha (o bloco do cliente tem
// ~299px e o texto roda a ~8px por caractere). Aí ele quebra em duas linhas e o
// subtítulo passa a fluir ao lado da última, em vez de ocupar uma linha própria
// e deixar esse espaço vago.
const LIMITE_NOME_UMA_LINHA = 36;

function nomeLongo(cliente: string): boolean {
  return cliente.length > LIMITE_NOME_UMA_LINHA;
}
</script>

<template>
  <div id="lote-export-card" class="w-[460px] bg-white font-sans text-ink">
    <div :class="EMPRESA_EXPORT_HEADER_CLASS[lote.empresa]" class="px-5 py-4 text-white">
      <div class="flex items-baseline justify-between gap-4">
        <p class="text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ EMPRESA_PAGAMENTO_LABEL[lote.empresa] }} · Pagamentos
        </p>
        <p class="shrink-0 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ dataLabel }}
        </p>
      </div>
      <div class="mt-1 flex items-baseline justify-between gap-4">
        <p class="whitespace-nowrap font-display text-[22px] font-semibold leading-tight">{{ titulo }}</p>
        <p class="shrink-0 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase opacity-80">
          {{ ordensLabel }}
        </p>
      </div>
    </div>

    <ul class="px-5 py-1">
      <li
        v-for="l in lancamentos"
        :key="l.id"
        class="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-b-0"
      >
        <span class="min-w-0 flex-1">
          <!-- Nome longo: nome e subtítulo no mesmo fluxo de texto, então o
               subtítulo preenche o vago ao lado da última linha do nome. -->
          <template v-if="nomeLongo(l.cliente)">
            <span class="text-[15.5px] font-medium text-ink">{{ l.cliente }}</span>
            <span v-if="subtituloLancamento(l)" class="ml-2 whitespace-nowrap text-[11.5px] text-ink-soft">
              {{ subtituloLancamento(l) }}
            </span>
          </template>
          <!-- Nome curto: layout de sempre, subtítulo em linha própria. -->
          <template v-else>
            <span class="block text-[15.5px] font-medium text-ink">{{ l.cliente }}</span>
            <span v-if="subtituloLancamento(l)" class="mt-0.5 block whitespace-nowrap text-[11.5px] text-ink-soft">
              {{ subtituloLancamento(l) }}
            </span>
          </template>
        </span>
        <span class="shrink-0 text-right">
          <span class="block whitespace-nowrap font-mono text-[13.5px] text-ink">{{ simbolo }} {{ formatCurrency(l.valorMoeda) }}</span>
          <span v-if="!aguardando" class="mt-0.5 block whitespace-nowrap font-mono text-[11.5px] text-ink-soft" :class="{ italic: l.valorReais === null }">
            {{ l.valorReais === null ? "Aguardando taxa" : `R$ ${formatCurrency(l.valorReais)}` }}
          </span>
        </span>
      </li>
    </ul>

    <div class="flex items-end justify-between gap-4 border-t-2 border-hairline px-5 py-3.5">
      <span class="shrink-0 text-[11.5px] text-ink-soft">
        TAXA<br /><span class="whitespace-nowrap font-mono text-[15px] text-ink">{{ taxaLabel }}</span>
      </span>
      <span class="shrink-0 text-right">
        <span
          class="block whitespace-nowrap"
          :class="aguardando ? 'font-display text-[20px] font-semibold text-ink' : 'text-[12px] text-ink-soft'"
        >
          Total {{ lote.moeda }}: {{ simbolo }} {{ formatCurrency(totalMoeda) }}
        </span>
        <span v-if="!aguardando" class="block whitespace-nowrap font-display text-[20px] font-semibold text-ink">
          Total R$: {{ totalReais === null ? "—" : `R$ ${formatCurrency(totalReais)}` }}
        </span>
      </span>
    </div>
  </div>
</template>
