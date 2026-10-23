<script setup lang="ts">
import { reactive } from "vue";
import type { AnexoSlot } from "../../utils/anexoSlots";
import { useAttachments } from "../../composables/useAttachments";
import { useToast } from "../../composables/useToast";
import { ensurePngBlob } from "../../utils/attachmentImage";
import { getErrorMessage } from "../../utils/errorMessages";

// Seção de anexos do formulário de prestação (antes era o AttachmentsModal):
// a mesma lista de slots, agora expandida dentro do próprio formulário.
// Sem `patientId` (prestação nova) os prints ficam só em staging (memória) e sobem
// junto com o submit; com `patientId` (edição) sobem/removem na hora.
// `previews` mapeia slot → URL da imagem; uma chave com valor "" é um slot já
// anexado cuja URL ainda está carregando (ou ficou indisponível).
const props = defineProps<{
  slots: AnexoSlot[];
  previews: Record<string, string>;
  patientId?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  stage: [slotKey: string, image: Blob];
  unstage: [slotKey: string];
  "preview-error": [];
}>();

const { uploadAttachment, deleteAttachment } = useAttachments();
const { showToast } = useToast();

const uploading = reactive<Record<string, boolean>>({});

async function onPaste(slotKey: string, event: ClipboardEvent): Promise<void> {
  const items = event.clipboardData?.items;
  if (!items) return;

  const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  uploading[slotKey] = true;
  try {
    // Converte pra PNG já aqui: erro de conversão aparece na hora, antes de qualquer envio.
    const png = await ensurePngBlob(file);

    if (props.patientId) {
      await uploadAttachment(props.patientId, slotKey, png);
      showToast("Anexo salvo");
      return;
    }

    emit("stage", slotKey, png);
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao enviar anexo"));
  } finally {
    uploading[slotKey] = false;
  }
}

async function onRemove(slotKey: string): Promise<void> {
  if (props.patientId) {
    try {
      await deleteAttachment(props.patientId, slotKey);
      showToast("Anexo removido");
    } catch (e) {
      showToast(getErrorMessage(e, "Erro ao remover anexo"));
    }
    return;
  }

  emit("unstage", slotKey);
}
</script>

<template>
  <div id="attachments-panel" class="grid grid-cols-2 gap-3 rounded-lg border border-hairline bg-paper p-3 sm:grid-cols-3">
    <div v-for="slot in slots" :key="slot.key" class="flex min-w-0 flex-col gap-1.5">
      <p class="text-[11.5px] font-medium text-ink-soft">{{ slot.label }}</p>
      <p
        v-if="slot.caption"
        :title="slot.caption"
        class="-mt-1 line-clamp-3 text-[10px] leading-tight whitespace-pre-line text-ink-soft/70"
      >
        {{ slot.caption }}
      </p>

      <div
        v-if="!(slot.key in previews)"
        :id="`attachment-slot-${slot.key}`"
        tabindex="0"
        class="flex aspect-[210/297] cursor-text items-center justify-center rounded-md border border-dashed border-hairline bg-paper-raised px-3 text-center text-[12px] text-ink-soft transition-colors focus:border-accent-dark focus:bg-white focus:outline-none"
        @paste="onPaste(slot.key, $event)"
      >
        {{ uploading[slot.key] ? "Enviando..." : "Clique aqui e cole (Ctrl+V) o print" }}
      </div>

      <div v-else class="relative aspect-[210/297] overflow-hidden rounded-md border border-hairline bg-paper-raised">
        <img
          v-if="previews[slot.key]"
          :src="previews[slot.key]"
          :alt="slot.label"
          class="h-full w-full object-contain"
          @error="emit('preview-error')"
        />
        <p v-else class="flex h-full items-center justify-center px-3 text-center text-[12px] text-ink-soft">
          {{ loading ? "Carregando imagem..." : "Imagem indisponível. Feche e reabra esta seção para tentar de novo." }}
        </p>
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
</template>
