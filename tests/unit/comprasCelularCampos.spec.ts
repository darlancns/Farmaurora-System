// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import AppSearchSelect, { type OpcaoBusca } from "../../app/components/AppSearchSelect.vue";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../app/utils/comprasEstilos";
import { LARGURA_LG_PX, telaLargaAgora } from "../../app/utils/telaLarga";
import { itemVazio, ordemVazia } from "../../shared/utils/compraForm";
import { compraTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";

// Campos e linha de medicamento no CELULAR: 16px/44px, grades de 1 coluna (2 quando cabe), a linha de medicamento vira um cartão
// empilhado com o ✕ no canto, e a lista de sugestões não é cortada. O que muda com a largura é CSS; o que o JS decide por largura usa
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

const item = (id: string, posicao: number) => ({ ...itemVazio(posicao), id });
const ordem = (id: string, itens: ReturnType<typeof item>[]) => ({ ...ordemVazia(1), id, itens });

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
  it("campos de texto, de busca, de dinheiro e selects levam text-[16px] e min-h-11, e o tamanho do desktop só em lg:", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    const campos = [
      "#compra-paciente",
      "#compra-processo",
      "#compra-medico",
      "#compra-responsavel",
      "#compra-local",
      "#compra-pendencias-livre",
      "#ordem-ord_a-po",
      "#ordem-ord_a-frete",
      "#item-itm_a-quantidade",
      "#item-itm_a-medicamento",
      "#item-itm_a-apresentacao",
      "#item-itm_a-valor-unitario",
      "#item-itm_a-referencia",
    ];
    for (const sel of campos) {
      const classe = q<HTMLElement>(sel)!.className;
      expect(classe, sel).toContain("text-[16px]");
      expect(classe, sel).toContain("min-h-11");
      expect(classe, sel).toMatch(/lg:text-\[1[23](\.5)?px\]/);
      expect(classe, sel).toContain("lg:min-h-auto");
    }
  });

  it("os botões de ação da Compra têm 44px de altura no celular (primário e secundário)", () => {
    expect(BOTAO_PRIMARIO_CLASS).toContain("max-lg:min-h-11");
    expect(BOTAO_SECUNDARIO_CLASS).toContain("max-lg:min-h-11");
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    expect(q("#compra-adicionar-ordem")!.className).toContain("max-lg:min-h-11");
    expect(q("#ordem-ord_a-adicionar-item")!.className).toContain("max-lg:min-h-11");
  });

  it("as caixas de marcar têm rótulo de 44px de altura no celular", () => {
    montado = montarFormulario(compraTeste());
    for (const id of ["compra-particular", "compra-recorrente", "compra-isencao", "compra-alvara"]) {
      expect(q(`label[for='${id}']`)!.className, id).toContain("min-h-11");
    }
  });
});

describe("grades: 1 coluna no celular, 2 quando cabe", () => {
  it("os blocos usam 1 coluna abaixo de sm (grid sem colunas), 2 em sm e 4 em xl", () => {
    montado = montarFormulario(compraTeste());
    const grade = q<HTMLElement>("#compra-grupo-paciente > div")!;
    expect(grade.className).toContain("sm:grid-cols-2");
    expect(grade.className).toContain("xl:grid-cols-4");
    expect(grade.className).not.toMatch(/(^|\s)grid-cols-/);
  });

  it("na ordem: Fornecedor, Envio, Cia e PO ocupam a linha toda no celular; Frete e Frete real ficam lado a lado (2 colunas)", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    const grade = q<HTMLElement>("#ordem-ord_a > div:nth-of-type(1)")!;
    expect(grade.className).toContain("grid-cols-2");
    const celula = (sel: string) => q<HTMLElement>(sel)!.closest("div[class*='col-span'], div.grid > div")!.className;
    for (const campo of ["fornecedor", "envio", "cia", "po"]) {
      const c = q<HTMLElement>(`#ordem-ord_a-${campo}`)!;
      const caixa = c.closest("div.grid > div")!;
      expect(caixa.className, campo).toContain("col-span-2");
      expect(caixa.className, campo).toContain("sm:col-span-1");
    }
    for (const campo of ["frete", "frete-real"]) {
      const caixa = q<HTMLElement>(`#ordem-ord_a-${campo}`)!.closest("div.grid > div")!;
      expect(caixa.className, campo).not.toContain("col-span-2");
    }
    expect(celula("#ordem-ord_a-frete")).not.toContain("col-span-2");
  });
});

describe("a linha de medicamento vira um CARTÃO empilhado no celular", () => {
  const ordemVisual = (sel: string): string => /max-lg:order-(\d)/.exec(q<HTMLElement>(sel)!.closest("div.grid > div")!.className)?.[1] ?? "";

  it("a ordem visual abaixo de lg: Medicamento, Qtd, Temperatura, Valor unit., Valor real, Apresentação", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    const porCampo = ["medicamento", "quantidade", "temperatura", "valor-unitario", "valor-real", "apresentacao"].map((c) => [c, ordemVisual(`#item-itm_a-${c}`)]);
    expect(porCampo).toEqual([
      ["medicamento", "1"],
      ["quantidade", "2"],
      ["temperatura", "3"],
      ["valor-unitario", "4"],
      ["valor-real", "5"],
      ["apresentacao", "6"],
    ]);
  });

  it("Medicamento e Apresentação ocupam a linha toda; Qtd + Temperatura e Valor unit. + Valor real dividem a linha (2 colunas)", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    const cx = (c: string) => q<HTMLElement>(`#item-itm_a-${c}`)!.closest("div.grid > div")!.className;
    expect(cx("medicamento")).toContain("col-span-2");
    expect(cx("apresentacao")).toContain("col-span-2");
    for (const c of ["quantidade", "temperatura", "valor-unitario", "valor-real"]) expect(cx(c)).not.toContain("col-span-2");
    expect(q("[data-item-linha] .grid")!.className).toContain("grid-cols-2");
  });

  it("em lg+ volta a uma linha de 7 colunas (a ordem do DOM é a das colunas do desktop)", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    expect(q("[data-item-linha] .grid")!.className).toContain("lg:grid-cols-[");
    const ids = qa<HTMLElement>("[data-item-linha] .grid input, [data-item-linha] .grid button").map((e) => e.id.replace("item-itm_a-", ""));
    expect(ids.slice(0, 6)).toEqual(["quantidade", "medicamento", "apresentacao", "valor-unitario", "valor-real", "temperatura"]);
  });

  it("o ✕ de remover fica no canto de cima do cartão, com área de toque de 44px; o cartão ganha uma faixa para ele", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1), item("itm_b", 2)])] }));
    const x = q<HTMLElement>("#item-itm_b-remover")!;
    expect(x.className).toContain("min-h-11");
    expect(x.className).toContain("min-w-11");
    expect(x.parentElement!.className).toContain("max-lg:absolute");
    expect(x.parentElement!.className).toContain("max-lg:top-0");
    expect(x.parentElement!.className).toContain("max-lg:right-0");
    expect(q("#item-itm_b")!.className).toContain("relative");
    expect(q("#item-itm_b")!.className).toContain("max-lg:pt-12");
    // O primeiro item não tem ✕ e não reserva a faixa.
    expect(q("#item-itm_a-remover")).toBeNull();
    expect(q("#item-itm_a")!.className).not.toContain("max-lg:pt-12");
  });

  it("'Detalhes' continua recolhido", () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", [item("itm_a", 1)])] }));
    expect(q<HTMLDetailsElement>("#item-itm_a details")!.open).toBe(false);
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
