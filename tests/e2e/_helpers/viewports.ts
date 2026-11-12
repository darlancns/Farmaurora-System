import { expect, type Page } from "@playwright/test";

// Viewports e asserções das telas grandes (monitores acima do 1920 da Cris).
//
// Os tetos das páginas (--container-* em app/assets/css/main.css) ficam todos acima de 1400px de conteúdo; o
// conteúdo útil do <main> é a janela − 192 (sidebar) − 48 (padding px-6). Então até 1639px de janela todas as
// páginas têm a mesma largura de sempre (min(1400, janela − 240)), e só a partir de 1640px os tetos novos valem.

export interface ViewportNomeado {
  name: string;
  width: number;
  height: number;
}

export const VIEWPORTS_TELAS_GRANDES: readonly ViewportNomeado[] = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3440x1440 (ultrawide)", width: 3440, height: 1440 },
];

/** Último pixel antes das telas grandes: aqui o layout tem de ser idêntico ao de antes (teto efetivo de 1400px). */
export const VIEWPORT_ANTES_TELAS_GRANDES: ViewportNomeado = {
  name: "1639x900 (último pixel antes das telas grandes)",
  width: 1639,
  height: 900,
};

/** Tetos em px, espelho dos tokens --container-pagina / --container-larga / --container-fluida. */
export const TETO_PAGINA = 1400;
export const TETO_LARGA = 1900;
export const TETO_FLUIDA = 2200;

interface MedidaTeto {
  x: number;
  w: number;
  conteudoEsq: number;
  conteudoDir: number;
  overflowDocumento: boolean;
  overflowMain: boolean;
}

async function medirTeto(page: Page, seletor: string): Promise<MedidaTeto> {
  return page.evaluate((sel) => {
    const main = document.querySelector("#app-main-content") as HTMLElement;
    const el = document.querySelector(sel) as HTMLElement;
    const estilo = getComputedStyle(main);
    const m = main.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // clientWidth exclui a barra de rolagem vertical do <main> (quando houver)
    const conteudoEsq = m.left + main.clientLeft + parseFloat(estilo.paddingLeft);
    const conteudoDir = m.left + main.clientLeft + main.clientWidth - parseFloat(estilo.paddingRight);
    return {
      x: r.left,
      w: r.width,
      conteudoEsq,
      conteudoDir,
      overflowDocumento: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      // o <main> tem overflow-x-hidden: conteúdo largo demais ficaria só cortado, então mede pelo scrollWidth
      overflowMain: main.scrollWidth > main.clientWidth + 1,
    };
  }, seletor);
}

/**
 * Contêiner da página: largura = min(teto, área útil do <main>), centralizado nela, e sem rolagem horizontal
 * (nem da janela nem escondida dentro do <main>).
 */
export async function verificarTetoCentralizado(page: Page, seletor: string, teto: number): Promise<void> {
  const m = await medirTeto(page, seletor);
  const disponivel = m.conteudoDir - m.conteudoEsq;
  expect(m.w, `${seletor}: largura ${m.w}px <= teto ${teto}px`).toBeLessThanOrEqual(teto + 0.5);
  expect(Math.abs(m.w - Math.min(teto, disponivel)), `${seletor}: ocupa min(teto, ${disponivel}px)`).toBeLessThanOrEqual(1);
  const sobraEsq = m.x - m.conteudoEsq;
  const sobraDir = m.conteudoDir - (m.x + m.w);
  expect(Math.abs(sobraEsq - sobraDir), `${seletor}: centralizado (sobra ${sobraEsq}px x ${sobraDir}px)`).toBeLessThanOrEqual(1);
  expect(m.overflowDocumento, `${seletor}: sem rolagem horizontal na janela`).toBe(false);
  expect(m.overflowMain, `${seletor}: sem conteúdo cortado no <main>`).toBe(false);
}

/** Teto efetivo para um viewport: até 1639px de janela é sempre o de antes (1400px). */
export function tetoEsperado(viewport: ViewportNomeado, teto: number): number {
  return viewport.width < 1640 ? TETO_PAGINA : teto;
}
