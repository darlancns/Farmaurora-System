<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import BaseModal from "./BaseModal.vue";

// Props opcionais (todas desligadas por padrão — os usos antigos não mudam):
// - `reforcado`: alertdialog acessível (role/aria-modal/labelledby/describedby), foco inicial em "Cancelar", foco
//   preso na janela (Tab/Shift+Tab ciclam entre os botões), alvos de toque >= 44px abaixo de lg e quebra de
//   palavra longa na mensagem. Quem abre devolve o foco ao botão de origem ao fechar.
// - `loading`: ação em andamento — "Confirmar" desabilitado com spinner e a janela não fecha (Esc, toque fora e
//   "Cancelar" ficam inertes) até a ação terminar.
const props = withDefaults(
  defineProps<{
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    reforcado?: boolean;
    loading?: boolean;
  }>(),
  {
    title: undefined,
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    danger: false,
    reforcado: false,
    loading: false,
  }
);

const emit = defineEmits<{
  confirm: [];
  close: [];
}>();

const cardRef = ref<HTMLElement | null>(null);
const cancelRef = ref<HTMLButtonElement | null>(null);

onMounted(() => {
  if (props.reforcado) void nextTick(() => cancelRef.value?.focus());
});

function fechar(): void {
  if (props.loading) return;
  emit("close");
}

function confirmar(): void {
  if (props.loading) return;
  emit("confirm");
}

// Foco preso: Tab no último botão volta ao primeiro e Shift+Tab no primeiro vai ao último.
function onKeydown(event: KeyboardEvent): void {
  if (!props.reforcado || event.key !== "Tab") return;
  const botoes = [...(cardRef.value?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
  const primeiro = botoes[0];
  const ultimo = botoes[botoes.length - 1];
  if (!primeiro || !ultimo) {
    event.preventDefault();
    return;
  }
  const ativo = document.activeElement;
  if (event.shiftKey && (ativo === primeiro || !cardRef.value?.contains(ativo))) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && (ativo === ultimo || !cardRef.value?.contains(ativo))) {
    event.preventDefault();
    primeiro.focus();
  }
}
</script>

<template>
  <BaseModal id="confirm-dialog-overlay" @close="fechar">
    <div
      ref="cardRef"
      class="w-full max-w-[380px] rounded-[10px] border border-hairline bg-paper-raised p-5"
      :role="reforcado ? 'alertdialog' : undefined"
      :aria-modal="reforcado ? 'true' : undefined"
      :aria-labelledby="reforcado && title ? 'confirm-dialog-title' : undefined"
      :aria-describedby="reforcado ? 'confirm-dialog-message' : undefined"
      :aria-busy="reforcado && loading ? 'true' : undefined"
      @keydown="onKeydown"
    >
      <h2 v-if="title" id="confirm-dialog-title" class="mb-2 font-display text-[16px] font-semibold text-ink">{{ title }}</h2>
      <p id="confirm-dialog-message" class="text-[13.5px] text-ink-soft" :class="{ 'break-words': reforcado }">{{ message }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          id="btn-confirm-dialog-cancel"
          ref="cancelRef"
          type="button"
          class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
          :class="{ 'min-h-11 lg:min-h-0': reforcado, 'cursor-not-allowed opacity-60': loading }"
          :disabled="loading"
          @click="fechar"
        >
          {{ cancelLabel }}
        </button>
        <button
          id="btn-confirm-dialog-confirm"
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
          :class="[danger ? 'bg-danger' : 'bg-accent-dark', { 'min-h-11 lg:min-h-0': reforcado, 'cursor-not-allowed opacity-70': loading }]"
          :disabled="loading"
          @click="confirmar"
        >
          <svg v-if="loading" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
