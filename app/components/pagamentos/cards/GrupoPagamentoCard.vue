<script setup lang="ts">
import { computed, ref } from "vue";
import type { GrupoPagamento, StatusItemGrupo } from "#shared/types/Pagamento";
import { formatCurrency } from "../../../utils/formatters";
import { TITULO_CONFIRMAR_GRUPO, mensagemConfirmarGrupo } from "../../../utils/pagamentoConfirmacao";
import type { PedidoPagamento } from "../../../composables/usePagamentoConfirmacao";
import { STATUS_ITEM_GRUPO_META, proximoStatusItemGrupo } from "../../../utils/pagamentoStatus";
import { COLUNA_ACOES_CLASSES } from "../../../utils/pagamentoColunaAcoes";
import ItemAcoesColuna from "./ItemAcoesColuna.vue";

const props = withDefaults(
  defineProps<{
    grupo: GrupoPagamento;
    startCollapsed?: boolean;
    readonly?: boolean;
  }>(),
  { startCollapsed: false, readonly: false },
);

const emit = defineEmits<{
  "ciclo-status": [index: number, status: StatusItemGrupo];
  "editar-item": [index: number];
  "excluir-item": [index: number];
  // "Pago": só PEDE a confirmação (a página abre a janela e, ao confirmar, chama o handler de sempre).
  "pedir-pagar-grupo": [pedido: PedidoPagamento];
  "exportar-foto": [];
}>();

const collapsed = ref(props.startCollapsed ?? false);

const total = computed(() => props.grupo.itens.reduce((s, i) => s + i.valor, 0));

// Pedido de confirmação do "Pago": nome, quantidade e valor total são os mesmos que o cabeçalho já mostra.
function pedirPagar(): void {
  emit("pedir-pagar-grupo", {
    id: props.grupo.id,
    titulo: TITULO_CONFIRMAR_GRUPO,
    mensagem: mensagemConfirmarGrupo({
      nome: props.grupo.nomeGrupo,
      quantidade: props.grupo.itens.length,
      valorTotalLabel: formatCurrency(total.value),
    }),
  });
}

function ciclar(index: number): void {
  if (props.grupo.realizado || props.readonly) return;
  const atual = props.grupo.itens[index];
  if (!atual) return;
  emit("ciclo-status", index, proximoStatusItemGrupo(atual.status));
}
</script>

