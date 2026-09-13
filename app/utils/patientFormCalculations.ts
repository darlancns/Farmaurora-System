import type { MedicamentoItem } from "#shared/types/Patient";
import { padTwoDigits, parseBrCurrency } from "./formatters";

// Funções puras extraídas de PatientForm.vue (Round 9-prep) — caracterizadas em
// tests/unit/patientFormCalculations.spec.ts. Alimentam despesaTotal/
// transporteTotal e despachanteRemessas/transporteRemessas do DTO de Patient,
// que por sua vez decidem quantos anexos são obrigatórios (ver getRequiredSlots
// em anexoSlots.ts).

// Soma os valores (moeda BR, ex: "150,00") de um array de campos de remessa.
// Valor vazio/mal formatado conta como 0 (parseBrCurrency nunca lança).
export function sumFilledValues(display: string[]): number {
  return display.reduce((total, value) => total + parseBrCurrency(value), 0);
}

// Conta quantas posições estão preenchidas (parseBrCurrency(v) > 0),
// independente de ordem ou de haver um "buraco" antes — vazio, "0", "0,00" ou
// valor mal formatado nunca contam (todos caem em 0 via parseBrCurrency).
export function countFilled(display: string[]): number {
  return display.filter((value) => parseBrCurrency(value) > 0).length;
}

// "03 unidades de X e 05 unidades de Y" — usada em descricaoCompra do DTO.
export function buildDescricaoCompra(items: MedicamentoItem[]): string {
  return items
    .filter((item) => Number(item.qtd) > 0 && item.medicamento.trim() !== "")
    .map((item) => `${padTwoDigits(Number(item.qtd))} unidades de ${item.medicamento.trim()}`)
    .join(" e ");
}

// "3 X e 5 Y" — usada em descricaoResumo do DTO (mesmo filtro de
// buildDescricaoCompra, mas sem o padStart da quantidade).
export function buildDescricaoResumo(items: MedicamentoItem[]): string {
  return items
    .filter((item) => Number(item.qtd) > 0 && item.medicamento.trim() !== "")
    .map((item) => `${item.qtd} ${item.medicamento.trim()}`)
    .join(" e ");
}

// Redimensiona `target` (em lugar, por referência) pra `size`: crescendo,
// preenche as novas posições com "". Encolhendo, TRUNCA do fim — as posições
// cortadas são perdidas (não há como recuperar o valor depois). Tamanho igual
// não faz nada.
export function resizeArray(target: string[], size: number): void {
  if (target.length < size) {
    while (target.length < size) target.push("");
  } else if (target.length > size) {
    target.length = size;
  }
}
