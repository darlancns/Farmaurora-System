<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";
import { FILTROS_DIR_VAZIOS, type FiltrosDir } from "../../utils/dirFiltros";
import type { CampoFiltroDir } from "../../utils/dirOptions";
import AppSelect from "../AppSelect.vue";

// Bottom sheet dos filtros de /dir abaixo de lg (mesmo casco do ProcessoFiltrosSheet.vue). Não
// guarda estado: o v-model é o MESMO ref de dir.vue, então cada troca de select já filtra a lista
// na hora ("Aplicar" só fecha; "Limpar" zera os filtros, mantendo o texto da busca).
defineProps<{ campos: CampoFiltroDir[] }>();

const filtros = defineModel<FiltrosDir>("filtros", { required: true });

const emit = defineEmits<{ close: [] }>();

// Esc dentro de um select aberto é tratado pelo AppSelect (fecha só a lista e faz preventDefault).
useEscapeToClose((event) => {
  if (event.defaultPrevented) return;
  emit("close");
});
useLockBodyScroll();

function atualizar(chave: CampoFiltroDir["chave"], valor: string): void {
  filtros.value = { ...filtros.value, [chave]: valor };
}

function limpar(): void {
  filtros.value = { ...FILTROS_DIR_VAZIOS, busca: filtros.value.busca };
}

// Em lg+ os filtros ficam inline na página e este painel some via CSS (lg:hidden) — se a viewport
// cruzar o breakpoint com ele aberto (ex.: girar o tablet), fecha de verdade pra soltar o scroll.
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
    id="dir-filtros-sheet-overlay"
    class="fixed inset-0 z-[950] flex items-end justify-center bg-ink/40 lg:hidden"
    @click.self="emit('close')"
  >
    <div
      id="dir-filtros-sheet"
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
          id="btn-dir-filtros-limpar"
          type="button"
          class="-mr-2 rounded-md px-2 py-2 text-[13.5px] font-semibold text-accent-dark transition-colors hover:opacity-80"
          @click="limpar"
        >
          Limpar
        </button>
      </div>

      <!-- 9 filtros não cabem em telas baixas: o corpo rola (as listas abrem pra baixo, dentro da rolagem). -->
      <div class="flex max-h-[68dvh] flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pt-3 pb-2">
        <AppSelect
          v-for="campo in campos"
          :id="`sheet-${campo.id}`"
          :key="campo.chave"
          :model-value="filtros[campo.chave]"
          :options="campo.opcoes"
          @update:model-value="atualizar(campo.chave, $event)"
        />
      </div>

      <div class="px-4 pt-1.5 pb-4">
        <button
          id="btn-dir-filtros-aplicar"
          type="button"
          class="w-full rounded-lg bg-accent-dark px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:opacity-90"
          @click="emit('close')"
        >
          Aplicar
        </button>
      </div>
    </div>
  </div>
</template>
