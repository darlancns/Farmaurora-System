<script setup lang="ts">
import { computed } from "vue";
import { tituloDaCompra } from "#shared/utils/compraMes";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import CompraBotaoAcao from "./CompraBotaoAcao.vue";
import CompraSeloCancelada from "./CompraSeloCancelada.vue";

// O cabeçalho do formulário: "Compra 13 - Novembro/2026" (o mesmo texto do título do resumo, com o mês da PRÓPRIA compra) e o selo "Cancelada" (só quando é),
// e à direita as três ações, nesta ordem, cada uma com o ícone à esquerda do texto CURTO (CompraBotaoAcao, o molde do "Excluir processo" do Follow-Up):
// [Duplicar] [Cancelar] [Apagar] (o nome completo, "Duplicar compra"..., fica em aria-label e title). Só quem edita as vê (o sócio não); a compra cancelada não
// duplica nem cancela, mas pode ser apagada; quando outra pessoa apagou a compra aberta, nenhuma delas aparece.
//
// O ENCAIXE depende da LARGURA DA COLUNA (container query: #compra-cabecalho-bloco é um `@container`), não da janela, porque a coluna do meio mede
// aproximadamente (largura da janela - 1052px) em lg+ (barra lateral 192 + margens 48 + colunas de 320 e 460 + 2 vãos de 16) e a página inteira vira uma coluna abaixo de lg:
//  - lg+ e coluna >= 40rem (640px): título à esquerda e os três botões (ícone + texto curto) à direita, NA MESMA LINHA; (janela de uns 1700px para cima)
//  - lg+ e coluna de 28rem a 40rem (448 a 640px): a mesma linha, mas os botões só com o ícone (quadrados de 36px); (janela de uns 1500 a 1700px)
//  - lg+ e coluna < 28rem (448px): o título numa linha e os botões numa linha PRÓPRIA, alinhada à direita; com texto se a coluna tiver 20rem (320px) ou mais
//    (janela de uns 1370 a 1500px) e só ícone abaixo disso (janela abaixo de uns 1370px: em 1280px a coluna mede ~228px e o título, de 16px, pode ocupar 2 linhas);
//  - abaixo de lg (celular e tablet, a coluna é a página toda): "‹ Compras" e o título numa linha e os botões numa linha própria, à direita (com texto a partir
//    de 320px de coluna, ou seja, num celular de 375px; só ícone em telas mais estreitas, como 360px).
//
// NÃO há texto de "salvo automaticamente": o estado normal não mostra nada. SÓ quando há problema aparece uma linha ABAIXO do cabeçalho (fora do
// flex do título), numa região aria-live="polite": "Tentando salvar de novo…" enquanto as tentativas automáticas correm; e, quando elas acabam
// (esperandoClique), o aviso role="alert" com o botão "Não foi possível salvar. Tentar de novo". O conflito de versão (409) tem a própria faixa
// (CompraFaixaConflito). O estado também fica em `data-salvamento` no formulário (para teste), sem texto na tela.
const props = defineProps<{
  anoMes: string;
  sequencia: number;
  cancelada: boolean;
  podeEditar: boolean;
  estado: EstadoSalvamento;
  /** Acabaram as tentativas automáticas (ou o servidor recusou): só o clique salva de novo. */
  esperandoClique?: boolean;
  /** Mensagem do servidor quando ele recusou o salvamento (opcional, vai de dica no botão de erro). */
  mensagemErro?: string | null;
  ocupado?: boolean;
}>();

const emit = defineEmits<{ duplicar: []; cancelar: []; apagar: []; tentarDeNovo: []; voltar: [] }>();

const titulo = computed(() => tituloDaCompra(props.anoMes, props.sequencia));
/** Alguma ação: só quem edita, e não quando outra pessoa já apagou a compra. */
const mostrarAcoes = computed(() => props.podeEditar && props.estado !== "apagada");
/** Duplicar e Cancelar: a compra cancelada não faz nenhuma das duas. */
const mostrarDuplicarECancelar = computed(() => mostrarAcoes.value && !props.cancelada);
const falhouDeVez = computed(() => props.estado === "erro" && props.esperandoClique === true);
const tentandoDeNovo = computed(() => props.estado === "erro" && props.esperandoClique !== true);
</script>

<template>
  <div id="compra-cabecalho-bloco" class="@container flex flex-col gap-1.5">
    <header id="compra-cabecalho" class="flex flex-col gap-1.5 lg:@min-[28rem]:flex-row lg:@min-[28rem]:items-center lg:@min-[28rem]:justify-between lg:@min-[28rem]:gap-3">
      <div id="compra-cabecalho-titulo" class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:@min-[28rem]:flex-1">
        <button
          id="btn-voltar-lista"
          type="button"
          aria-label="Voltar para a lista de compras"
          class="-ml-1 flex min-h-11 shrink-0 items-center rounded-md px-1 text-[14px] font-semibold text-accent-dark hover:bg-paper focus-visible:outline-2 focus-visible:outline-accent-dark lg:hidden"
          @click="emit('voltar')"
        >
          ‹ Compras
        </button>
        <h2 id="compra-titulo" :title="titulo" class="min-w-0 font-display text-[20px] font-semibold whitespace-nowrap text-ink @max-[20rem]:text-[16px] @max-[20rem]:leading-snug @max-[20rem]:whitespace-normal">{{ titulo }}</h2>
        <CompraSeloCancelada v-if="cancelada" />
      </div>

      <div v-if="mostrarAcoes" id="compra-acoes" class="flex flex-wrap items-center justify-end gap-2 lg:@min-[28rem]:shrink-0 lg:@min-[28rem]:flex-nowrap">
        <CompraBotaoAcao v-if="mostrarDuplicarECancelar" id="btn-duplicar-compra" icone="duplicar" rotulo="Duplicar" nome="Duplicar compra" :disabled="ocupado" @click="emit('duplicar')" />
        <CompraBotaoAcao v-if="mostrarDuplicarECancelar" id="btn-cancelar-compra" icone="cancelar" rotulo="Cancelar" nome="Cancelar compra" :disabled="ocupado" @click="emit('cancelar')" />
        <CompraBotaoAcao id="btn-apagar-compra" icone="apagar" rotulo="Apagar" nome="Apagar compra" perigo :disabled="ocupado" @click="emit('apagar')" />
      </div>
    </header>

    <!-- Só quando há problema (fora do cabeçalho): região aria-live sempre presente e vazia no estado normal. -->
    <div id="compra-salvamento-regiao" aria-live="polite" aria-atomic="true" class="min-w-0 empty:hidden">
      <span v-if="tentandoDeNovo" id="compra-salvamento" class="text-[12px] text-ink-soft">Tentando salvar de novo…</span>
      <span v-if="falhouDeVez" id="compra-salvamento-alerta" role="alert">
        <button id="compra-salvamento-erro" type="button" :title="mensagemErro ?? undefined" class="min-h-11 text-[12px] font-semibold text-danger underline lg:min-h-0" @click="emit('tentarDeNovo')">
          Não foi possível salvar. Tentar de novo
        </button>
      </span>
    </div>
  </div>
</template>
