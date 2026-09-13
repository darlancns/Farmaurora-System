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

export function getRequiredSlots(patient: AnexoSlotSource): AnexoSlot[] {
  if (patient.empresa === "MAINZFARMA") return [];

  if (!isFarmauroraModeloCompleto(patient)) {
    const simpleSlots: AnexoSlot[] = [];

    for (let n = 1; n <= patient.remessas; n++) {
      simpleSlots.push({ key: `invoice_${n}`, label: `Invoice (remessa ${n})` });
      simpleSlots.push({ key: `cambio_${n}`, label: `Contrato de Câmbio (remessa ${n})` });
    }
    simpleSlots.push({ key: "servico", label: "Nota de Prestação de Serviço" });

    return simpleSlots;
  }

  const slots: AnexoSlot[] = [];

  for (let n = 1; n <= patient.remessas; n++) {
    slots.push({ key: `invoice_${n}`, label: `Invoice (remessa ${n})` });
    slots.push({ key: `cambio_${n}`, label: `Contrato de Câmbio (remessa ${n})` });
  }
  for (let n = 1; n <= patient.despachanteRemessas; n++) {
    slots.push({ key: `despachante_${n}`, label: `Despachante (remessa ${n})` });
  }
  for (let n = 1; n <= patient.transporteRemessas; n++) {
    slots.push({ key: `transporte_${n}`, label: `Transporte (remessa ${n})` });
  }
  if (patient.despesaTotal > 0 && patient.transporteTotal > 0) {
    slots.push({ key: "dsi", label: "DSI" });
  }
  slots.push({ key: "servico", label: "Nota de Prestação de Serviço" });

  return slots;
}
