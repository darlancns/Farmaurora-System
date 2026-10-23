<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";

// Bottom sheet GENÉRICO dos filtros de "Pagamentos realizados" abaixo de lg (mesmo
// casco de ProcessoFiltrosSheet.vue / NavMoreSheet.vue). Não guarda estado: os selects
// entram pelo slot e usam os MESMOS v-model da aba que o abriu, então cada troca já
// filtra a lista na hora. "Aplicar" só fecha o painel; "Limpar" avisa a aba, que
// devolve filtros e ordenação ao padrão.
const props = defineProps<{ id: string }>();

const emit = defineEmits<{ close: []; limpar: [] }>();

// Esc dentro de um select aberto é tratado pelo AppSelect (fecha só a lista e
// faz preventDefault) — o painel só fecha com um Esc que ninguém tratou antes.
useEscapeToClose((event) => {
  if (event.defaultPrevented) return;
  emit("close");
});
useLockBodyScroll();

// Em lg+ os filtros ficam inline na página e este painel some via CSS (lg:hidden) —
// se a viewport cruzar o breakpoint com ele aberto (ex.: girar o tablet), fecha de
// verdade pra soltar o travamento de scroll.
let desktopQuery: MediaQueryList | null = null;
function onBreakpointChange(event: MediaQueryListEvent): void {
  if (event.matches) emit("close");
}

onMounted(() => {
  desktopQuery = window.matchMedia("(min-width: 1024px)");
  desktopQuery.addEventListener("change", onBreakpointChange);
});

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener("change", onBreakpointChange);
});
</script>

<template>
  <div
    :id="`${props.id}-overlay`"
    class="fixed inset-0 z-[950] flex items-end justify-center bg-ink/40 lg:hidden"
    @click.self="emit('close')"
  >
    <div
      :id="props.id"
      role="dialog"
      aria-modal="true"
      aria-label="Filtros"
      class="w-full max-w-[520px] rounded-t-2xl border-t border-hairline bg-paper-raised shadow-lg"
      style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    >
      <div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-hairline" />

      <div class="flex items-center justify-between px-4 pt-3">
        <h2 class="font-display text-[17px] font-semibold text-ink">Filtros</h2>
        <button
          :id="`${props.id}-limpar`"
          type="button"
          class="-mr-2 rounded-md px-2 py-2 text-[13.5px] font-semibold text-accent-dark transition-colors hover:opacity-80"
          @click="emit('limpar')"
        >
          Limpar
        </button>
      </div>

      <div class="flex flex-col gap-2.5 px-4 pt-3 pb-4">
        <slot />

        <button
          :id="`${props.id}-aplicar`"
          type="button"
          class="mt-1.5 w-full rounded-lg bg-accent-dark px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:opacity-90"
          @click="emit('close')"
        >
          Aplicar
        </button>
      </div>
    </div>
  </div>
</template>
