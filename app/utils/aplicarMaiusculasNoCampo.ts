// Campo de texto "tudo em MAIÚSCULAS" (medicamento da DIR; no Follow-Up o medicamento faz o mesmo com
// `.toUpperCase()` em useProcessoForm). Roda em todo "input", inclusive colar: devolve o texto em maiúsculas, escreve
// de volta no campo e mantém o cursor onde estava (nada de pular para o fim ao editar no meio).
//
// Só mexe no que a pessoa digita: um valor antigo, em minúsculas, aparece como está até ela editar o campo.
export function aplicarMaiusculasNoCampo(campo: HTMLInputElement): string {
  const texto = campo.value;
  const maiusculo = texto.toUpperCase();
  if (maiusculo === texto) return texto;

  const cursor = campo.selectionStart;
  campo.value = maiusculo;
  if (cursor !== null) {
    // `ß` vira "SS": o cursor acompanha o tamanho do que veio antes dele.
    const novo = texto.slice(0, cursor).toUpperCase().length;
    try {
      campo.setSelectionRange(novo, novo);
    } catch {
      // sem seleção (campo fora do DOM): nada a restaurar
    }
  }
  return maiusculo;
}
