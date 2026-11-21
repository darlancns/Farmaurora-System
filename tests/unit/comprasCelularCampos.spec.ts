// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import AppSearchSelect, { type OpcaoBusca } from "../../app/components/AppSearchSelect.vue";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../app/utils/comprasEstilos";
import { LARGURA_LG_PX, telaLargaAgora } from "../../app/utils/telaLarga";
import { compraComUmMedicamento, itemDeTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// Campos do formulário único no CELULAR: 16px/44px, rótulo acima do controle, controles por medicamento empilhados, e a lista de sugestões
// não é cortada. O que muda com a largura é CSS; o que o JS decide por largura usa
// telaLargaAgora (matchMedia simulado em 375, 1280 e 2130 px).

let montado: FormularioMontado | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

/** Simula a janela: matchMedia responde só a `(min-width: Npx)`, e innerWidth acompanha. */
function larguraDaJanela(px: number): void {
  vi.stubGlobal("innerWidth", px);
  vi.stubGlobal("matchMedia", (consulta: string) => {
    const m = /min-width:\s*(\d+)px/.exec(consulta);
    return { matches: m ? px >= Number(m[1]) : false, media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

describe("telaLargaAgora (breakpoint lg = 1024px)", () => {
  it.each([
    [375, false],
    [768, false],
    [1023, false],
    [1024, true],
    [1280, true],
    [2130, true],
  ])("janela de %i px → tela larga: %s", (largura, esperado) => {
    larguraDaJanela(largura);
    expect(LARGURA_LG_PX).toBe(1024);
    expect(telaLargaAgora()).toBe(esperado);
  });

  it("sem matchMedia (servidor/teste sem DOM) vale tela larga", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(telaLargaAgora()).toBe(true);
  });
});

describe("campos de 16px e 44px no celular (o padrão do app), voltando ao desktop em lg+", () => {
  it("campos de texto, de busca e de dinheiro do formulário único levam text-[16px] e min-h-11, e o tamanho do desktop só em lg:", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "" })] }));
    const campos = [
      "#compra-paciente",
      "#compra-processo",
      "#compra-medico",
      "#compra-responsavel",
      "#compra-local",
      "#compra-entrega",
      "#compra-pendencias-livre",
      "#compra-frete",
      "#compra-frete-real",
      "#compra-item-itm_teste_0001-medicamento",
      "#compra-item-itm_teste_0001-laboratorio",
      "#compra-item-itm_teste_0001-quantidade",
      "#compra-item-itm_teste_0001-valor-unitario",
      "#compra-item-itm_teste_0001-valor-real",
    ];
    for (const sel of campos) {
      const classe = q<HTMLElement>(sel)!.className;
      expect(classe, sel).toContain("text-[16px]");
      expect(classe, sel).toContain("min-h-11");
      expect(classe, sel).toMatch(/lg:text-\[1[23](\.5)?px\]/);
      expect(classe, sel).toContain("lg:min-h-auto");
    }
  });

  it("os botões de ação da Compra têm 44px de altura no celular (primário e secundário e o '+ Adicionar medicamento')", () => {
    expect(BOTAO_PRIMARIO_CLASS).toContain("max-lg:min-h-11");
    expect(BOTAO_SECUNDARIO_CLASS).toContain("max-lg:min-h-11");
    montado = montarFormulario(compraComUmMedicamento());
    expect(q("#compra-adicionar-medicamento")!.className).toContain("min-h-11");
  });

  it("as caixas de marcar têm rótulo (ou linha) de 44px de altura no celular", () => {
    montado = montarFormulario(compraComUmMedicamento());
    for (const id of ["compra-particular", "compra-alvara", "compra-entrega-mesmo-local"]) {
      expect(q(`label[for='${id}']`)!.className, id).toContain("min-h-11");
    }
    for (const id of ["compra-isencao", "compra-recorrente"]) {
      expect(q(`#${id}`)!.parentElement!.className, id).toContain("min-h-11");
    }
  });

  it("a linha do formulário é 1 coluna no celular (rótulo acima) e [210px | controle] só em lg+", () => {
    montado = montarFormulario(compraComUmMedicamento());
    for (const linha of qa<HTMLElement>("#compra-campos [data-linha]")) {
      expect(linha.className).toContain("lg:grid-cols-[210px_minmax(0,1fr)]");
      expect(linha.className).not.toMatch(/(^|\s)grid-cols-/);
    }
  });

  it("com 2 medicamentos, cada linha por medicamento empilha os controles (Med. 1 acima do Med. 2) no celular", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1), itemDeTeste(2)] }));
    const grupos = qa<HTMLElement>('[data-linha="laboratorio"] [role="group"][aria-label^="Med."]');
    expect(grupos).toHaveLength(2);
    expect(grupos[0]!.parentElement!.className).toContain("flex-col");
  });
});

