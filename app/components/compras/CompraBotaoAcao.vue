<script setup lang="ts">
import { computed } from "vue";
import { ICONES_COMPRA, type ChaveIconeCompra } from "../../utils/comprasIcones";

// O botão de ação do cabeçalho da compra: ÍCONE à esquerda e o texto CURTO ("Duplicar", "Cancelar", "Apagar"), no molde do "Excluir processo" do Follow-Up
// (ProcessoPainel): borda de 1px, cantos de 8, fundo do cartão, texto de 12,5px em negrito, ícone de 16px com traço de 1,75; 44px de altura abaixo de lg (alvo de
// toque) e 36px em lg+. O nome COMPLETO ("Duplicar compra") vai em aria-label e title (tooltip), e é ele que os leitores de tela leem.
// `perigo` é o estilo discreto de ação destrutiva (borda e texto avermelhados; só o fundo muda no hover) — o mesmo do "Excluir processo".
//
// SÓ ÍCONE quando falta largura: o texto some (sr-only, continua no aria-label) e o botão vira um quadrado (o mesmo 44px/36px do BOTAO_ICONE do Follow-Up). Quem decide
// é a largura do CONTÊINER (container query: o cabeçalho é um `@container`), não a da janela, porque a coluna do meio muda de largura com o tamanho da janela:
//  - abaixo de 20rem (320px) de coluna: só ícone;
//  - em lg+ com a coluna entre 28rem e 40rem (448 a 640px): só ícone, na mesma linha do título;
//  - fora disso: ícone + texto. (As faixas estão explicadas em CompraFormCabecalho.)
const props = defineProps<{ id: string; rotulo: string; nome: string; icone: ChaveIconeCompra; perigo?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ click: [] }>();

const caminhos = computed(() => ICONES_COMPRA[props.icone]);
const COR_NEUTRA = "border-hairline text-ink hover:bg-white";
const COR_PERIGO = "border-[#efd3cc] text-[#9a3828] hover:bg-[#fbeeea]";

// Só ícone: quadrado (44px abaixo de lg, 36px em lg+), sem o respiro lateral do texto.
const SO_ICONE_ESTREITO = "max-lg:@max-[20rem]:w-11 lg:@max-[20rem]:w-9 @max-[20rem]:justify-center @max-[20rem]:px-0";
const SO_ICONE_MEIO = "lg:@min-[28rem]:@max-[40rem]:w-9 lg:@min-[28rem]:@max-[40rem]:justify-center lg:@min-[28rem]:@max-[40rem]:px-0";
const TEXTO_SOME = "@max-[20rem]:sr-only lg:@min-[28rem]:@max-[40rem]:sr-only";
</script>

<template>
  <button
    :id="id"
    type="button"
    :disabled="disabled"
    :aria-label="nome"
    :title="nome"
    :data-icone="icone"
    :class="[
      'inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-paper-raised px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9',
      SO_ICONE_ESTREITO,
      SO_ICONE_MEIO,
      perigo ? COR_PERIGO : COR_NEUTRA,
    ]"
    @click="emit('click')"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-for="(d, i) in caminhos" :key="i" :d="d" />
    </svg>
    <span data-rotulo :class="TEXTO_SOME">{{ rotulo }}</span>
  </button>
</template>
