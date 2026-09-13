<script setup lang="ts">
import { computed, ref } from "vue";
import type { GrupoPagamento, StatusItemGrupo } from "#shared/types/Pagamento";
import { formatCurrency } from "../../../utils/formatters";
import { STATUS_ITEM_GRUPO_META, proximoStatusItemGrupo } from "../../../utils/pagamentoStatus";

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
  "pagar-grupo": [];
  "exportar-foto": [];
}>();

const collapsed = ref(props.startCollapsed ?? false);

const total = computed(() => props.grupo.itens.reduce((s, i) => s + i.valor, 0));

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
    <div class="flex w-full items-stretch">
      <button
        type="button"
        class="relative flex flex-1 items-center justify-between gap-2 py-2.5 pr-2 pl-3.5 text-left transition-colors hover:bg-paper"
        @click="collapsed = !collapsed"
      >
        <div class="flex items-center gap-2">
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
          <span class="font-display text-[14.5px] font-semibold text-ink">{{ grupo.nomeGrupo }}</span>
          <span class="rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            {{ grupo.itens.length }}
          </span>
        </div>

        <span
          v-if="grupo.chavePix"
          class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] text-ink-soft"
        >
          PIX: <span class="font-mono text-ink">{{ grupo.chavePix }}</span>
        </span>

        <span class="font-display text-[14.5px] font-semibold text-ink">
          Valor total: R$ {{ formatCurrency(total) }}
        </span>
      </button>

      <button
        :id="`btn-exportar-grupo-${grupo.id}`"
        type="button"
        title="Gerar foto do pagamento"
        aria-label="Gerar foto do pagamento"
        class="flex shrink-0 items-center border-l border-hairline px-3 text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark"
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
        class="flex shrink-0 items-center border-l border-hairline bg-accent-dark px-4 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
        @click="emit('pagar-grupo')"
      >
        Pago
      </button>
    </div>

    <div v-if="!collapsed" class="border-t border-hairline">
      <div
        v-for="(item, index) in grupo.itens"
        :key="index"
        class="flex items-center gap-3 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
      >
        <span class="min-w-0 flex-1 truncate text-[13.5px] text-ink">{{ item.paciente }}</span>
        <span class="w-[110px] shrink-0 text-right font-mono text-[12.5px] text-ink">R$ {{ formatCurrency(item.valor) }}</span>
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
        <div v-if="!readonly && !grupo.realizado" class="flex shrink-0 items-center gap-1">
          <button
            :id="`btn-editar-item-${grupo.id}-${index}`"
            type="button"
            title="Editar pagamento"
            aria-label="Editar pagamento"
            class="rounded-md p-1.5 text-ink-soft transition-colors hover:text-accent-dark"
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
            class="rounded-md p-1.5 text-ink-soft transition-colors hover:text-danger"
            @click="emit('excluir-item', index)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
