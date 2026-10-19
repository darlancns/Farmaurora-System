import { defaultRouteForRole } from "./rbac";
import type { Role } from "./rbac";

/**
 * Páginas que existiram e foram removidas de propósito (ex.: "Início", commit
 * d9a0e8c). Quem ainda tem o endereço salvo em favoritos/links antigos cai no
 * destino padrão do cargo em vez de ver um 404.
 */
export const REMOVED_PAGE_ROUTES: readonly string[] = ["/inicio"];

/**
 * Destino para uma rota de página removida, ou null quando o path não é uma
 * delas. Reutiliza `defaultRouteForRole` — a mesma regra do login e do "/".
 */
export function redirectForRemovedPage(path: string, role: Role): string | null {
  const p = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return REMOVED_PAGE_ROUTES.includes(p) ? defaultRouteForRole(role) : null;
}
