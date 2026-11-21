<script setup lang="ts">
import { computed } from "vue";
import { horaMinutoBrasilia, tituloDaCompra } from "#shared/utils/compraMes";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";
import CompraSeloCancelada from "./CompraSeloCancelada.vue";

// O cabeçalho do formulário: "Compra 13 - Novembro/2026" (o mesmo texto do título do resumo), o selo "Cancelada" (só quando é) e o
// texto do salvamento. Em lg+ os botões Duplicar e Cancelar ficam à direita (só quem edita; a compra cancelada não duplica nem cancela).
// ABAIXO de lg o cabeçalho vira duas linhas: "‹ Compras" + título + selo; e salvamento + o menu "…" (Duplicar e Cancelar).
//
// SALVAMENTO acessível: o texto fica numa região aria-live="polite" ("Salvando…", "Salvo…", "Tentando salvar de novo…"); só quando as
// tentativas acabam (esperandoClique) aparece o aviso role="alert" com o botão "Tentar de novo".
const props = defineProps<{
  anoMes: string;
  sequencia: number;
  cancelada: boolean;
  podeEditar: boolean;
  estado: EstadoSalvamento;
  salvoEm: Date | null;
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

const textoSalvamento = computed<string>(() => {
  switch (props.estado) {
    case "pendente":
    case "salvando":
      return "Salvando…";
    case "salvo":
      return props.salvoEm ? `Salvo automaticamente às ${horaMinutoBrasilia(props.salvoEm)}` : "Salvo automaticamente";
    case "conflito":
      return "Não salvo";
    case "erro":
      return props.esperandoClique ? "" : "Tentando salvar de novo…";
    default:
      return "";
  }
});

// O menu "…" do celular (o padrão de menu do app: ActionsMenu).
const itensDoMenu = computed<ActionsMenuItem[]>(() => [
  { id: "menu-duplicar-compra", label: "Duplicar compra", onClick: () => emit("duplicar") },
  { id: "menu-cancelar-compra", label: "Cancelar compra", danger: true, onClick: () => emit("cancelar") },
]);
</script>

<template>
  <header id="compra-cabecalho" class="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-2">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        id="btn-voltar-lista"
        type="button"
        aria-label="Voltar para a lista de compras"
        class="-ml-1 flex min-h-11 items-center rounded-md px-1 text-[14px] font-semibold text-accent-dark hover:bg-paper focus-visible:outline-2 focus-visible:outline-accent-dark lg:hidden"
        @click="emit('voltar')"
      >
        ‹ Compras
      </button>
      <h2 id="compra-titulo" class="font-display text-[20px] font-semibold text-ink">{{ titulo }}</h2>
      <CompraSeloCancelada v-if="cancelada" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div id="compra-salvamento-regiao" aria-live="polite" aria-atomic="true" class="min-w-0">
        <span v-if="textoSalvamento" id="compra-salvamento" class="text-[12px] text-ink-soft">{{ textoSalvamento }}</span>
        <span v-if="falhouDeVez" id="compra-salvamento-alerta" role="alert">
          <button id="compra-salvamento-erro" type="button" :title="mensagemErro ?? undefined" class="min-h-11 text-[12px] font-semibold text-danger underline lg:min-h-0" @click="emit('tentarDeNovo')">
            Não foi possível salvar. Tentar de novo
          </button>
        </span>
      </div>

      <template v-if="mostrarAcoes">
        <button id="btn-duplicar-compra" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'max-lg:hidden']" :disabled="ocupado" @click="emit('duplicar')">Duplicar compra</button>
        <button id="btn-cancelar-compra" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'max-lg:hidden']" :disabled="ocupado" @click="emit('cancelar')">Cancelar compra</button>
        <ActionsMenu :items="itensDoMenu" trigger-id="btn-menu-compra" menu-id="menu-compra" aria-label="Mais ações da compra" :disabled="ocupado" itens-toque class="ml-auto lg:hidden" />
      </template>
    </div>
  </header>
</template>
