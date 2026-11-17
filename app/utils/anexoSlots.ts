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

export interface CriterioAnexos {
  temDespachante: boolean;
  temTransporte: boolean;
  temDsi: boolean;
}

// Critério único de "tem despachante / transporte / DSI": vale para os slots do modal, os loops do
// Word, a capa e o DSI. Quem decide é o VALOR (total > 0), não a contagem de remessas.
export function criterioAnexos(patient: Pick<AnexoSlotSource, "despesaTotal" | "transporteTotal">): CriterioAnexos {
  const temDespachante = patient.despesaTotal > 0;
  const temTransporte = patient.transporteTotal > 0;
  return { temDespachante, temTransporte, temDsi: temDespachante && temTransporte };
}

// Quantas páginas (e slots) de despachante/transporte: sem valor → 0; com valor → uma por remessa
// preenchida. Dado antigo (total > 0 gravado antes do countFilled, com contagem 0) → 1, como sempre foi.
export function contarPaginasAnexo(total: number, remessasPreenchidas: number): number {
  if (total <= 0) return 0;
  return remessasPreenchidas > 0 ? remessasPreenchidas : 1;
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
  const { temDsi } = criterioAnexos(patient);
  const paginasDespachante = contarPaginasAnexo(patient.despesaTotal, patient.despachanteRemessas);
  const paginasTransporte = contarPaginasAnexo(patient.transporteTotal, patient.transporteRemessas);

  for (let n = 1; n <= patient.remessas; n++) {
    slots.push({ key: `invoice_${n}`, label: slotLabel(`invoice_${n}`) });
    slots.push({ key: `cambio_${n}`, label: slotLabel(`cambio_${n}`) });
  }
  for (let n = 1; n <= paginasDespachante; n++) {
    slots.push({ key: `despachante_${n}`, label: slotLabel(`despachante_${n}`) });
  }
  for (let n = 1; n <= paginasTransporte; n++) {
    slots.push({ key: `transporte_${n}`, label: slotLabel(`transporte_${n}`) });
  }
  if (temDsi) {
    slots.push({ key: "dsi", label: slotLabel("dsi") });
  }
  slots.push({ key: "servico", label: slotLabel("servico") });

  return slots;
}
