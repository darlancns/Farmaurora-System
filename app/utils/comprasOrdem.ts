import { isOrdemDaLista, ORDEM_PADRAO_DA_LISTA, type OrdemDaLista } from "#shared/utils/compraLista";

// A visão da lista de Compras ("Mais recentes" ou "Por número", e o sentido) que cada pessoa escolheu, lembrada NO NAVEGADOR (localStorage), uma por conta.
// Funções puras: qualquer falha (sem localStorage, modo privado, cota, valor estranho) volta ao padrão e a página funciona sem a preferência.

export interface PreferenciaDaLista {
  ordem: OrdemDaLista;
  /** Só vale com "numero": do menor para o maior. */
  inverter: boolean;
}

export const PREFERENCIA_PADRAO: PreferenciaDaLista = { ordem: ORDEM_PADRAO_DA_LISTA, inverter: false };

/** O mínimo de um Storage que estas funções usam (localStorage satisfaz; os testes passam um falso). */
export interface ArmazenamentoDaOrdem {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

/** A chave de UMA conta (duas pessoas no mesmo navegador não trocam a visão uma da outra). */
export function chaveDaOrdem(usuarioId: string | null | undefined): string {
  return `compras-lista-ordem:${usuarioId && usuarioId !== "" ? usuarioId : "sem-conta"}`;
}

/** A visão salva, ou null se não há (ou não dá para ler). */
export function lerOrdemSalva(armazenamento: ArmazenamentoDaOrdem | null | undefined, chave: string): PreferenciaDaLista | null {
  try {
    const texto = armazenamento?.getItem(chave);
    if (!texto) return null;
    const v: unknown = JSON.parse(texto);
    if (v === null || typeof v !== "object") return null;
    const { ordem, inverter } = v as { ordem?: unknown; inverter?: unknown };
    if (!isOrdemDaLista(ordem)) return null;
    return { ordem, inverter: ordem === "numero" && inverter === true };
  } catch {
    return null;
  }
}

/** Salva a visão; falha (sem localStorage, cota) é ignorada em silêncio. */
export function gravarOrdem(armazenamento: ArmazenamentoDaOrdem | null | undefined, chave: string, preferencia: PreferenciaDaLista): void {
  try {
    armazenamento?.setItem(chave, JSON.stringify(preferencia));
  } catch {
    // sem preferência lembrada: segue funcionando
  }
}

/** O localStorage do navegador, ou null (no servidor, ou com o acesso bloqueado: ler `localStorage` pode lançar). */
export function armazenamentoDoNavegador(): ArmazenamentoDaOrdem | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
