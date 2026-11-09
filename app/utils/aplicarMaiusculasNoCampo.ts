import { aplicarTransformacaoNoCampo } from "./aplicarTransformacaoNoCampo";

// Campo de texto "tudo em MAIÚSCULAS" (medicamento da DIR; no Follow-Up o medicamento faz o mesmo com
// `.toUpperCase()` em useProcessoForm). Roda em todo "input", inclusive colar: devolve o texto em maiúsculas, escreve
// de volta no campo e mantém o cursor onde estava.
//
// Só mexe no que a pessoa digita: um valor antigo, em minúsculas, aparece como está até ela editar o campo.
export function aplicarMaiusculasNoCampo(campo: HTMLInputElement): string {
  return aplicarTransformacaoNoCampo(campo, (texto) => texto.toUpperCase());
}
