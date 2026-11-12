// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import {
  LIMIAR_ARRASTO_PX,
  passouDoLimiar,
  podeIniciarArrastoRolagem,
  useArrastarParaRolar,
} from "../../app/composables/useArrastarParaRolar";

// Rolar o quadro do Kanban arrastando com o mouse FORA dos cards: limiar, alvo (card/controle), botão e tipo de
// ponteiro, supressão do click depois do arrasto, captura e snap.

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  vi.restoreAllMocks();
});

// Quadro de teste: cabeçalho, um card (com texto dentro), um botão e um menu.
function montar() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const estado: { arrastando?: { value: boolean } } = {};
  const app = createApp(
    defineComponent({
      setup() {
        const quadro = ref<HTMLElement | null>(null);
        const { arrastando } = useArrastarParaRolar(quadro);
        estado.arrastando = arrastando;
        return () =>
          h("div", { id: "quadro", ref: quadro, style: "scroll-snap-type: x mandatory" }, [
            h("header", { id: "cab" }, [h("span", { id: "titulo" }, "Em trânsito")]),
            h("article", { id: "card", "data-kanban-card": "", role: "button" }, [h("span", { id: "dentro-card" }, "Paciente")]),
            h("button", { id: "botao", type: "button" }, "‹"),
            h("div", { role: "menu" }, [h("span", { id: "no-menu" }, "x")]),
            h("div", { id: "vazio" }),
          ]);
      },
    }),
  );
  app.mount(host);
  montados.push({ unmount: () => app.unmount(), el: host });
  const quadro = host.querySelector<HTMLElement>("#quadro")!;
  quadro.scrollLeft = 500;
  const capturas = { set: vi.fn(), release: vi.fn() };
  let capturado = false;
  quadro.setPointerCapture = ((id: number) => {
    capturado = true;
    capturas.set(id);
  }) as HTMLElement["setPointerCapture"];
  quadro.releasePointerCapture = ((id: number) => {
    capturado = false;
    capturas.release(id);
  }) as HTMLElement["releasePointerCapture"];
  quadro.hasPointerCapture = (() => capturado) as HTMLElement["hasPointerCapture"];
  return { host, quadro, estado, capturas };
}

function ponteiro(
  alvo: Element,
  tipo: string,
  props: { clientX?: number; clientY?: number; button?: number; buttons?: number; pointerType?: string; pointerId?: number } = {},
): Event {
  const ev = new Event(tipo, { bubbles: true, cancelable: true });
  const valores = { clientX: 0, clientY: 0, button: 0, buttons: 1, pointerType: "mouse", pointerId: 1, ...props };
  for (const [k, v] of Object.entries(valores)) Object.defineProperty(ev, k, { value: v });
  alvo.dispatchEvent(ev);
  return ev;
}

describe("funções puras", () => {
  it("limiar de ~4px, só na horizontal", () => {
    expect(LIMIAR_ARRASTO_PX).toBe(4);
    expect(passouDoLimiar(3)).toBe(false);
    expect(passouDoLimiar(4)).toBe(true);
    expect(passouDoLimiar(-6)).toBe(true);
  });

  it("podeIniciar: só mouse e botão 0, dentro do quadro, fora de card e de controle", () => {
    const { host, quadro } = montar();
    const alvo = (id: string) => host.querySelector(`#${id}`);
    const base = { pointerType: "mouse", button: 0 };
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("titulo") }, quadro)).toBe(true);
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("vazio") }, quadro)).toBe(true);
    expect(podeIniciarArrastoRolagem({ ...base, target: quadro }, quadro)).toBe(true);
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("card") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("dentro-card") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("botao") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("no-menu") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ pointerType: "touch", button: 0, target: alvo("titulo") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ pointerType: "pen", button: 0, target: alvo("titulo") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ pointerType: "mouse", button: 2, target: alvo("titulo") }, quadro)).toBe(false);
    expect(podeIniciarArrastoRolagem({ ...base, target: document.body }, quadro)).toBe(false); // fora do quadro
    expect(podeIniciarArrastoRolagem({ ...base, target: alvo("titulo") }, null)).toBe(false);
  });
});

