import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// Rolar o quadro do Kanban ARRASTANDO com o mouse (botão esquerdo) em qualquer lugar FORA de um card: cabeçalhos das
// colunas, espaço entre colunas, área vazia abaixo dos cards, margens do quadro. Só horizontal (scrollLeft); a
// rolagem vertical continua sendo só a da página.
//
// - Só pointerType "mouse" e botão 0: em toque o quadro já rola nativamente (não interferimos).
// - Não começa em cima de um card (lá o clique abre o painel e o arrastar é o mover-com-confirmação) nem de um
//   controle interativo (button, a, input, select, textarea, menu) — inclusive os botões ‹ ›.
// - Limiar de LIMIAR_ARRASTO_PX antes de começar: clique simples sem mover não faz nada.
// - Ao passar do limiar: captura o ponteiro (continua mesmo saindo do quadro), cursor "grabbing", sem seleção de
//   texto, e desliga o scroll-snap (só existe abaixo de lg) até soltar. Termina em pointerup, pointercancel e blur.
// - Se arrastou, o click que vem logo depois do pointerup é suprimido.

/** Quanto o mouse precisa andar (px, na horizontal) antes de virar arrasto de rolagem. */
export const LIMIAR_ARRASTO_PX = 4;

/** Alvos que NUNCA iniciam o arrasto de rolagem: o card e qualquer controle interativo. */
export const SELETOR_CARD = "[data-kanban-card]";
export const SELETOR_CONTROLE =
  'button, a[href], input, select, textarea, [role="menu"], [role="menuitem"], [contenteditable="true"]';

export interface InicioArrasto {
  pointerType: string;
  button: number;
  target: EventTarget | null;
}

/** O pointerdown pode iniciar o arrasto de rolagem? Pura (testável). */
export function podeIniciarArrastoRolagem(evento: InicioArrasto, quadro: HTMLElement | null): boolean {
  if (!quadro) return false;
  if (evento.pointerType !== "mouse" || evento.button !== 0) return false;
  const alvo = evento.target;
  if (!(alvo instanceof Element) || !quadro.contains(alvo)) return false;
  if (alvo.closest(SELETOR_CARD)) return false;
  if (alvo.closest(SELETOR_CONTROLE)) return false;
  return true;
}

/** Passou do limiar? Só o deslocamento horizontal conta (o vertical é ignorado). Pura. */
export function passouDoLimiar(dx: number, limiar: number = LIMIAR_ARRASTO_PX): boolean {
  return Math.abs(dx) >= limiar;
}

export function useArrastarParaRolar(quadro: Ref<HTMLElement | null>) {
  const arrastando = ref(false);

  let pointerId: number | null = null;
  let inicioX = 0;
  let inicioScroll = 0;
  let snapAnterior: string | null = null;

  function limparSelecao(): void {
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // sem seleção: nada a fazer
    }
  }

  // Engole o PRIMEIRO click depois de um arrasto (o navegador o dispara no pointerup), em fase de captura.
  function suprimirProximoClick(): void {
    const engolir = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("click", engolir, true);
    };
    window.addEventListener("click", engolir, true);
    // Se nenhum click vier (ex.: soltou fora da janela), não deixa o listener esperando.
    setTimeout(() => window.removeEventListener("click", engolir, true), 0);
  }

  function terminar(): void {
    const el = quadro.value;
    const arrastou = arrastando.value;
    if (el && pointerId !== null) {
      try {
        if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // captura já liberada
      }
    }
    if (el && snapAnterior !== null) el.style.scrollSnapType = snapAnterior;
    snapAnterior = null;
    pointerId = null;
    arrastando.value = false;
    if (arrastou) suprimirProximoClick();
  }

  function onPointerDown(e: PointerEvent): void {
    if (!podeIniciarArrastoRolagem(e, quadro.value)) return;
    pointerId = e.pointerId;
    inicioX = e.clientX;
    inicioScroll = quadro.value!.scrollLeft;
  }

  function onPointerMove(e: PointerEvent): void {
    const el = quadro.value;
    if (!el || pointerId === null || e.pointerId !== pointerId) return;
    // Botão esquerdo já solto (ex.: soltou fora do quadro antes do limiar, sem captura): encerra sem rolar.
    if ((e.buttons & 1) === 0) {
      terminar();
      return;
    }
    const dx = e.clientX - inicioX;
    if (!arrastando.value) {
      if (!passouDoLimiar(dx)) return;
      arrastando.value = true;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // sem captura: segue funcionando enquanto o mouse estiver no quadro
      }
      snapAnterior = el.style.scrollSnapType;
      el.style.scrollSnapType = "none";
      limparSelecao();
    }
    e.preventDefault(); // sem seleção de texto durante o arrasto
    el.scrollLeft = inicioScroll - dx;
  }

  function onPointerUp(e: PointerEvent): void {
    if (pointerId === null || e.pointerId !== pointerId) return;
    terminar();
  }

  function onBlur(): void {
    if (pointerId !== null) terminar();
  }

  onMounted(() => {
    const el = quadro.value;
    if (!el) return;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onBlur);
  });

  onBeforeUnmount(() => {
    const el = quadro.value;
    el?.removeEventListener("pointerdown", onPointerDown);
    el?.removeEventListener("pointermove", onPointerMove);
    el?.removeEventListener("pointerup", onPointerUp);
    el?.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("blur", onBlur);
  });

  return { arrastando };
}
