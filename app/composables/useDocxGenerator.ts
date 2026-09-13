import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import type { PatientComputed } from "#shared/types/Patient";
import { isFarmauroraModeloCompleto } from "../utils/calculations";
import { formatCurrency } from "../utils/formatters";
import {
  PLACEHOLDER_IMAGE_URL,
  type ImageBox,
  sanitizeFilenamePart,
  resolveTemplateUrl,
  resolveAttachmentUrl,
  buildRemessaQualifier,
  buildRemessasList,
  buildDespachanteList,
  buildTransporteList,
  calculateFitSize,
} from "../utils/docxLayout";

const MAX_IMAGE_WIDTH = 560;
const MAX_IMAGE_HEIGHT = 792;
// Seção de anexos do template_farmaurora.docx e do template_farmaurora_completo.docx
// usam margens reduzidas e idênticas (ver word/document.xml sectPr da 2ª seção
// de cada arquivo), liberando a mesma área útil maior nos dois.
const MAX_IMAGE_WIDTH_COMPLETO = 670;
const MAX_IMAGE_HEIGHT_COMPLETO = 820;

interface ImageCacheEntry {
  buffer: ArrayBuffer;
  size: [number, number];
}

async function loadImageEntry(url: string, box: ImageBox): Promise<ImageCacheEntry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao carregar imagem: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const size = calculateFitSize(bitmap.width, bitmap.height, box);
  bitmap.close();
  return { buffer, size };
}

async function buildImageCache(urls: string[], box: ImageBox): Promise<Map<string, ImageCacheEntry>> {
  const uniqueUrls = [...new Set(urls)];
  const cache = new Map<string, ImageCacheEntry>();

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        cache.set(url, await loadImageEntry(url, box));
      } catch {
        cache.set(url, await loadImageEntry(PLACEHOLDER_IMAGE_URL, box));
      }
    })
  );

  return cache;
}

export function useDocxGenerator() {
  async function generateDocx(patient: PatientComputed): Promise<void> {
    const templateUrl = resolveTemplateUrl(patient);
    const templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) {
      throw new Error("Não foi possível carregar o modelo do documento.");
    }
    const templateBuffer = await templateResponse.arrayBuffer();

    const remessaLabel = patient.remessas > 1 ? "REMESSAS" : "REMESSA";

    const renderData: Record<string, unknown> = {
      paciente: patient.paciente.toUpperCase(),
      descricao_compra: patient.descricaoCompra,
      remessas: String(patient.remessas),
      remessa_label: remessaLabel,
      valor_compra: formatCurrency(patient.custoImportacao),
      valor_nota: formatCurrency(patient.valorNota),
      taxa_imposto: String(Math.round(patient.taxaImposto * 1000) / 10).replace(".", ","),
      imposto: formatCurrency(patient.imposto),
      valor_total: formatCurrency(patient.valorTotal),
    };

    let imageUrls: string[] = [];
    const isCompleto = isFarmauroraModeloCompleto(patient);
    const imageBox: ImageBox = patient.empresa === "FARMAURORA"
      ? { maxWidth: MAX_IMAGE_WIDTH_COMPLETO, maxHeight: MAX_IMAGE_HEIGHT_COMPLETO }
      : { maxWidth: MAX_IMAGE_WIDTH, maxHeight: MAX_IMAGE_HEIGHT };

    if (patient.empresa === "FARMAURORA") {
      if (isCompleto) {
        const remessasList = buildRemessasList(patient);
        const despachanteList = buildDespachanteList(patient);
        const transporteList = buildTransporteList(patient);
        const mostrarDsi = patient.despesaTotal > 0 && patient.transporteTotal > 0;
        const anexoDsi = mostrarDsi ? resolveAttachmentUrl(patient, "dsi") : undefined;
        const anexoServico = resolveAttachmentUrl(patient, "servico");

        Object.assign(renderData, {
          despesa: formatCurrency(patient.despesaTotal),
          despachante_qualifier: buildRemessaQualifier(patient.despachanteRemessas, patient.remessas),
          despachanteList,
          transporte: formatCurrency(patient.transporteTotal),
          transporte_qualifier: buildRemessaQualifier(patient.transporteRemessas, patient.remessas),
          transporteList,
          remessasList,
          mostrarDsi,
          anexo_dsi: anexoDsi,
          anexo_servico: anexoServico,
        });

        imageUrls = [
          ...remessasList.flatMap((item) => [item.anexo_invoice, item.anexo_cambio]),
          ...despachanteList.map((item) => item.anexo_despachante),
          ...transporteList.map((item) => item.anexo_transporte),
          ...(anexoDsi ? [anexoDsi] : []),
          anexoServico,
        ];
      } else {
        const remessasList = buildRemessasList(patient);
        const anexoServico = resolveAttachmentUrl(patient, "servico");

        Object.assign(renderData, {
          remessasList,
          anexo_servico: anexoServico,
        });

        imageUrls = [
          ...remessasList.flatMap((item) => [item.anexo_invoice, item.anexo_cambio]),
          anexoServico,
        ];
      }
    }

    const imageCache = await buildImageCache(imageUrls, imageBox);

    function getCachedEntry(tagValue: string): ImageCacheEntry {
      const entry = imageCache.get(tagValue);
      if (!entry) {
        throw new Error(`Imagem não encontrada no cache pré-carregado: ${tagValue}`);
      }
      return entry;
    }

    const imageModule = new ImageModule({
      getImage: (tagValue) => getCachedEntry(tagValue).buffer,
      getSize: (_imgBuffer, tagValue) => getCachedEntry(tagValue).size,
    });

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: [imageModule],
    });

    doc.render(renderData);

    const blob = doc.getZip().generate({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }) as Blob;

    const filename = `PRESTAÇÃO DE CONTAS ${sanitizeFilenamePart(patient.paciente).toUpperCase()}.docx`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return { generateDocx };
}
