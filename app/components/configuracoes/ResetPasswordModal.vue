<script setup lang="ts">
import { ref } from "vue";
import type { AdminUserSummary } from "#shared/types/auth";
import BaseModal from "../BaseModal.vue";
import { generatePassword } from "../../utils/generatePassword";

const props = defineProps<{
  conta: AdminUserSummary;
  busy?: boolean;
}>();

const emit = defineEmits<{
  confirm: [password: string];
  close: [];
  invalid: [message: string];
}>();

const senha = ref(generatePassword());

function handleConfirmar(): void {
  if (senha.value.length < 8) {
    emit("invalid", "A senha precisa ter pelo menos 8 caracteres");
    return;
  }
  emit("confirm", senha.value);
}
</script>

<template>
  <BaseModal id="reset-senha-overlay" @close="emit('close')">
    <div class="w-full max-w-[400px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-2 font-display text-[16px] font-semibold text-ink">Redefinir senha</h2>
      <p class="mb-3 text-[13px] text-ink-soft">
        Nova senha para <strong class="text-ink">{{ props.conta.email }}</strong>.
      </p>
      <div class="flex gap-2">
        <input
          id="reset-senha-input"
          v-model="senha"
          type="text"
          autocomplete="off"
          class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
        />
        <button
          id="btn-reset-gerar-senha"
          type="button"
          class="shrink-0 rounded-md border border-hairline px-2.5 py-2 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-paper"
          @click="senha = generatePassword()"
        >
          Gerar
        </button>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          id="btn-reset-confirmar"
          type="button"
          :disabled="props.busy"
          class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          @click="handleConfirmar"
        >
          Redefinir
        </button>
      </div>
    </div>
  </BaseModal>
</template>
