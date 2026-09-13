import { reactive, computed, ref, watch, type ComputedRef } from "vue";
import type { MedicamentoItem, Patient } from "#shared/types/Patient";
import { sumFilledValues, countFilled } from "../utils/patientFormCalculations";
import { getRequiredSlots } from "../utils/anexoSlots";
import { getAttachmentPublicUrl } from "#shared/utils/attachments";

export interface UsePatientAttachmentsOptions {
  editingPatient: () => Patient | null | undefined;
  remessas: () => number;
  custoImportacao: () => string;
  despesasPorRemessa: string[];
  transportesPorRemessa: string[];
  medicamentos: MedicamentoItem[];
}

export interface UsePatientAttachmentsReturn {
  requiredSlots: ComputedRef<ReturnType<typeof getRequiredSlots>>;
  liveAttachmentUrls: ComputedRef<Record<string, string>>;
  attachmentPreviews: ComputedRef<Record<string, string>>;
  attachedCount: ComputedRef<number>;
  stagedAttachments: Record<string, string>;
  showAttachmentsModal: ReturnType<typeof ref<boolean>>;
  buildSlotCaption: (key: string) => string | undefined;
  onStageAttachment: (slotKey: string, base64: string) => void;
  onUnstageAttachment: (slotKey: string) => void;
  resetStaged: () => void;
}

export function usePatientAttachments(options: UsePatientAttachmentsOptions): UsePatientAttachmentsReturn {
  const { despesasPorRemessa, transportesPorRemessa, medicamentos } = options;

  const stagedAttachments = reactive<Record<string, string>>({});
  const showAttachmentsModal = ref(false);

  function buildSlotCaption(key: string): string | undefined {
    if (/^invoice_\d+$/.test(key)) {
      const items = medicamentos.filter((item) => item.qtd && item.medicamento);
      if (!items.length) return undefined;
      return items.map((item) => `${item.qtd} ${item.medicamento}`).join("\n");
    }

    if (/^cambio_\d+$/.test(key)) {
      const custoImportacao = options.custoImportacao();
      return custoImportacao ? `R$ ${custoImportacao}` : undefined;
    }

    const despachanteMatch = key.match(/^despachante_(\d+)$/);
    if (despachanteMatch) {
      const value = despesasPorRemessa[Number(despachanteMatch[1]) - 1];
      return value ? `R$ ${value}` : undefined;
    }

    const transporteMatch = key.match(/^transporte_(\d+)$/);
    if (transporteMatch) {
      const value = transportesPorRemessa[Number(transporteMatch[1]) - 1];
      return value ? `R$ ${value}` : undefined;
    }

    return undefined;
  }

  const requiredSlots = computed(() =>
    getRequiredSlots({
      empresa: "FARMAURORA",
      despesaTotal: sumFilledValues(despesasPorRemessa),
      transporteTotal: sumFilledValues(transportesPorRemessa),
      remessas: options.remessas(),
      despachanteRemessas: countFilled(despesasPorRemessa),
      transporteRemessas: countFilled(transportesPorRemessa),
    }).map((slot) => ({ ...slot, caption: buildSlotCaption(slot.key) }))
  );

  const liveAttachmentUrls = computed<Record<string, string>>(() => {
    const patient = options.editingPatient();
    if (!patient) return {};
    const cacheBuster = Date.now();
    const map: Record<string, string> = {};
    for (const slot of requiredSlots.value) {
      if (patient.attachedSlots.includes(slot.key)) {
        map[slot.key] = `${getAttachmentPublicUrl(patient.id, slot.key)}?v=${cacheBuster}`;
      }
    }
    return map;
  });

  const attachmentPreviews = computed<Record<string, string>>(() =>
    options.editingPatient() ? liveAttachmentUrls.value : stagedAttachments
  );

  const attachedCount = computed(
    () => requiredSlots.value.filter((slot) => attachmentPreviews.value[slot.key] != null).length
  );

  watch(requiredSlots, (slots) => {
    const validKeys = new Set(slots.map((slot) => slot.key));
    for (const key of Object.keys(stagedAttachments)) {
      if (!validKeys.has(key)) delete stagedAttachments[key];
    }
  });

  function onStageAttachment(slotKey: string, base64: string): void {
    stagedAttachments[slotKey] = base64;
  }

  function onUnstageAttachment(slotKey: string): void {
    delete stagedAttachments[slotKey];
  }

  function resetStaged(): void {
    for (const key of Object.keys(stagedAttachments)) {
      delete stagedAttachments[key];
    }
  }

  return {
    requiredSlots,
    liveAttachmentUrls,
    attachmentPreviews,
    attachedCount,
    stagedAttachments,
    showAttachmentsModal,
    buildSlotCaption,
    onStageAttachment,
    onUnstageAttachment,
    resetStaged,
  };
}
