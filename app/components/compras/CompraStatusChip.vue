<script setup lang="ts">
import type { StatusDaCompra } from "#shared/constants/compra";
import { CLASSE_STATUS_COMPRA, ROTULO_STATUS_COMPRA } from "../../utils/comprasEstilos";

// O selo do estado da compra (Rascunho, Pronta, Cancelada). Só uma marca, sem ação.
defineProps<{ status: StatusDaCompra }>();
</script>

<template>
  <span
    class="inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
    :class="CLASSE_STATUS_COMPRA[status]"
    :data-status="status"
  >
    {{ ROTULO_STATUS_COMPRA[status] }}
  </span>
</template>
