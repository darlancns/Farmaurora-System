import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** Folga (px) para considerar que o quadro chegou na ponta (arredondamento de subpixel). */
export const FOLGA_PONTA_PX = 2;

/** Ainda há para onde rolar para a esquerda / para a direita? Pura. */
export function pontasDaRolagem(scrollLeft: number, scrollWidth: number, clientWidth: number): {
  esquerda: boolean;
  direita: boolean;
} {
  return {
    esquerda: scrollLeft > FOLGA_PONTA_PX,
    direita: scrollLeft + clientWidth < scrollWidth - FOLGA_PONTA_PX,
  };
}

/**
 * Botões ‹ › do quadro do Kanban: dizem se há para onde rolar (para esconder o botão da ponta) e rolam ~1 coluna
 * (largura da primeira coluna + o espaço entre colunas), com animação suave. A rolagem com Shift+roda e o trackpad
 * seguem do navegador; os botões só acompanham o estado pelo evento `scroll` e pelo tamanho (ResizeObserver).
 */
export function useRolagemQuadro(quadro: Ref<HTMLElement | null>) {
  const podeEsquerda = ref(false);
  const podeDireita = ref(false);
  let observador: ResizeObserver | null = null;

  function atualizar(): void {
    const el = quadro.value;
    if (!el) return;
    const p = pontasDaRolagem(el.scrollLeft, el.scrollWidth, el.clientWidth);
    podeEsquerda.value = p.esquerda;
    podeDireita.value = p.direita;
  }

  function passo(el: HTMLElement): number {
    const coluna = el.querySelector<HTMLElement>("section");
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    return coluna ? coluna.offsetWidth + gap : el.clientWidth * 0.8;
  }

  function rolar(direcao: -1 | 1): void {
    const el = quadro.value;
    if (!el) return;
    el.scrollBy({ left: direcao * passo(el), behavior: "smooth" });
  }

  onMounted(() => {
    const el = quadro.value;
    if (!el) return;
    el.addEventListener("scroll", atualizar, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      observador = new ResizeObserver(atualizar);
      observador.observe(el);
    }
    window.addEventListener("resize", atualizar);
    atualizar();
  });

  onBeforeUnmount(() => {
    quadro.value?.removeEventListener("scroll", atualizar);
    observador?.disconnect();
    window.removeEventListener("resize", atualizar);
  });

  return { podeEsquerda, podeDireita, rolar, atualizar };
}
