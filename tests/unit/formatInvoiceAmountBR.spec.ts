import { describe, expect, it } from "vitest";
import { formatInvoiceAmountBR, parseBrCurrency } from "../../app/utils/formatters";

describe("formatInvoiceAmountBR", () => {
  it("normaliza os formatos que chegam colados da PI", () => {
    expect(formatInvoiceAmountBR("$8,550.00")).toBe("8.550,00");
    expect(formatInvoiceAmountBR("9,210.00")).toBe("9.210,00");
    expect(formatInvoiceAmountBR("20.680,00")).toBe("20.680,00");
    expect(formatInvoiceAmountBR("$9,835")).toBe("9.835,00");
    expect(formatInvoiceAmountBR("US$2,780.00")).toBe("2.780,00");
  });

  it("trata separador único como milhar quando o último grupo tem 3 dígitos", () => {
    expect(formatInvoiceAmountBR("20.680")).toBe("20.680,00");
    expect(formatInvoiceAmountBR("1,500")).toBe("1.500,00");
    expect(formatInvoiceAmountBR("1.234.567")).toBe("1.234.567,00");
    expect(formatInvoiceAmountBR("1,234,567")).toBe("1.234.567,00");
  });

  it("trata separador único como decimal quando o último grupo não tem 3 dígitos", () => {
    expect(formatInvoiceAmountBR("9,5")).toBe("9,50");
    expect(formatInvoiceAmountBR("9,21")).toBe("9,21");
    expect(formatInvoiceAmountBR("100.50")).toBe("100,50");
    expect(formatInvoiceAmountBR("100.5")).toBe("100,50");
  });

  it("inteiro puro e centavos ausentes viram ,00", () => {
    expect(formatInvoiceAmountBR("2780")).toBe("2.780,00");
    expect(formatInvoiceAmountBR("US$ 40")).toBe("40,00");
  });

  it("casos de borda", () => {
    expect(formatInvoiceAmountBR("")).toBe("");
    expect(formatInvoiceAmountBR("$")).toBe("");
    expect(formatInvoiceAmountBR("abc")).toBe("");
    expect(formatInvoiceAmountBR(",50")).toBe("0,50");
    expect(formatInvoiceAmountBR("007,50")).toBe("7,50");
    expect(formatInvoiceAmountBR("8,5501")).toBe("8,55"); // trunca em 2 casas
  });

  it("o resultado é relido corretamente por parseBrCurrency", () => {
    expect(parseBrCurrency(formatInvoiceAmountBR("$8,550.00"))).toBe(8550);
    expect(parseBrCurrency(formatInvoiceAmountBR("20.680,00"))).toBe(20680);
    expect(parseBrCurrency(formatInvoiceAmountBR("$9,835"))).toBe(9835);
    expect(parseBrCurrency(formatInvoiceAmountBR("55.555,55"))).toBeCloseTo(55555.55, 2);
  });
});
