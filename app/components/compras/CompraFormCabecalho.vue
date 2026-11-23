<script setup lang="ts">
import { computed } from "vue";
import { tituloDaCompra } from "#shared/utils/compraMes";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import CompraBotaoAcao from "./CompraBotaoAcao.vue";
import CompraSeloCancelada from "./CompraSeloCancelada.vue";

// O cabeçalho do formulário: "Compra 13 - Novembro/2026" (o mesmo texto do título do resumo, com o mês da PRÓPRIA compra) e o selo "Cancelada" (só quando é),
// e à direita as três ações, nesta ordem, cada uma com o ícone à esquerda do texto (CompraBotaoAcao, o molde do "Excluir processo" do Follow-Up):
// [Duplicar compra] [Cancelar compra] [Apagar compra]. Só quem edita as vê (o sócio não); a compra cancelada não duplica nem cancela, mas pode ser apagada;
// quando outra pessoa apagou a compra aberta, nenhuma delas aparece. Em lg+ ficam na linha do título (e descem para uma 2ª linha, alinhadas à direita, se a
// coluna estiver estreita); abaixo de lg o cabeçalho empilha ("‹ Compras" + título; depois as ações, que quebram de linha se não couberem).
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
  <div id="compra-cabecalho-bloco" class="flex flex-col gap-1.5">
    <header id="compra-cabecalho" class="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-3 lg:gap-y-2">
      <div class="flex min-w-0 items-center gap-x-2 lg:flex-1 lg:basis-60">
        <button
          id="btn-voltar-lista"
          type="button"
          aria-label="Voltar para a lista de compras"
          class="-ml-1 flex min-h-11 shrink-0 items-center rounded-md px-1 text-[14px] font-semibold text-accent-dark hover:bg-paper focus-visible:outline-2 focus-visible:outline-accent-dark lg:hidden"
          @click="emit('voltar')"
        >
          ‹ Compras
        </button>
        <h2 id="compra-titulo" class="min-w-0 truncate font-display text-[20px] font-semibold whitespace-nowrap text-ink">{{ titulo }}</h2>
        <CompraSeloCancelada v-if="cancelada" />
      </div>

      <div v-if="mostrarAcoes" id="compra-acoes" class="flex flex-wrap items-center gap-2 lg:ml-auto lg:shrink-0 lg:flex-nowrap">
        <CompraBotaoAcao v-if="mostrarDuplicarECancelar" id="btn-duplicar-compra" icone="duplicar" rotulo="Duplicar compra" :disabled="ocupado" @click="emit('duplicar')" />
        <CompraBotaoAcao v-if="mostrarDuplicarECancelar" id="btn-cancelar-compra" icone="cancelar" rotulo="Cancelar compra" :disabled="ocupado" @click="emit('cancelar')" />
        <CompraBotaoAcao id="btn-apagar-compra" icone="apagar" rotulo="Apagar compra" perigo :disabled="ocupado" @click="emit('apagar')" />
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
