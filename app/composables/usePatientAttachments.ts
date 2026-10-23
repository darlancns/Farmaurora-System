import { reactive, computed, ref, watch, onBeforeUnmount, type ComputedRef } from "vue";
import type { MedicamentoItem, Patient } from "#shared/types/Patient";
import { sumFilledValues, countFilled } from "../utils/patientFormCalculations";
import { getRequiredSlots } from "../utils/anexoSlots";
import { getErrorMessage } from "../utils/errorMessages";
import { useAttachments } from "./useAttachments";
import { useToast } from "./useToast";

// Preview no modo edição usa signed URL de 5 min. A URL é renovada antes de vencer
// (checagem a cada minuto enquanto a seção está aberta), quando a seção é reaberta
// e quando uma <img> falha ao carregar — o preview nunca fica quebrado.
const PREVIEW_URL_TTL_SECONDS = 300;
const PREVIEW_URL_MAX_AGE_MS = 240_000;
const PREVIEW_CHECK_INTERVAL_MS = 60_000;
const PREVIEW_ERROR_REFRESH_MIN_GAP_MS = 5_000;

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
  attachmentPreviews: ComputedRef<Record<string, string>>;
  previewsLoading: ReturnType<typeof ref<boolean>>;
  attachedCount: ComputedRef<number>;
  stagedAttachments: Record<string, Blob>;
  showAttachments: ReturnType<typeof ref<boolean>>;
  buildSlotCaption: (key: string) => string | undefined;
  onStageAttachment: (slotKey: string, image: Blob) => void;
  onUnstageAttachment: (slotKey: string) => void;
  onPreviewError: () => Promise<void>;
}

export function usePatientAttachments(options: UsePatientAttachmentsOptions): UsePatientAttachmentsReturn {
  const { despesasPorRemessa, transportesPorRemessa, medicamentos } = options;
  const { fetchSignedUrls } = useAttachments();
  const { showToast } = useToast();

  // Prestação nova (sem patientId): o print fica só na memória do browser (Blob + object URL
  // pro preview) e sobe junto com o submit, quando o id existir.
  const stagedAttachments = reactive<Record<string, Blob>>({});
  const stagedPreviewUrls = reactive<Record<string, string>>({});
  const showAttachments = ref(false);

  // Edição: signed URLs de leitura dos slots já anexados.
  const liveUrls = reactive<Record<string, string>>({});
  const liveFetchedAt = ref(0);
  const previewsLoading = ref(false);
  let lastErrorRefreshAt = 0;

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

  // Slots exigidos que o paciente em edição já tem anexados (marcados no banco).
  const attachedSlotKeys = computed<string[]>(() => {
    const patient = options.editingPatient();
    if (!patient) return [];
    return requiredSlots.value.map((slot) => slot.key).filter((key) => patient.attachedSlots.includes(key));
  });

  // Edição: toda chave anexada aparece (URL "" enquanto carrega/indisponível); criação: os prints em staging.
  const attachmentPreviews = computed<Record<string, string>>(() => {
    if (!options.editingPatient()) return stagedPreviewUrls;
    return Object.fromEntries(attachedSlotKeys.value.map((key) => [key, liveUrls[key] ?? ""]));
  });

  const attachedCount = computed(() =>
    options.editingPatient() ? attachedSlotKeys.value.length : requiredSlots.value.filter((slot) => slot.key in stagedAttachments).length
  );

  async function refreshPreviews(): Promise<void> {
    const patient = options.editingPatient();
    const keys = attachedSlotKeys.value;
    if (!patient || keys.length === 0) return;

    previewsLoading.value = true;
    try {
      const urls = await fetchSignedUrls(patient.id, keys, PREVIEW_URL_TTL_SECONDS);
      if (options.editingPatient()?.id !== patient.id) return; // trocou de prestação no meio do caminho
      for (const key of Object.keys(liveUrls)) delete liveUrls[key];
      Object.assign(liveUrls, urls);
      liveFetchedAt.value = Date.now();
    } catch (e) {
      showToast(getErrorMessage(e, "Não foi possível carregar os anexos"));
    } finally {
      previewsLoading.value = false;
    }
  }

  function previewsAreStale(): boolean {
    const missingUrl = attachedSlotKeys.value.some((key) => !liveUrls[key]);
    return missingUrl || Date.now() - liveFetchedAt.value > PREVIEW_URL_MAX_AGE_MS;
  }

  async function refreshPreviewsIfStale(): Promise<void> {
    if (!options.editingPatient() || attachedSlotKeys.value.length === 0 || previewsLoading.value) return;
    if (previewsAreStale()) await refreshPreviews();
  }

  // <img> que falhou (URL vencida ou arquivo trocado): renova, com intervalo mínimo pra não entrar em loop.
  async function refreshPreviewsOnImageError(): Promise<void> {
    if (Date.now() - lastErrorRefreshAt < PREVIEW_ERROR_REFRESH_MIN_GAP_MS) return;
    lastErrorRefreshAt = Date.now();
    await refreshPreviews();
  }

  // Seção aberta (ou reaberta), prestação trocada ou slot anexado/removido → garante URLs válidas.
  watch(
    [showAttachments, () => options.editingPatient()?.id, () => attachedSlotKeys.value.join(",")],
    ([open, patientId], [, previousPatientId]) => {
      if (patientId !== previousPatientId) {
        for (const key of Object.keys(liveUrls)) delete liveUrls[key];
        liveFetchedAt.value = 0;
      }
      if (open && patientId) void refreshPreviewsIfStale();
    }
  );

  let checkTimer: ReturnType<typeof setInterval> | null = null;
  function stopCheckTimer(): void {
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = null;
  }
  watch(
    [showAttachments, () => options.editingPatient()?.id],
    ([open, patientId]) => {
      stopCheckTimer();
      if (open && patientId) checkTimer = setInterval(() => void refreshPreviewsIfStale(), PREVIEW_CHECK_INTERVAL_MS);
    },
    { immediate: true }
  );

  function dropStaged(slotKey: string): void {
    const previewUrl = stagedPreviewUrls[slotKey];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    delete stagedPreviewUrls[slotKey];
    delete stagedAttachments[slotKey];
  }

  watch(requiredSlots, (slots) => {
    const validKeys = new Set(slots.map((slot) => slot.key));
    for (const key of Object.keys(stagedAttachments)) {
      if (!validKeys.has(key)) dropStaged(key);
    }
  });

  function onStageAttachment(slotKey: string, image: Blob): void {
    dropStaged(slotKey);
    stagedAttachments[slotKey] = image;
    stagedPreviewUrls[slotKey] = URL.createObjectURL(image);
  }

  function onUnstageAttachment(slotKey: string): void {
    dropStaged(slotKey);
  }

  onBeforeUnmount(() => {
    stopCheckTimer();
    for (const key of Object.keys(stagedAttachments)) dropStaged(key);
  });

  return {
    requiredSlots,
    attachmentPreviews,
    previewsLoading,
    attachedCount,
    stagedAttachments,
    showAttachments,
    buildSlotCaption,
    onStageAttachment,
    onUnstageAttachment,
    onPreviewError: refreshPreviewsOnImageError,
  };
}
