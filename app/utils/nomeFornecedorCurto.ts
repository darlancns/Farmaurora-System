// Nome do fornecedor SÓ PARA EXIBIÇÃO no card do Kanban. Os fornecedores da lista fixa são gravados como
// "Nome - País" (ex.: "Beldimed - Bélgica"); o card mostra só "Beldimed". O dado salvo, o painel, o formulário,
// os filtros e a busca continuam com o texto completo.
//
// Regra: se o texto contém " - " (hífen entre espaços), mostra o que vem ANTES do ÚLTIMO " - " (com trim);
// sem " - ", mostra o texto inteiro (com trim); se o resultado ficar vazio (ex.: " - Bélgica"), mostra o texto
// original (com trim). null/undefined/só espaços → "".
const SEPARADOR = " - ";

export function nomeFornecedorCurto(valor: string | null | undefined): string {
  if (valor == null) return "";
  const original = valor.trim();
  if (!original) return "";
  const i = valor.lastIndexOf(SEPARADOR);
  if (i < 0) return original;
  const curto = valor.slice(0, i).trim();
  return curto || original;
}
