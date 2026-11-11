import { paginaInicial, type UsuarioRbac } from "./permissoesPagina";

/**
 * Páginas que existiram e foram removidas de propósito (ex.: "Início", commit
 * d9a0e8c). Quem ainda tem o endereço salvo em favoritos/links antigos cai no
 * destino padrão do cargo em vez de ver um 404.
 */
export const REMOVED_PAGE_ROUTES: readonly string[] = ["/inicio"];

/**
 * Destino para uma rota de página removida, ou null quando o path não é uma
 * delas. Reutiliza `paginaInicial` — a mesma regra do login e do "/": a primeira página que o usuário lê.
 */
export function redirectForRemovedPage(path: string, user: UsuarioRbac): string | null {
  const p = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return REMOVED_PAGE_ROUTES.includes(p) ? paginaInicial(user) : null;
}
