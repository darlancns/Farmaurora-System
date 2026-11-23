<script setup lang="ts">
import { computed, ref } from "vue";
import type { CompraDaLista, TotaisDaLista } from "#shared/types/compra";
import type { OrdemDaLista } from "#shared/utils/compraLista";
import type { AppSelectOption } from "../../types/appSelect";
import { BOTAO_PRIMARIO_CLASS } from "../../utils/comprasEstilos";
import SegmentedControl from "../SegmentedControl.vue";
import CadastroSwitch from "../configuracoes/CadastroSwitch.vue";
import CompraCartao from "./CompraCartao.vue";
import ComprasMesSeletor from "./ComprasMesSeletor.vue";

// O painel esquerdo da página Compras: "compras do mês". Só desenha e avisa (eventos); o mês, "Mostrar canceladas", os totais {ativas, canceladas} e o "mostrar mais"
// vêm de useComprasMes e a página decide o que fazer (inclusive esperar o salvamento pendente antes de trocar de compra ou de mês).
//
// Teclado: seta para baixo/cima move o foco entre os cartões; Enter (ou Espaço) no cartão focado abre a compra — cada cartão é um
// <button>, então o Enter já é do navegador.
const props = defineProps<{
  rotuloMes: string;
  totalDoMes: number;
  compras: CompraDaLista[];
  totais: TotaisDaLista;
  /** Quantas compras casam com o filtro (o "M" de "N de M"). */
  total: number;
  temMais: boolean;
  mostrarCanceladas: boolean;
  selecionadaId: string | null;
  carregando: boolean;
  carregandoMais?: boolean;
  erro: string | null;
  /** A visão da lista: "Mais recentes" ou "Por número" (e, nesta, o sentido). */
  ordem: OrdemDaLista;
  inverter: boolean;
  /** Quem pode escrever em Compras: só ele vê "+ Nova compra". */
  podeEditar: boolean;
}>();

const emit = defineEmits<{
  anterior: [];
  proximo: [];
  mostrarCanceladas: [valor: boolean];
  ordem: [ordem: OrdemDaLista];
  inverter: [];
  selecionar: [id: string];
  nova: [];
  mostrarMais: [];
  recarregar: [];
}>();

const OPCOES_ORDEM: AppSelectOption<OrdemDaLista>[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "numero", label: "Por número" },
];

const descricaoDoSentido = computed(() => (props.inverter ? "do menor para o maior" : "do maior para o menor"));

const listaRef = ref<HTMLElement | null>(null);

const vazio = computed(() => !props.carregando && !props.erro && props.compras.length === 0);

function moverFoco(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const cartoes = [...(listaRef.value?.querySelectorAll<HTMLButtonElement>("[data-compra-cartao]") ?? [])];
  if (cartoes.length === 0) return;
  event.preventDefault();
  const atual = cartoes.findIndex((c) => c === document.activeElement);
  const destino = event.key === "ArrowDown" ? (atual === -1 ? 0 : Math.min(cartoes.length - 1, atual + 1)) : atual === -1 ? cartoes.length - 1 : Math.max(0, atual - 1);
  cartoes[destino]?.focus();
}
</script>

<template>
  <section id="compras-lista" aria-label="Compras do mês" class="flex min-h-0 flex-col gap-3">
    <ComprasMesSeletor :rotulo="rotuloMes" :total-do-mes="totalDoMes" @anterior="emit('anterior')" @proximo="emit('proximo')" />

    <button v-if="podeEditar" id="btn-nova-compra" type="button" :class="BOTAO_PRIMARIO_CLASS" @click="emit('nova')">+ Nova compra</button>

    <!-- As duas visões da lista: "Mais recentes" (a que foi mexida por último primeiro; o padrão) e "Por número" (do maior para o menor, com o botão que inverte). -->
    <div id="compras-ordem-barra" class="flex items-stretch gap-2">
      <SegmentedControl
        id="compras-ordem"
        class="min-w-0 flex-1"
        label="Ordem da lista"
        :model-value="ordem"
        :options="OPCOES_ORDEM"
        @update:model-value="(valor: OrdemDaLista) => emit('ordem', valor)"
      />
      <button
        v-if="ordem === 'numero'"
        id="compras-ordem-inverter"
        type="button"
        :aria-label="`Inverter a ordem (agora ${descricaoDoSentido})`"
        :title="`Agora ${descricaoDoSentido}. Clique para inverter.`"
        :aria-pressed="inverter ? 'true' : 'false'"
        class="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border border-hairline bg-paper-raised text-ink-soft transition-colors hover:bg-white lg:min-h-9 lg:w-9"
        @click="emit('inverter')"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 transition-transform" :class="inverter ? 'rotate-180' : ''" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M6 13l6 6 6-6" />
        </svg>
      </button>
    </div>

    <label class="flex items-center gap-1 text-[12px] text-ink-soft">
      <CadastroSwitch
        id="compras-mostrar-canceladas"
        :model-value="mostrarCanceladas"
        label="Mostrar canceladas"
        @alternar="(valor: boolean) => emit('mostrarCanceladas', valor)"
      />
      <span>Mostrar canceladas ({{ totais.canceladas }})</span>
    </label>

    <p v-if="erro" id="compras-lista-erro" role="alert" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      Não foi possível carregar as compras.
      <button type="button" class="font-semibold underline" @click="emit('recarregar')">Tentar de novo</button>
    </p>

    <p v-if="carregando && compras.length === 0" id="compras-lista-carregando" class="px-1 text-[13px] text-ink-soft" role="status">Carregando…</p>

    <!-- Sem botão aqui: o "+ Nova compra" do topo da coluna basta. -->
    <div v-if="vazio" id="compras-lista-vazia" class="rounded-lg border border-hairline bg-paper-raised px-4 py-5">
      <p class="text-[13px] text-ink-soft">Nenhuma compra neste mês.</p>
    </div>

    <ul v-if="compras.length > 0" id="compras-cartoes" ref="listaRef" class="flex min-h-0 flex-col gap-2" @keydown="moverFoco">
      <li v-for="compra in compras" :key="compra.id">
        <CompraCartao :compra="compra" :selecionada="compra.id === selecionadaId" @selecionar="(id: string) => emit('selecionar', id)" />
      </li>
    </ul>

    <button
      v-if="temMais"
      id="compras-mostrar-mais"
      type="button"
      :disabled="carregandoMais"
      class="rounded-lg border border-hairline bg-paper px-4 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-white disabled:opacity-60"
      @click="emit('mostrarMais')"
    >
      Mostrar mais ({{ compras.length }} de {{ total }})
    </button>
  </section>
</template>
