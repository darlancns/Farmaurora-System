import { describe, expect, it } from "vitest";
import { getRequiredSlots, slotLabel } from "../../app/utils/anexoSlots";
import { ensurePngBlob } from "../../app/utils/attachmentImage";

describe("slotLabel", () => {
  it.each([
    ["invoice_1", "Invoice (remessa 1)"],
    ["cambio_2", "Contrato de Câmbio (remessa 2)"],
    ["despachante_3", "Despachante (remessa 3)"],
    ["transporte_1", "Transporte (remessa 1)"],
    ["dsi", "DSI"],
    ["servico", "Nota de Prestação de Serviço"],
  ])("%s → %s", (key, label) => {
    expect(slotLabel(key)).toBe(label);
  });

  it("chave desconhecida (ex.: legado sem sufixo) devolve a própria chave", () => {
    expect(slotLabel("invoice")).toBe("invoice");
  });

  it("getRequiredSlots usa o mesmo rótulo", () => {
    const slots = getRequiredSlots({
      empresa: "FARMAURORA",
      despesaTotal: 10,
      transporteTotal: 10,
      remessas: 1,
      despachanteRemessas: 1,
      transporteRemessas: 1,
    });
    expect(slots.map((slot) => [slot.key, slot.label])).toEqual(
      slots.map((slot) => [slot.key, slotLabel(slot.key)])
    );
    expect(slots.map((slot) => slot.key)).toEqual([
      "invoice_1",
      "cambio_1",
      "despachante_1",
      "transporte_1",
      "dsi",
      "servico",
    ]);
  });
});

describe("ensurePngBlob", () => {
  it("PNG passa direto, sem re-codificar", async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    expect(await ensurePngBlob(png)).toBe(png);
  });

  it("conteúdo que não é imagem → erro claro", async () => {
    await expect(ensurePngBlob(new Blob(["texto"], { type: "text/plain" }))).rejects.toThrow(/não é uma imagem/);
  });

  it("imagem não-PNG que não dá pra converter → erro claro (nunca falha em silêncio)", async () => {
    // Ambiente de teste (node) não tem createImageBitmap/canvas: a conversão falha e o erro tem que ser explícito.
    await expect(ensurePngBlob(new Blob([new Uint8Array([1])], { type: "image/jpeg" }))).rejects.toThrow(
      /converter a imagem \(image\/jpeg\) para PNG/
    );
  });
});
