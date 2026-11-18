<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { metaDoStatus } from "../../utils/processoStatus";
import ProcessoMoverMenu from "./ProcessoMoverMenu.vue";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";
import { ICONES_PROCESSO, type ChaveIconePainel } from "../../utils/processoIcones";
import { etiquetaPagamentoDe } from "../../utils/processoPagamento";
import { camposDatasPreenchidos, focaveis, haModalAberto, itensMedicamentos } from "../../utils/processoPainel";
import {
  celulaNumeroProcesso,
  celulasPessoas,
  dataCabeNaCelula,
  haLinhaDeCima,
  secaoEntrega,
  secaoEnvio,
} from "../../utils/processoPainelSecoes";
import { remessaVisivelNaLinha, type ContagemPorPasta } from "../../utils/remessaNaLinha";
import { rotuloPastaPo } from "#shared/utils/rotuloPasta";
import ConfirmDialog from "../ConfirmDialog.vue";
import ProcessoAtualizacoes from "./ProcessoAtualizacoes.vue";
import ProcessoPainelCelula from "./ProcessoPainelCelula.vue";

// Painel lateral do Kanban (só para quem pode editar processos; quem decide é a página). Desktop: à direita, 600px,
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
// "Pasta X · PO", só um dos dois, ou "" (sem pasta e sem PO o texto não aparece).
const pastaPo = computed(() => rotuloPastaPo(props.processo.pasta, props.processo.numeroPo, "Pasta "));
// "Ordem N": a mesma regra da Lista (só quando N > 1 ou a pasta se repete), depois do PO.
const ordem = computed(() => (mostrarOrdem.value ? `Ordem ${props.processo.numeroRemessa}` : ""));
// Pago/Pendente (pagamento ao fornecedor): só com valor.
const pagamento = computed(() => etiquetaPagamentoDe(props.processo.statusPagamento));
// A linha de cima do cabeçalho só existe com pasta, PO, "Ordem N" ou etiqueta de pagamento; sem nada, os ícones ficam na
// linha do nome (sem espaço vazio acima dele).
const linhaDeCima = computed(() =>
  haLinhaDeCima({ pastaPo: pastaPo.value, ordem: ordem.value, pagamento: pagamento.value?.texto ?? null }),
);
// Cada item: a linha "Qtd. — nome" e, abaixo, "Laboratório · Brand" só quando houver um dos dois.
const medicamentos = computed(() => itensMedicamentos(props.processo.medicamentos));
// Seções (ver utils/processoPainelSecoes.ts): cada campo vazio some, cada seção vazia some (e o título junto).
const pessoas = computed(() => celulasPessoas(props.processo));
const envio = computed(() => secaoEnvio(props.processo));
const entrega = computed(() => secaoEntrega(props.processo));
const numeroProcesso = computed(() => celulaNumeroProcesso(props.processo));
// Só as datas preenchidas (vazia não aparece; sem nenhuma, a seção some). Ver camposDatasPreenchidos.
const datas = computed(() => camposDatasPreenchidos(props.processo));
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

// Botões só de ícone do topo: 44x44 abaixo de lg (alvo de toque) e 36x36 em lg+, borda hairline, raio 8.
const BOTAO_ICONE =
  "pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-paper-raised text-ink-soft transition-colors lg:h-9 lg:w-9";
// Espaço que os 3 ícones ocupam à direita (3×44 + 2×8 abaixo de lg; 3×36 + 2×8 em lg+) mais respiro: o texto da mesma
// linha não passa por baixo deles.
const RESERVA_ICONES = "pr-[156px] lg:pr-[132px]";

function caminhos(chave: ChaveIconePainel): string[] {
  return ICONES_PROCESSO[chave];
}

