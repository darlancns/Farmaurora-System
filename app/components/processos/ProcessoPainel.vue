<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { metaDoStatus } from "../../utils/processoStatus";
import ProcessoMoverMenu from "./ProcessoMoverMenu.vue";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";
import {
  camposDatas,
  focaveis,
  haModalAberto,
  linhaTransportadora,
  linhasMedicamentos,
  mostraDespachanteTransportadora,
} from "../../utils/processoPainel";
import { remessaVisivelNaLinha, type ContagemPorPasta } from "../../utils/remessaNaLinha";
import ConfirmDialog from "../ConfirmDialog.vue";
import ProcessoAtualizacoes from "./ProcessoAtualizacoes.vue";

// Painel lateral do Kanban (só para quem pode editar processos; quem decide é a página). Desktop: à direita, 480px,
// sobre um overlay bg-ink/40 que cobre o quadro; abaixo de lg, tela cheia. z-index 880: ABAIXO do BaseModal (900),
// para o formulário de edição e os ConfirmDialog ficarem por cima, e acima do BottomNav (40), do botão flutuante
// (30) e do menu da conta (60). O toast (999) segue por cima de tudo.
//
// `processo` deve ser o objeto REATIVO do store (a página o busca por id em useProcessos().processos): assim, ao
// salvar no formulário ou nas atualizações, o painel mostra o processo atualizado sem reabrir.
const props = withDefaults(
  defineProps<{
    processo: Processo;
    contagemPasta?: ContagemPorPasta;
    // A mudança de coluna deste processo está gravando (o menu some e aparece "Movendo…").
    movendo?: boolean;
  }>(),
  { contagemPasta: () => new Map(), movendo: false },
);

const emit = defineEmits<{
  close: [];
  edit: [processo: Processo];
  delete: [id: string];
  // "Mover para…": só pede; a página confirma e grava (o mesmo fluxo do arrastar).
  mover: [processo: Processo, para: StatusProcesso];
}>();

const statusMeta = computed(() => metaDoStatus(props.processo.status));

const painelRef = ref<HTMLElement | null>(null);
const showDeleteConfirm = ref(false);

const mostrarOrdem = computed(() => remessaVisivelNaLinha(props.processo, props.contagemPasta));
const pastaPo = computed(() =>
  props.processo.numeroPo ? `Pasta ${props.processo.pasta} · ${props.processo.numeroPo}` : `Pasta ${props.processo.pasta}`,
);
const linhaOrdemResponsavel = computed(() =>
  [
    mostrarOrdem.value ? `Ordem ${props.processo.numeroRemessa}` : "",
    props.processo.responsavelOperacional ? `Responsável ${props.processo.responsavelOperacional}` : "",
  ]
    .filter(Boolean)
    .join(" · "),
);
const medicamentos = computed(() => linhasMedicamentos(props.processo.medicamentos));
const comDespachanteTransportadora = computed(() => mostraDespachanteTransportadora(props.processo));
const transportadora = computed(() => linhaTransportadora(props.processo));
const datas = computed(() => camposDatas(props.processo));
const deleteConfirmMessage = computed(
  () => `Excluir o processo de ${props.processo.paciente}? Essa ação não pode ser desfeita.`,
);

// ── Fechar (X, Esc, overlay) e foco ─────────────────────────────────────────────────────────────────
// Esc fecha o painel só se nada estiver por cima (formulário ou ConfirmDialog = BaseModal) e se ninguém já tratou a
// tecla (ex.: a edição inline de uma atualização faz stop/preventDefault no próprio Esc).
useEscapeToClose((event) => {
  if (event.defaultPrevented || showDeleteConfirm.value || haModalAberto()) return;
  emit("close");
});
useLockBodyScroll();

// Foco: entra no painel (botão fechar) e, ao fechar, volta para onde estava (o card, que é o controle); se esse
// elemento sumiu (ex.: aberto por ?processo= sem clique), volta para o card pelo id.
let origemFoco: HTMLElement | null = null;
const idProcesso = props.processo.id;

onMounted(() => {
  origemFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void nextTick(() => document.getElementById("btn-painel-fechar")?.focus());
});

onBeforeUnmount(() => {
  const destino =
    origemFoco && origemFoco.isConnected && origemFoco !== document.body
      ? origemFoco
      : document.getElementById(`processo-card-${idProcesso}`);
  // depois de desmontar (o painel some do DOM antes de o foco ir ao card)
  setTimeout(() => destino?.focus(), 0);
});

