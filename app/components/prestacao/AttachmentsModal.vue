<script setup lang="ts">
import { reactive } from "vue";
import type { AnexoSlot } from "../../utils/anexoSlots";
import { useAttachments } from "../../composables/useAttachments";
import { useToast } from "../../composables/useToast";
import BaseModal from "../BaseModal.vue";

const props = defineProps<{
  slots: AnexoSlot[];
  staged: Record<string, string>;
  patientId?: string;
  patientName?: string;
}>();

const emit = defineEmits<{
  close: [];
  stage: [slotKey: string, base64: string];
  unstage: [slotKey: string];
}>();

const { uploadAttachment, deleteAttachment } = useAttachments();
const { showToast } = useToast();

const uploading = reactive<Record<string, boolean>>({});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function onPaste(slotKey: string, event: ClipboardEvent): Promise<void> {
  const items = event.clipboardData?.items;
  if (!items) return;

  const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  const base64 = await fileToBase64(file);

  if (props.patientId) {
    const patientId = props.patientId;
    uploading[slotKey] = true;
    try {
      await uploadAttachment(patientId, slotKey, base64);
      showToast("Anexo salvo");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro ao enviar anexo");
    } finally {
      uploading[slotKey] = false;
    }
    return;
  }

  emit("stage", slotKey, base64);
}

async function onRemove(slotKey: string): Promise<void> {
  if (props.patientId) {
    const patientId = props.patientId;
    try {
      await deleteAttachment(patientId, slotKey);
      showToast("Anexo removido");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro ao remover anexo");
    }
    return;
  }

  emit("unstage", slotKey);
}
</script>

<template>
  <BaseModal id="attachments-modal-overlay" @close="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-[860px] flex-col rounded-[10px] border border-hairline bg-paper-raised">
      <div class="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div>
          <p class="mb-1 font-mono text-[11px] tracking-wider text-accent-dark uppercase">Anexos</p>
          <h2 class="font-display text-[18px] font-semibold text-ink">
            {{ patientName?.trim() ? patientName.toUpperCase() : "Nova prestação" }}
          </h2>
        </div>
        <button
          type="button"
          title="Fechar"
          class="rounded-md px-2 py-1 text-ink-soft transition-colors hover:text-danger"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="grid min-h-0 grid-cols-4 gap-3 overflow-y-auto p-5">
        <div v-for="slot in slots" :key="slot.key" class="flex flex-col gap-1.5">
          <p class="text-[11.5px] font-medium text-ink-soft">{{ slot.label }}</p>
          <p
            v-if="slot.caption"
            :title="slot.caption"
            class="-mt-1 line-clamp-3 text-[10px] leading-tight whitespace-pre-line text-ink-soft/70"
          >
            {{ slot.caption }}
          </p>

          <div
            v-if="!staged[slot.key]"
            tabindex="0"
            class="flex aspect-[210/297] cursor-text items-center justify-center rounded-md border border-dashed border-hairline bg-paper px-3 text-center text-[12px] text-ink-soft transition-colors focus:border-accent-dark focus:bg-white focus:outline-none"
            @paste="onPaste(slot.key, $event)"
          >
            {{ uploading[slot.key] ? "Enviando..." : "Clique aqui e cole (Ctrl+V) o print" }}
          </div>

          <div v-else class="relative aspect-[210/297] overflow-hidden rounded-md border border-hairline bg-paper">
            <img :src="staged[slot.key]" :alt="slot.label" class="h-full w-full object-contain" />
            <button
              type="button"
              class="absolute top-1.5 right-1.5 rounded-md bg-ink/80 px-2 py-1 text-[10.5px] font-semibold text-white transition-colors hover:bg-danger"
              @click="onRemove(slot.key)"
            >
              Remover
            </button>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>
