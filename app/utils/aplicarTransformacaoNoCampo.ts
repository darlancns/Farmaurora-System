// Aplica uma transformação de texto (maiúsculas, filtro de caracteres…) ao que a pessoa digitou ou colou num <input>:
// escreve o resultado de volta no campo, mantém o cursor onde estava (nada de pular para o fim ao editar no meio) e
// devolve o texto, que o chamador guarda no estado do formulário. É o único ponto que mexe no valor e no cursor dos
// campos de texto da DIR (medicamento, contrato de câmbio).
//
// Só mexe no que a pessoa edita: se a transformação não muda o texto, o campo (e o cursor) ficam como estão.
export function aplicarTransformacaoNoCampo(campo: HTMLInputElement, transformar: (texto: string) => string): string {
  const texto = campo.value;
  const novoTexto = transformar(texto);
  if (novoTexto === texto) return texto;

  const cursor = campo.selectionStart;
  campo.value = novoTexto;
  if (cursor !== null) {
    // O cursor acompanha o tamanho do que veio ANTES dele, já transformado (ex.: "ß" vira "SS"; caractere filtrado some).
    const novo = transformar(texto.slice(0, cursor)).length;
    try {
      campo.setSelectionRange(novo, novo);
    } catch {
      // sem seleção (campo fora do DOM): nada a restaurar
    }
  }
  return novoTexto;
}
