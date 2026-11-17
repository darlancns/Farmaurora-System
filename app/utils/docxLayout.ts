import type { PatientComputed } from "#shared/types/Patient";
import { EMPRESA_TEMPLATE, TEMPLATE_FARMAURORA_COMPLETO } from "#shared/constants/empresas";
import { isFarmauroraModeloCompleto } from "./calculations";
import { type CriterioAnexos, contarPaginasAnexo, slotLabel } from "./anexoSlots";

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

// Slot nunca anexado → placeholder. Slot marcado como anexado → signed URL de leitura;
// se não há URL (arquivo ausente no Storage), erro claro citando o slot — NUNCA
// troca em silêncio por placeholder um anexo que deveria existir.
export function resolveAttachmentUrl(
  patient: PatientComputed,
  slotKey: string,
  signedUrls: Record<string, string>
): string {
  if (!patient.attachedSlots.includes(slotKey)) return PLACEHOLDER_IMAGE_URL;

  const url = signedUrls[slotKey];
  if (!url) {
    throw new Error(
      `O anexo "${slotLabel(slotKey)}" está marcado como anexado, mas o arquivo não foi encontrado no armazenamento. Anexe o documento de novo e gere o Word outra vez.`
    );
  }
  return url;
}

// Contagem 0 também não leva qualificador: é dado antigo (total > 0 sem contagem) e "( 0 REMESSA )"
// não descreve nada.
export function buildRemessaQualifier(remessasPreenchidas: number, totalRemessas: number): string {
  if (remessasPreenchidas === 0 || remessasPreenchidas === totalRemessas) return "";
  const plural = remessasPreenchidas > 1 ? "REMESSAS" : "REMESSA";
  return ` ( ${remessasPreenchidas} ${plural} )`;
}

export interface NumeracaoAnexos {
  mostrarDespachante: boolean;
  mostrarTransporte: boolean;
  mostrarDsi: boolean;
  /** null quando o anexo não existe (a linha da capa e as páginas somem). */
  numDespachante: number | null;
  numTransporte: number | null;
  numDsi: number | null;
  numServico: number;
}

// Invoice e Contrato de Câmbio são sempre o ANEXO 1. Os demais entram só se existirem, nesta ordem —
// Despachante, Transporte, DSI, Prestação de serviço — com contador sequencial a partir de 2. O mesmo
// número vai na capa ("N. … – ANEXO N") e no título da página ("ANEXO N: …").
export function calcularNumeracaoAnexos(criterio: CriterioAnexos): NumeracaoAnexos {
  let proximo = 2;
  const numerar = (existe: boolean): number | null => (existe ? proximo++ : null);

  const numDespachante = numerar(criterio.temDespachante);
  const numTransporte = numerar(criterio.temTransporte);
  const numDsi = numerar(criterio.temDsi);
  const numServico = proximo;

  return {
    mostrarDespachante: criterio.temDespachante,
    mostrarTransporte: criterio.temTransporte,
    mostrarDsi: criterio.temDsi,
    numDespachante,
    numTransporte,
    numDsi,
    numServico,
  };
}

// count = 0 → lista vazia (o loop do template não gera página). Numeração " 1", " 2"… só com 2+ itens.
export function buildLabelledAnexoList<T extends Record<string, string>>(
  count: number,
  buildAnexoFields: (n: number) => T
): Array<{ label: string } & T> {
  const effectiveCount = Math.max(count, 0);
  return Array.from({ length: effectiveCount }, (_, index) => {
    const n = index + 1;
    return {
      label: effectiveCount > 1 ? ` ${n}` : "",
      ...buildAnexoFields(n),
    };
  });
}

// Invoice/Câmbio (ANEXO 1) sempre existem: mesmo com remessas = 0 sai uma página de cada.
export function buildRemessasList(patient: PatientComputed, signedUrls: Record<string, string>) {
  return buildLabelledAnexoList(Math.max(patient.remessas, 1), (n) => ({
    anexo_invoice: resolveAttachmentUrl(patient, `invoice_${n}`, signedUrls),
    anexo_cambio: resolveAttachmentUrl(patient, `cambio_${n}`, signedUrls),
  }));
}

export function buildDespachanteList(patient: PatientComputed, signedUrls: Record<string, string>) {
  return buildLabelledAnexoList(contarPaginasAnexo(patient.despesaTotal, patient.despachanteRemessas), (n) => ({
    anexo_despachante: resolveAttachmentUrl(patient, `despachante_${n}`, signedUrls),
  }));
}

export function buildTransporteList(patient: PatientComputed, signedUrls: Record<string, string>) {
  return buildLabelledAnexoList(contarPaginasAnexo(patient.transporteTotal, patient.transporteRemessas), (n) => ({
    anexo_transporte: resolveAttachmentUrl(patient, `transporte_${n}`, signedUrls),
  }));
}

export function calculateFitSize(width: number, height: number, box: ImageBox): [number, number] {
  const scale = Math.min(box.maxWidth / width, box.maxHeight / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}