// Foco preso: Tab no último focável volta ao primeiro, Shift+Tab no primeiro vai ao último.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !painelRef.value) return;
  const lista = focaveis(painelRef.value);
  const primeiro = lista[0];
  const ultimo = lista[lista.length - 1];
  if (!primeiro || !ultimo) {
    event.preventDefault();
    return;
  }
  const ativo = document.activeElement;
  if (event.shiftKey && (ativo === primeiro || !painelRef.value.contains(ativo))) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && (ativo === ultimo || !painelRef.value.contains(ativo))) {
    event.preventDefault();
    primeiro.focus();
  }
}

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  emit("delete", props.processo.id);
}

const ROTULO = "text-[11px] text-ink-soft";
const VALOR = "text-[13px] text-ink break-words";
const BLOCO = "border-b border-hairline px-5 py-4";
</script>

<template>
  <div
    id="processo-painel-overlay"
    class="fixed inset-0 z-[880] flex justify-end bg-ink/40"
    @click.self="emit('close')"
  >
    <aside
      :id="`processo-painel-${processo.id}`"
      ref="painelRef"
      data-testid="processo-painel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="painel-titulo"
      class="flex h-dvh w-full max-w-[100vw] flex-col overflow-y-auto overscroll-contain bg-paper-raised lg:w-[480px] lg:border-l lg:border-hairline"
      @keydown="onKeydown"
    >
      <!-- 1. Cabeçalho: ícone, nome, editar e fechar; embaixo, a etiqueta do status atual e o "Mover para…". -->
      <!-- sticky: o botão de fechar (e o editar/mover) fica sempre visível ao rolar, também em tela cheia no celular. -->
      <header id="painel-bloco-cabecalho" :class="BLOCO" class="sticky top-0 z-10 flex flex-col gap-2.5 bg-paper-raised">
      <div class="flex items-center gap-3">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-farm-blue-soft text-accent-dark"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </span>
        <h2 id="painel-titulo" class="min-w-0 flex-1 font-display text-[16px] font-semibold break-words text-ink">
          {{ processo.paciente }}
        </h2>
        <button
          id="btn-painel-editar"
          type="button"
          title="Editar processo"
          aria-label="Editar processo"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-accent-dark lg:h-8 lg:w-8"
          @click="emit('edit', processo)"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
            />
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
          </svg>
        </button>
        <button
          id="btn-painel-fechar"
          type="button"
          title="Fechar"
          aria-label="Fechar painel"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-danger lg:h-8 lg:w-8"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2 pl-[52px]">
        <span
          id="painel-status"
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="statusMeta.badgeClass"
          >{{ statusMeta.label }}</span
        >
        <span v-if="movendo" id="painel-movendo" class="text-[12px] font-semibold text-accent-dark">Movendo…</span>
        <ProcessoMoverMenu
          v-else
          :processo="processo"
          @mover="(para) => emit('mover', processo, para)"
        />
      </div>
      </header>

      <!-- 2. Pasta · PO; Ordem N (só quando N > 1 ou pasta repetida, como na Lista) · Responsável -->
      <section id="painel-bloco-pasta" :class="BLOCO">
        <p id="painel-pasta-po" class="font-mono text-[13px] break-all text-ink">{{ pastaPo }}</p>
        <p v-if="linhaOrdemResponsavel" id="painel-ordem-responsavel" class="mt-1 text-[12px] text-ink-soft">
          {{ linhaOrdemResponsavel }}
        </p>
      </section>

      <!-- 3. Medicamento(s) -->
      <section id="painel-bloco-medicamentos" :class="BLOCO">
        <p :class="ROTULO">{{ medicamentos.length > 1 ? "Medicamentos" : "Medicamento" }}</p>
        <ul v-if="medicamentos.length" class="mt-1 flex flex-col gap-0.5">
          <li v-for="(linha, i) in medicamentos" :key="i" :class="VALOR">{{ linha }}</li>
        </ul>
        <p v-else class="mt-1" :class="VALOR">—</p>
      </section>

      <!-- 4. Fornecedor · Envio -->
      <section id="painel-bloco-fornecedor" :class="BLOCO" class="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p :class="ROTULO">Fornecedor</p>
          <p id="painel-fornecedor" :class="VALOR">{{ processo.fornecedor || "—" }}</p>
        </div>
        <div>
          <p :class="ROTULO">Envio</p>
          <p id="painel-envio" :class="VALOR">{{ processo.modalEnvio || "—" }}</p>
        </div>
      </section>

      <!-- 5. Cia. aérea · Nº AWB · Despachante (Despachante some no Courier Simples, como no formulário) -->
      <section id="painel-bloco-envio" :class="BLOCO" class="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p :class="ROTULO">Cia. aérea</p>
          <p id="painel-cia" :class="VALOR">{{ processo.companhiaAerea || "—" }}</p>
        </div>
        <div>
          <p :class="ROTULO">Nº AWB</p>
          <p id="painel-awb" class="font-mono" :class="VALOR">{{ processo.numeroAwb || "—" }}</p>
        </div>
        <div v-if="comDespachanteTransportadora" class="col-span-2">
          <p :class="ROTULO">Despachante</p>
          <p id="painel-despachante" :class="VALOR">{{ processo.despachante || "—" }}</p>
        </div>
      </section>

      <!-- 6. Transportadora (nome · cotação · valor; some no Courier Simples) · Local de entrega -->
      <section id="painel-bloco-transportadora" :class="BLOCO" class="flex flex-col gap-3">
        <div v-if="comDespachanteTransportadora">
          <p :class="ROTULO">Transportadora</p>
          <p id="painel-transportadora" :class="VALOR">{{ transportadora || "—" }}</p>
        </div>
        <div>
          <p :class="ROTULO">Local de entrega</p>
          <p id="painel-local-entrega" :class="VALOR">{{ processo.localEntrega || "—" }}</p>
        </div>
      </section>

      <!-- 7. Nº do processo -->
      <section id="painel-bloco-numero-processo" :class="BLOCO">
        <p :class="ROTULO">Nº do processo</p>
        <p id="painel-numero-processo" class="font-mono break-all" :class="VALOR">{{ processo.numeroProcesso || "—" }}</p>
      </section>

      <!-- 8. Datas (texto livre como está no banco, inclusive observações antigas) -->
      <section id="painel-bloco-datas" :class="BLOCO">
        <p class="mb-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Datas</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-3">
          <div v-for="campo in datas" :key="campo.id" :class="{ 'col-span-2': campo.larguraTotal }">
            <p :class="ROTULO">{{ campo.rotulo }}</p>
            <p
              :id="`painel-${campo.id}`"
              class="text-[13px] break-words"
              :class="campo.destaque && campo.valor ? 'font-semibold text-accent-dark' : 'text-ink'"
            >
              {{ campo.valor || "—" }}
            </p>
          </div>
        </div>
      </section>

      <!-- 9. Pendências -->
      <section id="painel-bloco-pendencias" :class="BLOCO">
        <p
          class="mb-1.5 text-[11px] font-semibold tracking-wide uppercase"
          :class="processo.pendencias.length ? 'text-danger' : 'text-ink-soft'"
        >
          Pendências ({{ processo.pendencias.length }})
        </p>
        <ul v-if="processo.pendencias.length" id="painel-pendencias" class="flex flex-col gap-1 text-[13px] text-ink">
          <li v-for="(pendencia, index) in processo.pendencias" :key="index" class="flex items-start gap-1.5">
            <span class="text-danger">•</span>
            <span class="min-w-0 break-words">{{ pendencia }}</span>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-soft">Nenhuma pendência.</p>
      </section>

      <!-- 10. Atualizações: o componente de sempre (adicionar/editar/excluir com versão), lendo o processo do store.
           Ele traz a própria linha e o respiro de cima (border-t pt-2.5, como no detalhe da Lista); aqui o bloco já
           separa, então o seletor de filho os tira sem mexer no componente. -->
      <section
        id="painel-bloco-atualizacoes"
        :class="BLOCO"
        class="[&>div]:border-t-0 [&>div]:pt-0"
      >
        <ProcessoAtualizacoes :processo="processo" />
      </section>

      <!-- 11. Rodapé: excluir, com a MESMA confirmação da lixeira da Lista -->
      <footer id="painel-bloco-rodape" class="mt-auto px-5 py-4">
        <button
          id="btn-painel-excluir"
          type="button"
          class="min-h-11 rounded-md px-2 text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-danger lg:min-h-auto lg:py-1"
          @click="showDeleteConfirm = true"
        >
          Excluir processo
        </button>
      </footer>
    </aside>

    <!-- Teleport pro <body>: o ConfirmDialog (BaseModal, z-900) fica fora do overlay do painel. -->
    <Teleport to="body">
      <ConfirmDialog
        v-if="showDeleteConfirm"
        title="Excluir processo"
        :message="deleteConfirmMessage"
        confirm-label="Sim, excluir"
        cancel-label="Cancelar"
        danger
        reforcado
        @confirm="confirmDelete"
        @close="showDeleteConfirm = false"
      />
    </Teleport>
  </div>
</template>
