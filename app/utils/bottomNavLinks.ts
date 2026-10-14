export interface BottomNavSplit<T> {
  primary: T[];
  overflow: T[];
}

const BOTTOM_NAV_LIMIT = 5;
const BOTTOM_NAV_PRIMARY_COUNT = 4;

/**
 * Decide quais itens o BottomNav mostra como ícone fixo e quais vão pro
 * botão "Mais". Com 5 itens ou menos, todos cabem como ícones fixos; acima
 * disso, fixa os 4 primeiros (ordem = prioridade de uso, ver useNavLinks.ts)
 * e manda o resto pro "Mais".
 */
export function splitBottomNavLinks<T>(links: readonly T[]): BottomNavSplit<T> {
  if (links.length <= BOTTOM_NAV_LIMIT) {
    return { primary: [...links], overflow: [] };
  }
  return {
    primary: links.slice(0, BOTTOM_NAV_PRIMARY_COUNT),
    overflow: links.slice(BOTTOM_NAV_PRIMARY_COUNT),
  };
}
