const COMBINING_DIACRITICAL_MARKS = new RegExp(`[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`, "g");

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .toLowerCase()
    .trim();
}

// Texto só com letras e números: além de normalizeText (sem acento, minúsculo), some TUDO o que não é a-z/0-9
// (hífen, barra, ponto, dois-pontos, espaços...). É a regra das buscas por código: "po-25-0123", "PO250123" e
// "25 0123" viram "po250123"/"250123". Usada pelo Nº Ordem do Follow-Up (processoBusca.ts) e por PO e AWB da DIR
// (dirFiltros.ts); vazio quando só havia pontuação/espaços.
export function normalizarSemPontuacao(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}
