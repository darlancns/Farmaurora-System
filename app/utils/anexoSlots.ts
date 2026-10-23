import type { EmpresaCodigo } from "#shared/types/Patient";
import { isFarmauroraModeloCompleto } from "./calculations";

export interface AnexoSlot {
  key: string;
  label: string;
  caption?: string;
}

export interface AnexoSlotSource {
  empresa: EmpresaCodigo;
  despesaTotal: number;
  transporteTotal: number;
  remessas: number;
  despachanteRemessas: number;
  transporteRemessas: number;
}

const NUMBERED_SLOT_LABEL: Record<string, string> = {
  invoice: "Invoice",
  cambio: "Contrato de Câmbio",
  despachante: "Despachante",
  transporte: "Transporte",
};

// Rótulo legível de um slotKey ("invoice_2" → "Invoice (remessa 2)"). Fonte única:
// getRequiredSlots (rótulos da tela) e as mensagens de erro do Word usam a mesma.
export function slotLabel(slotKey: string): string {
  const numbered = slotKey.match(/^(invoice|cambio|despachante|transporte)_(\d+)$/);
  if (numbered) return `${NUMBERED_SLOT_LABEL[numbered[1]!]} (remessa ${numbered[2]})`;
  if (slotKey === "dsi") return "DSI";
  if (slotKey === "servico") return "Nota de Prestação de Serviço";
  return slotKey;
}

export function getRequiredSlots(patient: AnexoSlotSource): AnexoSlot[] {
  if (patient.empresa === "MAINZFARMA") return [];

  if (!isFarmauroraModeloCompleto(patient)) {
    const simpleSlots: AnexoSlot[] = [];

    for (let n = 1; n <= patient.remessas; n++) {
      simpleSlots.push({ key: `invoice_${n}`, label: slotLabel(`invoice_${n}`) });
      simpleSlots.push({ key: `cambio_${n}`, label: slotLabel(`cambio_${n}`) });
    }
    simpleSlots.push({ key: "servico", label: slotLabel("servico") });

    return simpleSlots;
  }

  const slots: AnexoSlot[] = [];

  for (let n = 1; n <= patient.remessas; n++) {
    slots.push({ key: `invoice_${n}`, label: slotLabel(`invoice_${n}`) });
    slots.push({ key: `cambio_${n}`, label: slotLabel(`cambio_${n}`) });
  }
  for (let n = 1; n <= patient.despachanteRemessas; n++) {
    slots.push({ key: `despachante_${n}`, label: slotLabel(`despachante_${n}`) });
  }
  for (let n = 1; n <= patient.transporteRemessas; n++) {
    slots.push({ key: `transporte_${n}`, label: slotLabel(`transporte_${n}`) });
  }
  if (patient.despesaTotal > 0 && patient.transporteTotal > 0) {
    slots.push({ key: "dsi", label: slotLabel("dsi") });
  }
  slots.push({ key: "servico", label: slotLabel("servico") });

  return slots;
}
