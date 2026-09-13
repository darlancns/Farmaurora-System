import { formatInvoiceAmountBR } from "../utils/formatters";

export function initialCurrencyStr(valor: number | null | undefined): string {
  return valor ? String(valor).replace(".", ",") : "";
}

export function useCurrencyField(
  getValue: () => string,
  setValue: (value: string) => void
): {
  normalizar: () => void;
  onPaste: (event: ClipboardEvent) => void;
} {
  function normalizar(): void {
    if (getValue().trim()) setValue(formatInvoiceAmountBR(getValue()));
  }

  function onPaste(event: ClipboardEvent): void {
    const texto = event.clipboardData?.getData("text");
    if (texto == null) return;
    event.preventDefault();
    setValue(formatInvoiceAmountBR(texto));
  }

  return { normalizar, onPaste };
}