// Seções: 24px laterais (16px abaixo de sm), 18px em cima e 20px embaixo. A divisória (#e0e7e5) vem do `divide-y` do
// contêiner (só entre seções que existem). Título de seção: 11px/600 maiúsculo, no cinza do projeto.
const SECAO = "px-4 pt-[18px] pb-5 sm:px-6";
const TITULO_SECAO_BASE = "text-[11px] font-semibold tracking-wide uppercase";
const TITULO_SECAO = `mb-2.5 ${TITULO_SECAO_BASE} text-ink-soft`;
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
      class="flex h-dvh w-full max-w-[100vw] flex-col overflow-y-auto overscroll-contain bg-paper-raised lg:w-[600px] lg:rounded-l-xl lg:border-l lg:border-hairline"
      @keydown="onKeydown"
    >
      <!-- Ações do topo: [Mover para…][Editar processo][Fechar], só ícones. Ficam num contêiner STICKY de altura zero (filho
           direto do painel, então ele acompanha a rolagem inteira): os 3 botões continuam visíveis ao rolar, sem fixar o
           cabeçalho (com 8–10 medicamentos ele ocuparia a tela). Visualmente ficam sobre a primeira linha do cabeçalho, no
           canto direito (que reserva o espaço: RESERVA_ICONES). Vêm primeiro no DOM: o Tab começa por eles. O contêiner não
           captura o mouse (pointer-events-none) para não cobrir o texto do cabeçalho; os filhos diretos (o menu Mover e os
           botões) o recebem de volta (`[&>*]:pointer-events-auto`). -->
      <div id="painel-acoes" class="pointer-events-none sticky top-0 z-20 h-0 shrink-0">
        <div class="flex items-start justify-end gap-2 px-4 pt-[18px] sm:px-6 [&>*]:pointer-events-auto">
          <ProcessoMoverMenu :processo="processo" :movendo="movendo" @mover="(para) => emit('mover', processo, para)" />
          <button
            id="btn-painel-editar"
            type="button"
            title="Editar processo"
            aria-label="Editar processo"
            :class="BOTAO_ICONE"
            class="hover:border-accent-dark hover:text-accent-dark"
            @click="emit('edit', processo)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in caminhos('editar')" :key="i" :d="d" />
            </svg>
          </button>
          <button
            id="btn-painel-fechar"
            type="button"
            title="Fechar"
            aria-label="Fechar painel"
            :class="BOTAO_ICONE"
            class="hover:border-danger hover:text-danger"
            @click="emit('close')"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in caminhos('fechar')" :key="i" :d="d" />
            </svg>
          </button>
        </div>
      </div>
      <!-- Movendo… para leitor de tela (o botão Mover fica desabilitado, com aria-busy e spinner). -->
      <span v-if="movendo" id="painel-movendo" class="sr-only" role="status">Movendo…</span>

      <!-- 1. Cabeçalho. Linha de cima (só se houver pasta, PO, Ordem N ou etiqueta de pagamento): "Pasta X · PO" em fonte de
           código cinza, "Ordem N" e Pago/Pendente. Depois o NOME (o destaque: 22px/600). Sem a linha de cima, o nome sobe e
           ocupa a linha dos ícones. Embaixo, os medicamentos e, NA MESMA LINHA do último, a etiqueta de status à direita
           (irmã do bloco de medicamentos, rente ao fundo do cabeçalho). -->
      <!-- Corpo: o `divide-y` põe a divisória só ENTRE as seções que existem (seção com v-if falso não ocupa nada). -->
      <div id="painel-corpo" class="flex-none divide-y divide-[#e0e7e5]">
      <header id="painel-bloco-cabecalho" :class="SECAO">
        <div
          v-if="linhaDeCima"
          id="painel-linha-cima"
          class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 lg:min-h-9"
          :class="RESERVA_ICONES"
        >
          <span v-if="pastaPo" id="painel-pasta-po" class="font-mono text-[12px] break-words text-ink-soft">{{ pastaPo }}</span>
          <template v-if="ordem">
            <span v-if="pastaPo" class="font-mono text-[12px] text-ink-soft" aria-hidden="true">·</span>
            <span id="painel-ordem" class="font-mono text-[12px] text-ink-soft">{{ ordem }}</span>
          </template>
          <span
            v-if="pagamento"
            id="painel-pagamento"
            class="shrink-0 rounded-full px-[9px] py-px text-[11.5px] leading-snug font-semibold"
            :class="pagamento.classe"
            >{{ pagamento.texto }}</span
          >
        </div>
        <h2
          id="painel-titulo"
          class="min-w-0 font-display text-[22px] leading-[1.2] font-semibold break-words text-ink"
          :class="linhaDeCima ? 'mt-2' : ['flex min-h-11 items-center lg:min-h-9', RESERVA_ICONES]"
        >
          {{ processo.paciente }}
        </h2>

        <div class="mt-3 flex items-end justify-between gap-4">
          <div id="painel-medicamentos" class="min-w-0 flex-1">
            <ul v-if="medicamentos.length" class="flex flex-col gap-2">
              <li v-for="(item, i) in medicamentos" :key="i" class="min-w-0">
                <span class="block text-[12.5px] leading-snug font-medium tracking-[0.02em] break-words text-ink uppercase">
                  <strong v-if="item.quantidade" class="font-bold">{{ item.quantidade }}</strong
                  ><template v-if="item.quantidade"> — </template>{{ item.nome }}
                </span>
                <span
                  v-if="item.extra"
                  :id="`painel-medicamento-extra-${i}`"
                  class="block text-[12px] leading-snug break-words text-ink-soft"
                  >{{ item.extra }}</span
                >
              </li>
            </ul>
          </div>
          <span
            id="painel-status"
            class="-mb-[3px] flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
            :class="statusMeta.badgeClass"
            >{{ statusMeta.label }}</span
          >
        </div>
      </header>

      <!-- 2. Pessoas: Responsável / Consultor / Fornecedor (só o nome do fornecedor) numa linha de bloquinhos; abaixo de 640px
           quebram de linha (mínimo 140px) em vez de cortar o nome. Campo vazio some; célula sozinha ocupa a linha. -->
      <section v-if="pessoas.length" id="painel-bloco-pessoas" :class="SECAO">
        <div class="flex flex-wrap gap-2">
          <ProcessoPainelCelula v-for="c in pessoas" :key="c.id" :celula="c" truncar class="min-w-[140px] flex-1 basis-[140px]" />
        </div>
      </section>

      <!-- 3. Envio e desembaraço: Envio | Cia. aérea; Nº AWB | Despachante (Despachante some no Courier Simples, como no
           formulário). Linha sem células some; célula sozinha ocupa a linha; sem nenhum campo, nem o título aparece. -->
      <section v-if="envio" id="painel-bloco-envio" :class="SECAO">
        <h3 :class="TITULO_SECAO">{{ envio.titulo }}</h3>
        <div class="flex flex-col gap-2">
          <div v-for="(linha, i) in envio.linhas" :key="i" class="grid gap-2" :class="linha.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
            <ProcessoPainelCelula v-for="c in linha" :key="c.id" :celula="c" />
          </div>
        </div>
      </section>

      <!-- 4. Entrega: Transportadora (nome · cotação · valor; some no Courier Simples) e Local de entrega, cada um numa linha. -->
      <section v-if="entrega" id="painel-bloco-entrega" :class="SECAO">
        <h3 :class="TITULO_SECAO">{{ entrega.titulo }}</h3>
        <div class="flex flex-col gap-2">
          <ProcessoPainelCelula v-for="c in entrega.linhas.flat()" :key="c.id" :celula="c" />
        </div>
      </section>

      <!-- 5. Nº do processo: bloquinho de linha inteira, sem título, em fonte de código (quebra em qualquer ponto). -->
      <section v-if="numeroProcesso" id="painel-bloco-numero-processo" :class="SECAO">
        <ProcessoPainelCelula :celula="numeroProcesso" />
      </section>

      <!-- 6. Datas: só as preenchidas (texto livre como está no banco, inclusive observações antigas; MS Anexado em e
           Prazo da ANVISA com o ano). 3 colunas a partir de 640px, 2 abaixo. Valor que não é DD/MM nem DD/MM/AAAA, e a
           Suposta estimativa, ocupam a linha inteira. Sem nenhuma data, a seção não existe. -->
      <section v-if="datas.length" id="painel-bloco-datas" :class="SECAO">
        <h3 :class="TITULO_SECAO">Datas</h3>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div
            v-for="campo in datas"
            :key="campo.id"
            class="min-w-0 rounded-[8px] border border-[#e0e7e5] bg-[#f6f8f8] px-2.5 py-2"
            :class="{ 'col-span-full': campo.larguraTotal || !dataCabeNaCelula(campo.valor) }"
          >
            <p class="mb-[3px] text-[10.5px] leading-none font-semibold tracking-[0.04em] text-ink-soft">{{ campo.rotulo }}</p>
            <p
              :id="`painel-${campo.id}`"
              class="text-[13.5px] leading-snug font-semibold break-words"
              :class="campo.destaque && campo.valor ? 'text-accent-dark' : 'text-ink'"
            >
              {{ campo.valor }}
            </p>
          </div>
        </div>
      </section>

      <!-- 7. Pendências: título com o contador numa pílula vermelha (só com pendências); cada pendência numa linha de fundo
           vermelho suave com ícone de alerta. Vazio: "Nenhuma pendência.". Cores: pílula #fbe9e5/#9a3828; linha
           #fbeeea, borda #efd3cc, texto #7e2e20. -->
      <section id="painel-bloco-pendencias" :class="SECAO">
        <h3 class="mb-2.5 flex items-center gap-2" :class="TITULO_SECAO_BASE">
          <span :class="processo.pendencias.length ? 'text-[#9a3828]' : 'text-ink-soft'">Pendências</span>
          <span
            v-if="processo.pendencias.length"
            id="painel-pendencias-contador"
            class="rounded-full bg-[#fbe9e5] px-2 py-px text-[11px] leading-snug font-semibold text-[#9a3828]"
            >{{ processo.pendencias.length }}</span
          >
        </h3>
        <ul v-if="processo.pendencias.length" id="painel-pendencias" class="flex flex-col gap-1.5">
          <li
            v-for="(pendencia, index) in processo.pendencias"
            :key="index"
            class="flex items-start gap-2 rounded-[8px] border border-[#efd3cc] bg-[#fbeeea] px-3 py-2 text-[13px] leading-snug text-[#7e2e20]"
          >
            <svg viewBox="0 0 24 24" class="mt-px h-4 w-4 shrink-0 text-[#9a3828]" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in caminhos('alerta')" :key="i" :d="d" />
            </svg>
            <span class="min-w-0 break-words">{{ pendencia }}</span>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-soft">Nenhuma pendência.</p>
      </section>

      <!-- 8. Atualizações: o componente de sempre (adicionar/editar/excluir com versão), lendo o processo do store, na variante
           "painel" (pílula da data ou "obs.", só os ícones de editar e excluir). -->
      <section id="painel-bloco-atualizacoes" :class="SECAO">
        <ProcessoAtualizacoes :processo="processo" variante="painel" />
      </section>

      <!-- 9. Excluir processo: canto direito, com a MESMA confirmação da lixeira da Lista. É a última seção. -->
      <footer id="painel-bloco-rodape" :class="SECAO" class="flex justify-end">
        <button
          id="btn-painel-excluir"
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#efd3cc] bg-paper-raised px-3.5 text-[12.5px] font-semibold text-[#9a3828] transition-colors hover:bg-[#fbeeea] lg:min-h-9"
          @click="showDeleteConfirm = true"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-for="(d, i) in caminhos('lixeira')" :key="i" :d="d" />
          </svg>
          Excluir processo
        </button>
      </footer>
      </div>
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
