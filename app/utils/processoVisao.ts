// Visão do Follow-Up para quem pode editar processos: Kanban (por status) ou Lista (a de sempre).
// Funções puras; o estado reativo fica em app/composables/useVisaoProcessos.ts.

export type VisaoProcessos = "kanban" | "lista";

/**
 * Visão padrão de quem PODE EDITAR processos (Etapa F do Kanban: "kanban"). Constante única. A Lista continua a um
 * clique e a escolha fica lembrada no navegador. Consultor e conta só-leitura nunca veem o Kanban (useVisaoProcessos).
 */
export const DEFAULT_VISAO: VisaoProcessos = "kanban";

/** Chave da preferência no localStorage (por navegador). */
export const CHAVE_VISAO_PROCESSOS = "followup-visao";

export function isVisaoProcessos(valor: unknown): valor is VisaoProcessos {
  return valor === "kanban" || valor === "lista";
}

// O mínimo de um Storage que estas funções usam (localStorage satisfaz; os testes passam um falso).
export interface ArmazenamentoVisao {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

/**
 * Visão salva, ou DEFAULT_VISAO. Qualquer falha (sem localStorage, modo privado, cota, valor estranho) volta ao
 * padrão: a página funciona sem a preferência.
 */
export function lerVisaoSalva(armazenamento: ArmazenamentoVisao | null | undefined): VisaoProcessos {
  try {
    const valor = armazenamento?.getItem(CHAVE_VISAO_PROCESSOS);
    return isVisaoProcessos(valor) ? valor : DEFAULT_VISAO;
  } catch {
    return DEFAULT_VISAO;
  }
}

/** Salva a visão; falha (sem localStorage, cota) é ignorada em silêncio. */
export function salvarVisao(armazenamento: ArmazenamentoVisao | null | undefined, visao: VisaoProcessos): void {
  try {
    armazenamento?.setItem(CHAVE_VISAO_PROCESSOS, visao);
  } catch {
    // sem preferência lembrada: segue funcionando
  }
}
