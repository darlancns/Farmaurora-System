import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adquirirTravaDeScroll } from "../../app/composables/useLockBodyScroll";

// Ambiente node, sem jsdom: `document`/`window` são stubs mínimos com o que o composable usa
// (body.style.overflow, getElementById("app-main-content").style.overflowY e matchMedia).
interface Estilo {
  overflow: string;
  overflowY: string;
}

function montarAmbiente(opts: { estreita: boolean; main?: boolean; bodyOverflow?: string; mainOverflowY?: string }) {
  const body = { style: { overflow: opts.bodyOverflow ?? "", overflowY: "" } as Estilo };
  const main = opts.main === false ? null : { style: { overflow: "", overflowY: opts.mainOverflowY ?? "" } as Estilo };
  const largura = { estreita: opts.estreita };
  const consultas: string[] = [];

  vi.stubGlobal("document", {
    body,
    getElementById: (id: string) => (id === "app-main-content" ? main : null),
  });
  vi.stubGlobal("window", {
    matchMedia: (q: string) => {
      consultas.push(q);
      return { matches: largura.estreita };
    },
  });
  return { body, main, largura, consultas };
}

describe("adquirirTravaDeScroll", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("viewport estreita (< lg)", () => {
    let amb: ReturnType<typeof montarAmbiente>;
    beforeEach(() => {
      amb = montarAmbiente({ estreita: true });
    });

    it("uma trava: trava body e <main>, e a liberação restaura os dois", () => {
      const liberar = adquirirTravaDeScroll();
      expect(amb.body.style.overflow).toBe("hidden");
      expect(amb.main!.style.overflowY).toBe("hidden");
      liberar();
      expect(amb.body.style.overflow).toBe("");
      expect(amb.main!.style.overflowY).toBe("");
    });

    it("consulta o breakpoint certo (abaixo de lg = max-width 1023px)", () => {
      const liberar = adquirirTravaDeScroll();
      expect(amb.consultas).toEqual(["(max-width: 1023px)"]);
      liberar();
    });

    it("duas travas, fecha a de cima primeiro: a de baixo continua travando", () => {
      const baixo = adquirirTravaDeScroll();
      const cima = adquirirTravaDeScroll();
      cima();
      expect(amb.body.style.overflow).toBe("hidden");
      expect(amb.main!.style.overflowY).toBe("hidden");
      baixo();
      expect(amb.body.style.overflow).toBe("");
      expect(amb.main!.style.overflowY).toBe("");
    });

    it("duas travas, fecha a de baixo primeiro: a de cima continua travando", () => {
      const baixo = adquirirTravaDeScroll();
      const cima = adquirirTravaDeScroll();
      baixo();
      expect(amb.body.style.overflow).toBe("hidden");
      expect(amb.main!.style.overflowY).toBe("hidden");
      cima();
      expect(amb.body.style.overflow).toBe("");
      expect(amb.main!.style.overflowY).toBe("");
    });

    it("a segunda trava não sobrescreve o valor anterior com 'hidden'", () => {
      montarAmbiente({ estreita: true, bodyOverflow: "auto", mainOverflowY: "scroll" });
      const a = adquirirTravaDeScroll();
      const b = adquirirTravaDeScroll();
      b();
      a();
      expect(document.body.style.overflow).toBe("auto");
      expect(document.getElementById("app-main-content")!.style.overflowY).toBe("scroll");
    });

    it("três travas em qualquer ordem terminam destravadas", () => {
      const ordens = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0], [0, 2, 1], [2, 0, 1]];
      for (const ordem of ordens) {
        const a = montarAmbiente({ estreita: true });
        const travas = [adquirirTravaDeScroll(), adquirirTravaDeScroll(), adquirirTravaDeScroll()];
        for (const i of ordem) travas[i]!();
        expect(a.body.style.overflow, `body (ordem ${ordem})`).toBe("");
        expect(a.main!.style.overflowY, `main (ordem ${ordem})`).toBe("");
      }
    });

    it("liberar duas vezes a mesma trava não destrava a outra (idempotente)", () => {
      const a = adquirirTravaDeScroll();
      const b = adquirirTravaDeScroll();
      a();
      a();
      expect(amb.body.style.overflow).toBe("hidden");
      expect(amb.main!.style.overflowY).toBe("hidden");
      b();
      expect(amb.body.style.overflow).toBe("");
    });

    it("restaura o valor anterior (inline) do body e do <main>", () => {
      const a = montarAmbiente({ estreita: true, bodyOverflow: "auto", mainOverflowY: "scroll" });
      const liberar = adquirirTravaDeScroll();
      expect(a.body.style.overflow).toBe("hidden");
      expect(a.main!.style.overflowY).toBe("hidden");
      liberar();
      expect(a.body.style.overflow).toBe("auto");
      expect(a.main!.style.overflowY).toBe("scroll");
    });

    it("sem <main> na página (ex.: layout de login): trava só o body, sem lançar", () => {
      const a = montarAmbiente({ estreita: true, main: false });
      const liberar = adquirirTravaDeScroll();
      expect(a.body.style.overflow).toBe("hidden");
      liberar();
      expect(a.body.style.overflow).toBe("");
    });

    it("viewport alargou com o painel aberto: ainda restaura o <main> (não reavalia o matchMedia)", () => {
      const liberar = adquirirTravaDeScroll();
      expect(amb.main!.style.overflowY).toBe("hidden");
      amb.largura.estreita = false; // girou o tablet / redimensionou a janela
      liberar();
      expect(amb.main!.style.overflowY).toBe("");
      expect(amb.body.style.overflow).toBe("");
      expect(amb.consultas).toHaveLength(1); // só a consulta da aquisição
    });

    it("depois de liberar tudo, uma nova trava volta a funcionar (estado não vaza)", () => {
      adquirirTravaDeScroll()();
      const liberar = adquirirTravaDeScroll();
      expect(amb.main!.style.overflowY).toBe("hidden");
      liberar();
      expect(amb.main!.style.overflowY).toBe("");
    });
  });

  describe("viewport larga (>= lg)", () => {
    it("NÃO mexe no <main>: só o body, como sempre foi", () => {
      const a = montarAmbiente({ estreita: false, mainOverflowY: "scroll" });
      const liberar = adquirirTravaDeScroll();
      expect(a.body.style.overflow).toBe("hidden");
      expect(a.main!.style.overflowY).toBe("scroll");
      liberar();
      expect(a.body.style.overflow).toBe("");
      expect(a.main!.style.overflowY).toBe("scroll");
    });

    it("duas travas nas duas ordens: <main> intocado e body restaurado no fim", () => {
      for (const ordem of [[0, 1], [1, 0]]) {
        const a = montarAmbiente({ estreita: false, bodyOverflow: "auto" });
        const travas = [adquirirTravaDeScroll(), adquirirTravaDeScroll()];
        travas[ordem[0]!]!();
        expect(a.body.style.overflow).toBe("hidden");
        expect(a.main!.style.overflowY).toBe("");
        travas[ordem[1]!]!();
        expect(a.body.style.overflow).toBe("auto");
        expect(a.main!.style.overflowY).toBe("");
      }
    });

    it("viewport estreitou com o painel aberto: não passa a travar o <main> no meio (decidido na aquisição)", () => {
      const a = montarAmbiente({ estreita: false });
      const liberar = adquirirTravaDeScroll();
      a.largura.estreita = true;
      liberar();
      expect(a.main!.style.overflowY).toBe("");
      expect(a.body.style.overflow).toBe("");
    });
  });
});
