// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoKanban from "../../app/components/processos/ProcessoKanban.vue";
import { FOLGA_PONTA_PX, pontasDaRolagem } from "../../app/composables/useRolagemQuadro";

// Ajustes do Kanban: só o quadro rola na horizontal, com os botões ‹ › (somem na ponta); sem rolagem vertical por
// coluna; colunas com largura mínima de 19,5rem.

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: "2026 - 426",
    numeroPo: "PO-26-1126/2",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    statusPagamento: "pendente",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  vi.restoreAllMocks();
});

describe("pontasDaRolagem", () => {
  it("esquerda só depois de rolar; direita enquanto falta conteúdo; folga de subpixel", () => {
    expect(pontasDaRolagem(0, 1600, 1000)).toEqual({ esquerda: false, direita: true });
    expect(pontasDaRolagem(300, 1600, 1000)).toEqual({ esquerda: true, direita: true });
    expect(pontasDaRolagem(600, 1600, 1000)).toEqual({ esquerda: true, direita: false });
    expect(pontasDaRolagem(600 - FOLGA_PONTA_PX + 0.5, 1600, 1000).direita).toBe(false);
    expect(pontasDaRolagem(0, 1000, 1000)).toEqual({ esquerda: false, direita: false }); // cabe tudo
  });
});

function quadro(): HTMLElement {
  return montar(defineComponent({ setup: () => () => h(ProcessoKanban, { processos: [proc("a")] }) }));
}

function simularLarguras(el: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, get: () => clientWidth });
}

describe("botões ‹ › do quadro", () => {
  it("cabe tudo: nenhum botão", async () => {
    const el = quadro();
    await nextTick();
    expect(el.querySelector("#btn-kanban-rolar-esquerda")).toBeNull();
    expect(el.querySelector("#btn-kanban-rolar-direita")).toBeNull();
  });

  it("com conteúdo à direita: só o ›; clicar rola ~1 coluna (largura + gap) suave; depois de rolar aparece o ‹", async () => {
    const el = quadro();
    const board = el.querySelector<HTMLElement>("#processo-kanban")!;
    simularLarguras(board, 1608, 1000);
    board.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(el.querySelector("#btn-kanban-rolar-esquerda")).toBeNull();
    const direita = el.querySelector<HTMLButtonElement>("#btn-kanban-rolar-direita")!;
    expect(direita.getAttribute("aria-label")).toBe("Rolar quadro para a direita");
    expect(direita.getAttribute("aria-controls")).toBe("processo-kanban");

    const coluna = board.querySelector<HTMLElement>("section")!;
    Object.defineProperty(coluna, "offsetWidth", { configurable: true, get: () => 312 });
    const scrollBy = vi.fn();
    board.scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
    direita.click();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    const arg = scrollBy.mock.calls[0]![0] as ScrollToOptions;
    expect(arg.behavior).toBe("smooth");
    expect(arg.left).toBeGreaterThanOrEqual(312);

    board.scrollLeft = 300;
    board.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(el.querySelector<HTMLButtonElement>("#btn-kanban-rolar-esquerda")!.getAttribute("aria-label")).toBe(
      "Rolar quadro para a esquerda",
    );
  });

  it("os botões ficam num trilho sticky no meio da janela, dentro da área do quadro", () => {
    const el = quadro();
    const trilho = el.querySelector("#processo-kanban-area > div")!;
    expect(trilho.className).toContain("sticky");
    expect(trilho.className).toContain("top-[45dvh]");
    expect(trilho.className).toContain("h-0");
  });
});

describe("layout das colunas", () => {
  it("só o quadro rola na horizontal; colunas sem altura fixa nem rolagem vertical própria; mínimo de 19,5rem em lg+", () => {
    const el = quadro();
    const board = el.querySelector("#processo-kanban")!;
    expect(board.className).toContain("overflow-x-auto");
    expect(board.className).not.toMatch(/overflow-y-|max-h-|\bh-full\b|min-h-0/);
    for (const coluna of el.querySelectorAll("section[id^='kanban-coluna-']")) {
      expect(coluna.className).toContain("lg:min-w-[19.5rem]");
      expect(coluna.className).toContain("lg:flex-1");
      expect(coluna.className).toContain("snap-start");
    }
    for (const lista of el.querySelectorAll("[id^='kanban-lista-']")) {
      expect(lista.className).not.toMatch(/overflow-y|max-h-/);
    }
  });

  it("card: 'Pasta · PO' do pior caso inteiro na linha, com a etiqueta Pendente ao lado", () => {
    const el = quadro();
    expect((el.querySelector("#card-pasta-po-a")!.textContent ?? "").trim()).toBe("2026 - 426 · PO-26-1126/2");
    expect(el.querySelector("#card-pagamento-a")!.textContent?.trim()).toBe("Pendente");
    // Mesma linha: os dois são filhos do mesmo flex.
    expect(el.querySelector("#card-pasta-po-a")!.parentElement).toBe(el.querySelector("#card-pagamento-a")!.parentElement);
  });
});
