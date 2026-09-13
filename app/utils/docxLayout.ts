import type { PatientComputed } from "#shared/types/Patient";
import { getAttachmentPublicUrl } from "#shared/utils/attachments";
import { EMPRESA_TEMPLATE, TEMPLATE_FARMAURORA_COMPLETO } from "#shared/constants/empresas";
import { isFarmauroraModeloCompleto } from "./calculations";

// Funções puras extraídas de useDocxGenerator.ts (Round 1, item b) — nenhuma
// delas depende de `#imports`, DOM ou estado do composable, então saem daqui
// pra poderem ser testadas isoladamente (calculo de layout/nomeação do docx).
// Movidas mecanicamente: nenhuma linha de lógica foi alterada.

export const PLACEHOLDER_IMAGE_URL = "/images/anexo_pendente.png";

export interface ImageBox {
  maxWidth: number;
  maxHeight: number;
}

const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

export function sanitizeFilenamePart(value: string): string {
  return value.replace(INVALID_FILENAME_CHARS, " ").replace(/\s+/g, " ").trim();
}

export function resolveTemplateUrl(patient: PatientComputed): string {
  return isFarmauroraModeloCompleto(patient) ? TEMPLATE_FARMAURORA_COMPLETO : EMPRESA_TEMPLATE[patient.empresa];
}

export function resolveAttachmentUrl(patient: PatientComputed, slotKey: string): string {
  return patient.attachedSlots.includes(slotKey)
    ? getAttachmentPublicUrl(patient.id, slotKey)
    : PLACEHOLDER_IMAGE_URL;
}

export function buildRemessaQualifier(remessasPreenchidas: number, totalRemessas: number): string {
  if (remessasPreenchidas === totalRemessas) return "";
  const plural = remessasPreenchidas > 1 ? "REMESSAS" : "REMESSA";
  return ` ( ${remessasPreenchidas} ${plural} )`;
}

export function buildLabelledAnexoList<T extends Record<string, string>>(
  count: number,
  buildAnexoFields: (n: number) => T
): Array<{ label: string } & T> {
  const effectiveCount = Math.max(count, 1);
  return Array.from({ length: effectiveCount }, (_, index) => {
    const n = index + 1;
    return {
      label: effectiveCount > 1 ? ` ${n}` : "",
      ...buildAnexoFields(n),
    };
  });
}

export function buildRemessasList(patient: PatientComputed) {
  return buildLabelledAnexoList(patient.remessas, (n) => ({
    anexo_invoice: resolveAttachmentUrl(patient, `invoice_${n}`),
    anexo_cambio: resolveAttachmentUrl(patient, `cambio_${n}`),
  }));
}

export function buildDespachanteList(patient: PatientComputed) {
  return buildLabelledAnexoList(patient.despachanteRemessas, (n) => ({
    anexo_despachante: resolveAttachmentUrl(patient, `despachante_${n}`),
  }));
}

export function buildTransporteList(patient: PatientComputed) {
  return buildLabelledAnexoList(patient.transporteRemessas, (n) => ({
    anexo_transporte: resolveAttachmentUrl(patient, `transporte_${n}`),
  }));
}

export function calculateFitSize(width: number, height: number, box: ImageBox): [number, number] {
  const scale = Math.min(box.maxWidth / width, box.maxHeight / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}
