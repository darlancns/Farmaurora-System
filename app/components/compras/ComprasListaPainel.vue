<script setup lang="ts">
import { computed, ref } from "vue";
import type { CompraDaLista, TotaisDaLista } from "#shared/types/compra";
import { BOTAO_PRIMARIO_CLASS } from "../../utils/comprasEstilos";
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
  /** Quem pode escrever em Compras: só ele vê "+ Nova compra". */
  podeEditar: boolean;
}>();

const emit = defineEmits<{
  anterior: [];
  proximo: [];
  mostrarCanceladas: [valor: boolean];
  selecionar: [id: string];
  nova: [];
  mostrarMais: [];
  recarregar: [];
}>();

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