describe("AppSearchSelect no celular: a lista não é cortada pelo teclado nem pela barra de baixo", () => {
  const ACHADOS: OpcaoBusca[] = [{ valor: "m1", rotulo: "DIPIRONA TESTE" }];

  function montarBusca(): HTMLInputElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    createApp(defineComponent({ render: () => h(AppSearchSelect, { id: "busca", modelValue: "", buscar: async () => ACHADOS }) })).mount(el);
    return document.querySelector<HTMLInputElement>("#busca")!;
  }

  /** O campo na posição `topo`..`topo+44` e a área visível (visualViewport) com `alturaVisivel`. */
  function posicionar(campo: HTMLElement, topo: number, alturaVisivel: number): void {
    campo.getBoundingClientRect = () => ({ top: topo, bottom: topo + 44, left: 0, right: 300, width: 300, height: 44, x: 0, y: topo, toJSON: () => ({}) });
    vi.stubGlobal("visualViewport", { height: alturaVisivel, offsetTop: 0 });
  }

  async function digitarEAbrir(campo: HTMLInputElement): Promise<HTMLElement> {
    campo.value = "dip";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(260);
    await nextTick();
    await nextTick();
    return document.querySelector<HTMLElement>("#busca-listbox")!;
  }

  it("ao focar no celular (375 px) o campo rola para o MEIO da tela; em tela larga (1280 e 2130 px) não rola nada", async () => {
    for (const [largura, rola] of [[375, true], [1280, false], [2130, false]] as const) {
      larguraDaJanela(largura);
      const campo = montarBusca();
      const rolar = vi.fn();
      campo.scrollIntoView = rolar;
      campo.dispatchEvent(new FocusEvent("focus"));
      await vi.advanceTimersByTimeAsync(300);
      expect(rolar.mock.calls.length > 0, `${largura}px`).toBe(rola);
      if (rola) expect(rolar).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      document.body.innerHTML = "";
    }
  });

  it("com espaço de sobra abaixo: abre para baixo, com altura máxima de 224px e rolagem própria", async () => {
    larguraDaJanela(375);
    const campo = montarBusca();
    posicionar(campo, 100, 667);
    const lista = await digitarEAbrir(campo);
    expect(lista.className).toContain("mt-1");
    expect(lista.className).not.toContain("bottom-full");
    expect(lista.style.maxHeight).toBe("224px");
    expect(lista.className).toContain("overflow-y-auto");
  });

  it("com o TECLADO aberto (pouca área visível abaixo): abre para CIMA, sem passar do que cabe", async () => {
    larguraDaJanela(375);
    const campo = montarBusca();
    // Área visível de 340px (o teclado ocupa o resto); o campo está em 250..294, então só sobram ~0px abaixo e 242px acima.
    posicionar(campo, 250, 340);
    const lista = await digitarEAbrir(campo);
    expect(lista.className).toContain("bottom-full");
    expect(Number.parseInt(lista.style.maxHeight)).toBeLessThanOrEqual(224);
    expect(Number.parseInt(lista.style.maxHeight)).toBeGreaterThanOrEqual(96);
  });

  it("a barra de navegação do app (72px de reserva no celular) entra na conta: campo perto do pé da tela abre para cima", async () => {
    larguraDaJanela(375);
    const campo = montarBusca();
    posicionar(campo, 560, 667); // abaixo do campo (604) até 667 sobram 63px, menos a reserva: nada
    const lista = await digitarEAbrir(campo);
    expect(lista.className).toContain("bottom-full");
  });

  it("em tela larga a reserva da barra de baixo é só uma folga (8px)", async () => {
    larguraDaJanela(1280);
    const campo = montarBusca();
    posicionar(campo, 560, 800);
    const lista = await digitarEAbrir(campo);
    expect(lista.className).toContain("mt-1");
    expect(Number.parseInt(lista.style.maxHeight)).toBeGreaterThanOrEqual(96);
  });

  it("opções com 16px e área de toque confortável no celular (e o tamanho do desktop em lg+)", async () => {
    larguraDaJanela(375);
    const campo = montarBusca();
    posicionar(campo, 100, 667);
    const lista = await digitarEAbrir(campo);
    expect(lista.className).toContain("text-[16px]");
    expect(lista.className).toContain("lg:text-[13.5px]");
    expect(texto(lista.querySelector("[role=option]"))).toBe("DIPIRONA TESTE");
    expect(lista.querySelector("[role=option]")!.className).toContain("py-2.5");
  });
});
