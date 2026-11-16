// Exibição da Pasta do Follow-Up. A pasta é OPCIONAL: processo sem pasta é gravado como "" (texto vazio). Linhas
// antigas podem vir com null/undefined, por isso todas as funções aceitam esses valores.
//
// Regra de exibição (decisão da Cris): pasta vazia é OMITIDA — sem "Sem pasta", sem placeholder, sem separador
// ("·", "()") sobrando. Funções puras; usadas pelas telas (Kanban, Lista, painel, detalhe, sino) e pelos textos
// de avisos e notificações (cliente e servidor).

/** A pasta sem espaços nas pontas; null/undefined/só espaços = "". */
export function pastaLimpa(pasta: string | null | undefined): string {
  return typeof pasta === "string" ? pasta.trim() : "";
}

/** O processo tem pasta preenchida? */
export function temPasta(pasta: string | null | undefined): boolean {
  return pastaLimpa(pasta) !== "";
}

/**
 * Pasta e PO numa linha: "2026 - 234 · PO26-10-0471"; só a pasta; só o PO; ou "" (nenhum dos dois).
 * `prefixoPasta` (ex.: "Pasta ") só entra quando HÁ pasta.
 */
export function rotuloPastaPo(
  pasta: string | null | undefined,
  numeroPo: string | null | undefined,
  prefixoPasta = "",
): string {
  const p = pastaLimpa(pasta);
  const po = typeof numeroPo === "string" ? numeroPo.trim() : "";
  return [p ? `${prefixoPasta}${p}` : "", po].filter(Boolean).join(" · ");
}

/** Paciente com a pasta entre parênteses: "Maria (2026 - 234)"; sem pasta, só "Maria". */
export function pacienteComPasta(paciente: string, pasta: string | null | undefined): string {
  const p = pastaLimpa(pasta);
  return p ? `${paciente} (${p})` : paciente;
}
