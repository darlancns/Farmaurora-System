import { mascararNumeroPo } from "#shared/utils/numeroPo";

// Liga a máscara do PO (PO26-10-0471, shared/utils/numeroPo.ts) a um <input>. É O ÚNICO jeito de aplicar a máscara
// num campo: o PO do Follow-Up (useProcessoForm) e o da DIR (useDirForm) chamam esta função.
//
// Roda em todo "input", inclusive colar. Escreve o valor mascarado de volta no campo e devolve o cursor ao lugar
// certo (nada de pular para o fim ao digitar/apagar no meio). Devolve o valor mascarado, que o chamador guarda
// no estado do formulário. `anterior` é o valor do estado ANTES da edição (a máscara usa para distinguir apagar de
// digitar).
export function aplicarMascaraNumeroPo(campo: HTMLInputElement, anterior: string): string {
  const { valor, cursor } = mascararNumeroPo(campo.value, { anterior, cursor: campo.selectionStart });
  if (campo.value !== valor) campo.value = valor;
  try {
    campo.setSelectionRange(cursor, cursor);
  } catch {
    // sem seleção (campo fora do DOM): nada a restaurar
  }
  return valor;
}
