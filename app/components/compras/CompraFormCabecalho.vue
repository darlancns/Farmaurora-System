<script setup lang="ts">
import { computed } from "vue";
import { tituloDaCompra } from "#shared/utils/compraMes";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";
import CompraSeloCancelada from "./CompraSeloCancelada.vue";

// O cabeçalho do formulário: "Compra 13 - Novembro/2026" (o mesmo texto do título do resumo) e o selo "Cancelada" (só quando é), numa linha SÓ
// que nunca quebra, com Duplicar e Cancelar lado a lado à direita (só quem edita; a compra cancelada não duplica nem cancela). Abaixo de lg o
// cabeçalho empilha ("‹ Compras" + título; e o menu "…" com Duplicar e Cancelar).
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

const emit = defineEmits<{ duplicar: []; cancelar: []; tentarDeNovo: []; voltar: [] }>();

const titulo = computed(() => tituloDaCompra(props.anoMes, props.sequencia));
const mostrarAcoes = computed(() => props.podeEditar && !props.cancelada);
const falhouDeVez = computed(() => props.estado === "erro" && props.esperandoClique === true);
const tentandoDeNovo = computed(() => props.estado === "erro" && props.esperandoClique !== true);

// O menu "…" do celular (o padrão de menu do app: ActionsMenu).
const itensDoMenu = computed<ActionsMenuItem[]>(() => [
  { id: "menu-duplicar-compra", label: "Duplicar compra", onClick: () => emit("duplicar") },
  { id: "menu-cancelar-compra", label: "Cancelar compra", danger: true, onClick: () => emit("cancelar") },
]);
</script>

<template>
  <div id="compra-cabecalho-bloco" class="flex flex-col gap-1.5">
    <header id="compra-cabecalho" class="flex flex-col gap-1.5 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-3">
      <div class="flex min-w-0 items-center gap-x-2 lg:flex-1">
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

      <div v-if="mostrarAcoes" class="flex shrink-0 flex-nowrap items-center gap-2">
        <button id="btn-duplicar-compra" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'whitespace-nowrap max-lg:hidden']" :disabled="ocupado" @click="emit('duplicar')">Duplicar compra</button>
        <button id="btn-cancelar-compra" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'whitespace-nowrap max-lg:hidden']" :disabled="ocupado" @click="emit('cancelar')">Cancelar compra</button>
        <ActionsMenu :items="itensDoMenu" trigger-id="btn-menu-compra" menu-id="menu-compra" aria-label="Mais ações da compra" :disabled="ocupado" itens-toque class="ml-auto lg:hidden" />
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
