import { onBeforeUnmount, onMounted } from "vue";

// Abaixo de lg (BottomNav no lugar da sidebar) quem rola a página é o `<main id="app-main-content">`
// do DefaultLayout, não o body — então só `overflow: hidden` no body não impede a rolagem por trás
// do painel (roda, toque e teclado seguem rolando o <main>). Em lg+ a trava continua sendo só a do
// body: travar o <main> ali faria a barra de rolagem de 9px sumir e deslocaria o conteúdo ao abrir
// qualquer modal.
const MAIN_ID = "app-main-content";
const ABAIXO_DE_LG = "(max-width: 1023px)";

// Estado de módulo: várias travas podem estar ativas ao mesmo tempo (ex.: sheet + ConfirmDialog por
// cima). Só a primeira guarda o valor anterior e aplica; só a última a liberar restaura.
let travasAtivas = 0;
let bodyOverflowAnterior = "";
let mainTravado: HTMLElement | null = null; // != null só se a trava do <main> foi aplicada nesta rodada
let mainOverflowYAnterior = "";

/** Adquire uma trava de scroll e devolve a função que a libera (idempotente). */
export function adquirirTravaDeScroll(): () => void {
  if (travasAtivas === 0) {
    bodyOverflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Lido aqui (no onMounted do chamador), nunca na renderização: não interfere com a hydration.
    if (window.matchMedia(ABAIXO_DE_LG).matches) {
      const main = document.getElementById(MAIN_ID);
      if (main) {
        mainOverflowYAnterior = main.style.overflowY;
        main.style.overflowY = "hidden";
        mainTravado = main;
      }
    }
  }
  travasAtivas++;

  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    travasAtivas--;
    if (travasAtivas > 0) return;

    document.body.style.overflow = bodyOverflowAnterior;
    // Usa o que foi aplicado, não reavalia o matchMedia: a viewport pode ter mudado de largura
    // enquanto o painel estava aberto.
    if (mainTravado) {
      mainTravado.style.overflowY = mainOverflowYAnterior;
      mainTravado = null;
    }
  };
}

/**
 * Trava o scroll enquanto o componente estiver montado — body sempre; também o `<main>` abaixo de lg.
 * Extraído de BaseModal.vue pra NavMoreSheet e os sheets de filtros usarem sem duplicar.
 */
export function useLockBodyScroll(): void {
  let liberar: (() => void) | null = null;

  onMounted(() => {
    liberar = adquirirTravaDeScroll();
  });

  onBeforeUnmount(() => {
    liberar?.();
    liberar = null;
  });
}
