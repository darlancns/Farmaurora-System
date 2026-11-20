// A "tela larga" é a do breakpoint lg do Tailwind (1024px): em lg+ a página Compras mostra as três colunas juntas; abaixo dela é um
// painel por vez (as abas). A visibilidade em si é CSS (max-lg:/lg:); isto serve para o que o JavaScript decide conforme a largura
// (trocar de aba ao clicar no checklist, rolar o campo para o meio ao focar no celular). Lido na hora do uso, sem estado.

export const LARGURA_LG_PX = 1024;

/** true em lg+ (1024px ou mais). Sem matchMedia (servidor, testes sem DOM) vale tela larga. */
export function telaLargaAgora(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(`(min-width: ${LARGURA_LG_PX}px)`).matches;
}