describe("arrasto de rolagem", () => {
  it("arrastar no cabeçalho rola na horizontal acompanhando o mouse; o vertical é ignorado; captura e desliga o snap", async () => {
    const { host, quadro, estado, capturas } = montar();
    const titulo = host.querySelector("#titulo")!;
    ponteiro(titulo, "pointerdown", { clientX: 300, clientY: 100 });
    ponteiro(quadro, "pointermove", { clientX: 298, clientY: 140 }); // abaixo do limiar: nada
    expect(quadro.scrollLeft).toBe(500);
    expect(estado.arrastando!.value).toBe(false);

    const ev = ponteiro(quadro, "pointermove", { clientX: 200, clientY: 300 });
    await nextTick();
    expect(estado.arrastando!.value).toBe(true);
    expect(ev.defaultPrevented).toBe(true); // sem seleção de texto
    expect(quadro.scrollLeft).toBe(600); // arrastou 100px para a esquerda → rola 100px para a direita
    expect(capturas.set).toHaveBeenCalledWith(1);
    expect(quadro.style.scrollSnapType).toBe("none");

    ponteiro(quadro, "pointermove", { clientX: 350, clientY: 0 });
    expect(quadro.scrollLeft).toBe(450);

    ponteiro(quadro, "pointerup", { clientX: 350, buttons: 0 });
    expect(estado.arrastando!.value).toBe(false);
    expect(capturas.release).toHaveBeenCalledWith(1);
    expect(quadro.style.scrollSnapType).toBe("x mandatory"); // restaurado
  });

  it("depois de arrastar, o click seguinte é suprimido; clique simples (sem passar do limiar) não", async () => {
    const { host, quadro } = montar();
    const clicks = vi.fn();
    host.addEventListener("click", clicks);

    ponteiro(host.querySelector("#titulo")!, "pointerdown", { clientX: 300 });
    ponteiro(quadro, "pointermove", { clientX: 250 });
    ponteiro(quadro, "pointerup", { clientX: 250, buttons: 0 });
    host.querySelector("#titulo")!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(clicks).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 0));
    ponteiro(host.querySelector("#titulo")!, "pointerdown", { clientX: 300 });
    ponteiro(quadro, "pointerup", { clientX: 302, buttons: 0 });
    host.querySelector("#titulo")!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(quadro.scrollLeft).toBe(550); // o clique simples não mexeu (550 = o arrasto anterior de 50px)
  });

  it("em cima de um card, de um botão ou com toque: não rola (o card segue com clique e arrastar próprios)", () => {
    const { host, quadro } = montar();
    for (const [id, props] of [
      ["dentro-card", {}],
      ["botao", {}],
      ["titulo", { pointerType: "touch" }],
      ["titulo", { button: 1 }],
    ] as const) {
      ponteiro(host.querySelector(`#${id}`)!, "pointerdown", { clientX: 300, ...props });
      ponteiro(quadro, "pointermove", { clientX: 100, ...props });
      ponteiro(quadro, "pointerup", { clientX: 100, buttons: 0, ...props });
      expect(quadro.scrollLeft, `${id} ${JSON.stringify(props)}`).toBe(500);
    }
  });

  it("termina em pointercancel e no blur da janela; botão já solto (soltou fora sem captura) não inicia", async () => {
    const { host, quadro, estado } = montar();
    ponteiro(host.querySelector("#titulo")!, "pointerdown", { clientX: 300 });
    ponteiro(quadro, "pointermove", { clientX: 200 });
    expect(estado.arrastando!.value).toBe(true);
    ponteiro(quadro, "pointercancel", { clientX: 200 });
    expect(estado.arrastando!.value).toBe(false);

    ponteiro(host.querySelector("#titulo")!, "pointerdown", { clientX: 300 });
    ponteiro(quadro, "pointermove", { clientX: 200 });
    window.dispatchEvent(new Event("blur"));
    expect(estado.arrastando!.value).toBe(false);
    const depoisBlur = quadro.scrollLeft;

    await new Promise((r) => setTimeout(r, 0));
    ponteiro(host.querySelector("#titulo")!, "pointerdown", { clientX: 300 });
    ponteiro(quadro, "pointermove", { clientX: 100, buttons: 0 }); // botão solto: encerra
    expect(estado.arrastando!.value).toBe(false);
    ponteiro(quadro, "pointermove", { clientX: 50, buttons: 1 });
    expect(quadro.scrollLeft).toBe(depoisBlur);
  });
});
