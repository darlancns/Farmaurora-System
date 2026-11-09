<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Dir } from "#shared/types/dir";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";
import { nomeBasePaciente } from "../../utils/dirFiltros";
import DirBancoChip from "./DirBancoChip.vue";

// Sheet do botão "⋯" de um PO da lista "Fechamentos restantes" abaixo de lg (mesmo casco do
// NavMoreSheet/DirFiltrosSheet). Tem "Remover da lista" e, ao tocar, uma confirmação no próprio sheet
// (um ConfirmDialog ficaria ATRÁS dele: o sheet está em z-950 e o BaseModal em z-900).
const props = defineProps<{ dir: Dir }>();

const emit = defineEmits<{
  close: [];
  // Confirmado: o PO sai da lista (a página faz o PATCH).
  remover: [dir: Dir];
}>();

const confirmando = ref(false);

// Esc volta da confirmação para as ações; sem confirmação aberta, fecha o sheet.
useEscapeToClose((event) => {
  if (event.defaultPrevented) return;
  if (confirmando.value) {
    confirmando.value = false;
    return;
  }
  emit("close");
});
useLockBodyScroll();

// Em lg+ a lista usa o botão "Remover" da tabela e este sheet some (lg:hidden) — se a viewport cruzar o
// breakpoint com ele aberto (ex.: girar o tablet), fecha de verdade pra soltar o travamento de scroll.
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
    id="dir-fech-acoes-overlay"
    class="fixed inset-0 z-[950] flex items-end justify-center bg-ink/40 lg:hidden"
    @click.self="emit('close')"
  >
    <div
      id="dir-fech-acoes-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`Ações do ${props.dir.po}`"
      class="w-full max-w-[520px] rounded-t-2xl border-t border-hairline bg-paper-raised shadow-lg"
      style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    >
      <div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-hairline" />

      <div class="px-4 pt-3">
        <p class="font-mono text-[12.5px] font-semibold text-accent-dark">{{ props.dir.po }}</p>
        <p class="truncate font-display text-[16px] font-semibold text-ink">{{ nomeBasePaciente(props.dir.paciente) }}</p>
        <div class="mt-1.5"><DirBancoChip id="dir-fech-acoes-banco" :banco="props.dir.banco" /></div>
      </div>

      <div v-if="!confirmando" class="flex flex-col gap-2 px-4 pt-4 pb-4">
        <button
          id="btn-dir-fech-acoes-remover"
          type="button"
          class="min-h-12 w-full rounded-lg border border-danger/40 px-4 py-3 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/5"
          @click="confirmando = true"
        >
          Remover da lista
        </button>
        <button
          id="btn-dir-fech-acoes-fechar"
          type="button"
          class="min-h-12 w-full rounded-lg border border-hairline bg-paper px-4 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-white"
          @click="emit('close')"
        >
          Fechar
        </button>
      </div>

      <div v-else id="dir-fech-acoes-confirmacao" class="flex flex-col gap-3 px-4 pt-4 pb-4" role="alert">
        <p class="text-[14px] text-ink">
          Remover o {{ props.dir.po }} da lista de fechamentos restantes? O PO não é excluído; só deixa a lista.
        </p>
        <div class="flex gap-2.5">
          <button
            id="btn-dir-fech-acoes-cancelar"
            type="button"
            class="min-h-12 flex-1 rounded-lg border border-hairline bg-paper px-4 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-white"
            @click="confirmando = false"
          >
            Cancelar
          </button>
          <button
            id="btn-dir-fech-acoes-confirmar"
            type="button"
            class="min-h-12 flex-1 rounded-lg bg-danger px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:opacity-90"
            @click="emit('remover', props.dir)"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
