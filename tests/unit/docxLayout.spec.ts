import { describe, expect, it } from "vitest";
import type { PatientComputed } from "#shared/types/Patient";
import {
  PLACEHOLDER_IMAGE_URL,
  buildDespachanteList,
  buildLabelledAnexoList,
  buildRemessaQualifier,
  buildRemessasList,
  buildTransporteList,
  calculateFitSize,
  resolveAttachmentUrl,
  resolveTemplateUrl,
  sanitizeFilenamePart,
} from "../../app/utils/docxLayout";

// TESTE DE CARACTERIZAÇÃO — Round 1, item (b): funções puras extraídas de
// useDocxGenerator.ts pra app/utils/docxLayout.ts. Documenta o comportamento
// ATUAL de cada função, sem corrigir nada — inclusive os pontos assinalados
// no relatório final como "a revisar".

function buildPatient(overrides: Partial<PatientComputed> = {}): PatientComputed {
  const base = {
    id: "p_1",
    data: "2026-09-10",
    paciente: "João da Silva",
    descricaoCompra: "Importação de medicamento X",
    descricaoResumo: "Medicamento X",
    medicamentos: [],
    empresa: "FARMAURORA" as const,
    consultor: "André Vitório" as const,
    alvara: 1000,
    custoImportacao: 200,
    despesaTotal: 0,
    transporteTotal: 0,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    attachedSlots: [] as string[],
    createdAt: "2026-09-10T00:00:00.000Z",
    valorNota: 200,
    imposto: 32,
    taxaImposto: 0.16,
    valorTotal: 1000,
    isNotaCheia: false,
  };
  return { ...base, ...overrides };
}

describe("buildRemessaQualifier", () => {
  it("remessasPreenchidas === totalRemessas → sem qualificador (string vazia)", () => {
    expect(buildRemessaQualifier(2, 2)).toBe("");
  });

  it("1 de N remessas preenchidas → singular ' ( 1 REMESSA )'", () => {
    expect(buildRemessaQualifier(1, 2)).toBe(" ( 1 REMESSA )");
  });

  it("2+ de N remessas preenchidas → plural ' ( 2 REMESSAS )' (exemplo citado na auditoria)", () => {
    expect(buildRemessaQualifier(2, 3)).toBe(" ( 2 REMESSAS )");
  });

  it("FRONTEIRA: 0 preenchidas (e total > 0) → ainda usa o singular ' ( 0 REMESSA )'", () => {
    // O plural só entra com `> 1`; 0 cai no singular junto com 1. Documentado
    // como está, não é óbvio que seja intencional — ver relatório final.
    expect(buildRemessaQualifier(0, 2)).toBe(" ( 0 REMESSA )");
  });
});

describe("buildLabelledAnexoList", () => {
  it("count = 0 → NÃO retorna lista vazia: sempre pelo menos 1 item (label vazio)", () => {
    // effectiveCount = Math.max(count, 1) nunca deixa a lista vazia de verdade.
    const result = buildLabelledAnexoList(0, (n) => ({ x: `v${n}` }));
    expect(result).toEqual([{ label: "", x: "v1" }]);
  });

  it("count = 1 → 1 item, label vazio (sem número)", () => {
    const result = buildLabelledAnexoList(1, (n) => ({ x: `v${n}` }));
    expect(result).toEqual([{ label: "", x: "v1" }]);
  });

  it("count = 3 → 3 itens, labels ' 1' / ' 2' / ' 3'", () => {
    const result = buildLabelledAnexoList(3, (n) => ({ x: `v${n}` }));
    expect(result).toEqual([
      { label: " 1", x: "v1" },
      { label: " 2", x: "v2" },
      { label: " 3", x: "v3" },
    ]);
  });
});