<template>
  <div
    :id="`grupo-pagamento-${grupo.id}`"
    class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
  >
    <!--
      Abaixo de lg o cabeçalho é um grid de 2 colunas. Esquerda (o botão que expande/recolhe): linha 1 = seta +
      nome + contagem; linha 2 = "Valor total" (o PIX fica oculto; só aparece em lg+). Direita: coluna de largura
      única (COLUNA_ACOES_CLASSES, a mesma dos itens) na altura toda do cabeçalho, com "Pago" (célula azul suave,
      linha fina embaixo) na metade de cima e a câmera na de baixo; sem "Pago" a câmera ocupa a coluna inteira
      (centralizada). A altura mínima é fixa (68px), igual com ou sem "Pago", e o bloco de texto (justify-center)
      fica centralizado nela.
      Em lg+ vira o flex de uma linha só de sempre (as classes de grid são ignoradas pelo flex e a coluna da
      direita vira `contents`).
    -->
    <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch max-lg:min-h-[68px] lg:flex">
      <button
        type="button"
        class="relative col-start-1 row-start-1 flex min-w-0 flex-col justify-center py-3.5 pr-2 pl-3.5 text-left transition-colors hover:bg-paper max-lg:focus-visible:outline-2 max-lg:focus-visible:-outline-offset-2 max-lg:focus-visible:outline-accent-dark lg:min-w-auto lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:py-2.5"
        @click="collapsed = !collapsed"
      >
        <div class="flex min-w-0 items-center gap-2 lg:min-w-auto">
          <svg
            viewBox="0 0 20 20"
            class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
            :class="{ 'rotate-90': !collapsed }"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
          </svg>
          <span class="min-w-0 font-display text-[14.5px] font-semibold break-words text-ink max-lg:leading-tight lg:min-w-auto">{{ grupo.nomeGrupo }}</span>
          <span class="shrink-0 rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft max-lg:leading-4 lg:shrink">
            {{ grupo.itens.length }}
          </span>
        </div>

        <span
          v-if="grupo.chavePix"
          class="hidden self-center text-[12px] text-ink-soft lg:pointer-events-none lg:absolute lg:left-1/2 lg:block lg:-translate-x-1/2"
        >
          PIX: <span class="font-mono text-ink">{{ grupo.chavePix }}</span>
        </span>

        <span class="font-display text-[14.5px] font-semibold text-ink max-lg:leading-4 max-lg:tabular-nums">
          Valor total: R$ {{ formatCurrency(total) }}
        </span>
      </button>

      <div class="col-start-2 row-start-1 flex flex-col-reverse lg:contents" :class="COLUNA_ACOES_CLASSES">
        <button
          :id="`btn-exportar-grupo-${grupo.id}`"
          type="button"
          title="Gerar foto do pagamento"
          aria-label="Gerar foto do pagamento"
          class="flex min-h-[34px] shrink-0 items-center justify-center text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark max-lg:flex-1 max-lg:focus-visible:outline-2 max-lg:focus-visible:-outline-offset-2 max-lg:focus-visible:outline-accent-dark lg:min-h-0 lg:justify-start lg:border-l lg:border-hairline lg:px-3"
          @click="emit('exportar-foto')"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
          </svg>
        </button>

        <button
          v-if="!grupo.realizado && !readonly"
          :id="`btn-pagar-grupo-${grupo.id}`"
          type="button"
          class="flex min-h-[34px] shrink-0 items-center justify-center bg-farm-blue-soft px-1 text-[12px] font-semibold text-accent-dark transition-colors hover:opacity-90 max-lg:basis-1/2 max-lg:border-b max-lg:border-hairline max-lg:focus-visible:outline-2 max-lg:focus-visible:-outline-offset-2 max-lg:focus-visible:outline-accent-dark lg:min-h-0 lg:justify-start lg:border-l lg:border-hairline lg:bg-accent-dark lg:px-4 lg:text-white"
          @click="pedirPagar"
        >
          Pago
        </button>
      </div>
    </div>

    <div v-if="!collapsed" class="border-t border-hairline">
      <div
        v-for="(item, index) in grupo.itens"
        :key="index"
        class="@container border-b border-hairline last:border-b-0"
      >
        <!-- lg+: o layout de sempre (container query), intacto. Abaixo de lg ele fica display:none. -->
        <div class="hidden lg:block">
          <!-- Abaixo de 480px: linha 1 = paciente (quebra, sem truncar) + editar/excluir na MESMA linha;
               linha 2 = valor + status (wrap). A partir de 480px volta ao flex de uma linha só. -->
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3.5 py-2.5 @[480px]:flex @[480px]:flex-row @[480px]:items-center @[480px]:gap-3">
            <span class="col-start-1 row-start-1 min-w-0 text-[13.5px] break-words text-ink @[480px]:flex-1 @[480px]:truncate">{{ item.paciente }}</span>

            <div class="col-span-2 row-start-2 flex flex-wrap items-center gap-2 @[480px]:flex-nowrap @[480px]:gap-3">
              <span class="shrink-0 text-right font-mono text-[12.5px] text-ink @[480px]:w-[110px]">
                R$ {{ formatCurrency(item.valor) }}
              </span>
              <button
                :id="`btn-status-item-${grupo.id}-${index}`"
                type="button"
                :disabled="grupo.realizado || readonly"
                class="w-[104px] shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed"
                :class="STATUS_ITEM_GRUPO_META[item.status].badgeClass"
                :title="grupo.realizado || readonly ? undefined : 'Clique para alternar'"
                @click="ciclar(index)"
              >
                {{ STATUS_ITEM_GRUPO_META[item.status].label }}
              </button>
            </div>

            <div v-if="!readonly && !grupo.realizado" class="col-start-2 row-start-1 -my-2 -mr-3.5 flex shrink-0 items-center gap-1 @[480px]:my-0 @[480px]:mr-0">
              <button
                :id="`btn-editar-item-${grupo.id}-${index}`"
                type="button"
                title="Editar pagamento"
                aria-label="Editar pagamento"
                class="rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark lg:p-1.5"
                @click="emit('editar-item', index)"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
                </svg>
              </button>
              <button
                :id="`btn-excluir-item-${grupo.id}-${index}`"
                type="button"
                title="Excluir pagamento"
                aria-label="Excluir pagamento"
                class="rounded-md p-3.5 text-ink-soft transition-colors hover:text-danger lg:p-1.5"
                @click="emit('excluir-item', index)"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Abaixo de lg: grid de 2 linhas de conteúdo (paciente / valor + status), cada uma com a altura da sua
             célula de ação (lápis / lixeira, na coluna da direita com divisória). Sem coluna quando não há o que
             editar/excluir (a coluna `auto` colapsa e o conteúdo ocupa a largura toda).
             Ids dos botões com prefixo `mobile-` (os de lg+ ficam no bloco acima). -->
        <div class="grid grid-cols-[minmax(0,1fr)_auto] lg:hidden">
          <div class="col-start-1 row-start-1 flex min-w-0 items-center px-3.5 py-1">
            <span class="text-[13.5px] leading-5 break-words text-ink">{{ item.paciente }}</span>
          </div>
          <div class="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-1">
            <span class="shrink-0 text-right font-mono text-[12.5px] text-ink">R$ {{ formatCurrency(item.valor) }}</span>
            <button
              :id="`mobile-btn-status-item-${grupo.id}-${index}`"
              type="button"
              :disabled="grupo.realizado || readonly"
              class="w-[104px] shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed"
              :class="STATUS_ITEM_GRUPO_META[item.status].badgeClass"
              :title="grupo.realizado || readonly ? undefined : 'Clique para alternar'"
              @click="ciclar(index)"
            >
              {{ STATUS_ITEM_GRUPO_META[item.status].label }}
            </button>
          </div>
          <ItemAcoesColuna
            v-if="!readonly && !grupo.realizado"
            alinhada
            :editar="{ id: `mobile-btn-editar-item-${grupo.id}-${index}`, label: 'Editar pagamento' }"
            :excluir="{ id: `mobile-btn-excluir-item-${grupo.id}-${index}`, label: 'Excluir pagamento' }"
            @editar="emit('editar-item', index)"
            @excluir="emit('excluir-item', index)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
