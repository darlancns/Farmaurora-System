<script setup lang="ts">
import BaseModal from "./BaseModal.vue";

withDefaults(
  defineProps<{
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }>(),
  {
    title: undefined,
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    danger: false,
  }
);

const emit = defineEmits<{
  confirm: [];
  close: [];
}>();
</script>

<template>
  <BaseModal id="confirm-dialog-overlay" @close="emit('close')">
    <div class="w-full max-w-[380px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 v-if="title" class="mb-2 font-display text-[16px] font-semibold text-ink">{{ title }}</h2>
      <p class="text-[13.5px] text-ink-soft">{{ message }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          id="btn-confirm-dialog-cancel"
          type="button"
          class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
          @click="emit('close')"
        >
          {{ cancelLabel }}
        </button>
        <button
          id="btn-confirm-dialog-confirm"
          type="button"
          class="rounded-md px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
          :class="danger ? 'bg-danger' : 'bg-accent-dark'"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