describe("buildRemessasList / buildDespachanteList / buildTransporteList", () => {
  it("buildRemessasList: remessas = 0 → 1 item (placeholder nas duas imagens)", () => {
    const patient = buildPatient({ remessas: 0, attachedSlots: [] });
    expect(buildRemessasList(patient)).toEqual([
      { label: "", anexo_invoice: PLACEHOLDER_IMAGE_URL, anexo_cambio: PLACEHOLDER_IMAGE_URL },
    ]);
  });

  it("buildRemessasList: remessas = 1 sem anexo → 1 item com placeholder", () => {
    const patient = buildPatient({ remessas: 1, attachedSlots: [] });
    expect(buildRemessasList(patient)).toEqual([
      { label: "", anexo_invoice: PLACEHOLDER_IMAGE_URL, anexo_cambio: PLACEHOLDER_IMAGE_URL },
    ]);
  });

  it("buildRemessasList: remessas = 2 com anexos parciais → 2 itens, cada slot resolvido independente", () => {
    const patient = buildPatient({
      remessas: 2,
      attachedSlots: ["invoice_1", "cambio_2"],
    });
    expect(buildRemessasList(patient)).toEqual([
      { label: " 1", anexo_invoice: "/uploads/attachments/p_1/invoice_1.png", anexo_cambio: PLACEHOLDER_IMAGE_URL },
      { label: " 2", anexo_invoice: PLACEHOLDER_IMAGE_URL, anexo_cambio: "/uploads/attachments/p_1/cambio_2.png" },
    ]);
  });

  it("buildDespachanteList: despachanteRemessas = 0 → 1 item com placeholder (mesma regra de count=0)", () => {
    const patient = buildPatient({ despachanteRemessas: 0 });
    expect(buildDespachanteList(patient)).toEqual([{ label: "", anexo_despachante: PLACEHOLDER_IMAGE_URL }]);
  });

  it("buildDespachanteList: despachanteRemessas = 3 com 1 anexo no meio → labels numeradas, só o item 2 resolvido", () => {
    const patient = buildPatient({ despachanteRemessas: 3, attachedSlots: ["despachante_2"] });
    expect(buildDespachanteList(patient)).toEqual([
      { label: " 1", anexo_despachante: PLACEHOLDER_IMAGE_URL },
      { label: " 2", anexo_despachante: "/uploads/attachments/p_1/despachante_2.png" },
      { label: " 3", anexo_despachante: PLACEHOLDER_IMAGE_URL },
    ]);
  });

  it("buildTransporteList: transporteRemessas = 0 → 1 item com placeholder", () => {
    const patient = buildPatient({ transporteRemessas: 0 });
    expect(buildTransporteList(patient)).toEqual([{ label: "", anexo_transporte: PLACEHOLDER_IMAGE_URL }]);
  });

  it("buildTransporteList: transporteRemessas = 2 com todos anexados", () => {
    const patient = buildPatient({
      transporteRemessas: 2,
      attachedSlots: ["transporte_1", "transporte_2"],
    });
    expect(buildTransporteList(patient)).toEqual([
      { label: " 1", anexo_transporte: "/uploads/attachments/p_1/transporte_1.png" },
      { label: " 2", anexo_transporte: "/uploads/attachments/p_1/transporte_2.png" },
    ]);
  });
});

describe("resolveAttachmentUrl", () => {
  it("slot não anexado → URL placeholder", () => {
    const patient = buildPatient({ attachedSlots: [] });
    expect(resolveAttachmentUrl(patient, "servico")).toBe(PLACEHOLDER_IMAGE_URL);
  });

  it("slot anexado → URL pública do anexo (patient.id + slotKey)", () => {
    const patient = buildPatient({ id: "p_42", attachedSlots: ["servico"] });
    expect(resolveAttachmentUrl(patient, "servico")).toBe("/uploads/attachments/p_42/servico.png");
  });
});

describe("calculateFitSize", () => {
  it("imagem mais larga que alta, gargalo na largura", () => {
    // scale = min(560/1000, 792/500) = min(0.56, 1.584) = 0.56
    expect(calculateFitSize(1000, 500, { maxWidth: 560, maxHeight: 792 })).toEqual([560, 280]);
  });

  it("imagem pequena (upscale), gargalo na largura, com arredondamento não-exato", () => {
    // scale = min(670/100, 820/100) = min(6.7, 8.2) = 6.7
    expect(calculateFitSize(100, 100, { maxWidth: 670, maxHeight: 820 })).toEqual([670, 670]);
  });

  it("arredondamento: a dimensão que não bate exato é arredondada (Math.round)", () => {
    // scale = min(560/333, 792/250) = min(1.681981..., 3.168) = 1.681981...
    // largura: 333 * scale = 560 exato. altura: 250 * scale = 420.4204... -> 420.
    expect(calculateFitSize(333, 250, { maxWidth: 560, maxHeight: 792 })).toEqual([560, 420]);
  });
});

describe("resolveTemplateUrl", () => {
  it("FARMAURORA, modelo não-completo → template padrão da Farmaurora", () => {
    const patient = buildPatient({ empresa: "FARMAURORA", despesaTotal: 0, transporteTotal: 0 });
    expect(resolveTemplateUrl(patient)).toBe("/templates/template_farmaurora.docx");
  });

  it("FARMAURORA, modelo completo (despesa e transporte > 0) → template completo", () => {
    const patient = buildPatient({ empresa: "FARMAURORA", despesaTotal: 50, transporteTotal: 50 });
    expect(resolveTemplateUrl(patient)).toBe("/templates/template_farmaurora_completo.docx");
  });

  it("MAINZFARMA → template padrão da MainzFarma, mesmo com despesa/transporte > 0", () => {
    // isFarmauroraModeloCompleto exige empresa === "FARMAURORA"; MainzFarma
    // nunca usa o modelo completo, não importa despesaTotal/transporteTotal.
    const patient = buildPatient({ empresa: "MAINZFARMA", despesaTotal: 50, transporteTotal: 50 });
    expect(resolveTemplateUrl(patient)).toBe("/templates/template_mainzfarma.docx");
  });
});

describe("sanitizeFilenamePart", () => {
  it("substitui caracteres inválidos de nome de arquivo por espaço, colapsa múltiplos espaços e preserva acentos", () => {
    // Aspas, barra e dois-pontos viram espaço; "í"/"ã" (não são chars inválidos
    // de arquivo) são preservados.
    expect(sanitizeFilenamePart('João "Vítor" / Silva:Teste')).toBe("João Vítor Silva Teste");
  });

  it("caractere inválido na ponta é removido pelo trim() final, não vira espaço solto", () => {
    expect(sanitizeFilenamePart("/Nome*")).toBe("Nome");
  });

  it("string sem nenhum caractere inválido não é alterada (além de trim)", () => {
    expect(sanitizeFilenamePart("  Maria Eduarda  ")).toBe("Maria Eduarda");
  });
});
