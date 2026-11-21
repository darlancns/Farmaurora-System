// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { Compra } from "../../shared/types/compra";
import ComprasAbas from "../../app/components/compras/ComprasAbas.vue";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";
import { ABA_DA_COLUNA, ABAS_COMPRAS, abaInicial, abaValida, classeDaColuna, ROTULO_ABA_COMPRAS, type AbaCompras } from "../../app/utils/comprasAbas";
import { compraDeTeste } from "./helpers/compraFixtures";

// A navegação em ABAS abaixo de lg (um painel por vez), o cabeçalho de duas linhas com o menu "…" e a barra fixa do Resumo. O que muda
// com a largura é CSS (max-lg:/lg:): aqui se confere o contrato das classes; o comportamento por JS (que depende da largura) fica em
// useTelaLarga (testado com matchMedia em 375, 1280 e 2130 px).

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
  return el;
}

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

describe("as abas e a classe de cada coluna", () => {
  it("3 abas: Compras, Formulário e Resumo, na ordem; cada coluna é de uma aba", () => {
    expect(ABAS_COMPRAS).toEqual(["lista", "formulario", "resumo"]);
    expect(ABAS_COMPRAS.map((a) => ROTULO_ABA_COMPRAS[a])).toEqual(["Compras", "Formulário", "Resumo"]);
    expect(ABA_DA_COLUNA).toEqual({ esquerda: "lista", central: "formulario", direita: "resumo" });
  });

  it.each(ABAS_COMPRAS)("aba %s: só a coluna dela aparece abaixo de lg; as outras levam max-lg:hidden", (aba) => {
    const escondidas = (["esquerda", "central", "direita"] as const).filter((c) => classeDaColuna(c, aba) === "max-lg:hidden");
    const visiveis = (["esquerda", "central", "direita"] as const).filter((c) => classeDaColuna(c, aba) === "");
    expect(visiveis).toHaveLength(1);
    expect(ABA_DA_COLUNA[visiveis[0]!]).toBe(aba);
    expect(escondidas).toHaveLength(2);
  });

  it("a classe é só de baixo de lg: em lg+ (1280, 2130 px) as três colunas aparecem juntas, qualquer que seja a aba", () => {
    // `max-lg:hidden` só vale abaixo de 1024px; nenhuma classe esconde a coluna em lg+.
    for (const aba of ABAS_COMPRAS) {
      for (const coluna of ["esquerda", "central", "direita"] as const) expect(classeDaColuna(coluna, aba)).not.toMatch(/(^|\s)(hidden|lg:hidden)(\s|$)/);
    }
  });

  it("abaValida e abaInicial: a da URL vale; sem ela, 'formulario' com compra aberta e 'lista' sem", () => {
    expect(abaValida("resumo")).toBe(true);
    for (const ruim of ["tabela", "", null, undefined, 3, "LISTA"]) expect(abaValida(ruim), String(ruim)).toBe(false);
    expect(abaInicial("resumo", false)).toBe("resumo");
    expect(abaInicial(null, true)).toBe("formulario");
    expect(abaInicial(null, false)).toBe("lista");
  });
});

describe("ComprasAbas (SegmentedControl no topo, só abaixo de lg)", () => {
  function abas(inicial: AbaCompras = "lista") {
    const valor = ref<AbaCompras>(inicial);
    const el = montar(defineComponent({ render: () => h(ComprasAbas, { modelValue: valor.value, "onUpdate:modelValue": (a: AbaCompras) => (valor.value = a) }) }));
    return { valor, el };
  }

  it("um radiogroup com as 3 abas em 3 colunas, a marcada com aria-checked", () => {
    abas("formulario");
    const grupo = q<HTMLElement>("#compras-aba")!;
    expect(grupo.getAttribute("role")).toBe("radiogroup");
    expect(grupo.getAttribute("aria-label")).toBe("Partes da página Compras");
    expect(grupo.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(qa("#compras-aba [role=radio]").map((r) => texto(r))).toEqual(["Compras", "Formulário", "Resumo"]);
    expect(qa("#compras-aba [role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("clicar troca a aba", async () => {
    const { valor } = abas("lista");
    q<HTMLButtonElement>("#compras-aba-resumo")!.click();
    await nextTick();
    expect(valor.value).toBe("resumo");
  });

  it("fica FIXA (sticky) no topo da área rolável, sob o cabeçalho, e some em lg+", () => {
    abas();
    const faixa = q<HTMLElement>("#compras-abas")!;
    expect(faixa.className).toContain("sticky");
    expect(faixa.className).toContain("top-0");
    expect(faixa.className).toContain("lg:hidden");
    expect(faixa.className).toContain("bg-paper"); // fundo opaco: o que rola por baixo não aparece através
  });

  it("alvos de toque de 44px e fonte de 16px (o padrão do SegmentedControl no celular)", () => {
    abas();
    for (const r of qa<HTMLElement>("#compras-aba [role=radio]")) {
      expect(r.className).toContain("min-h-11");
      expect(r.className).toContain("text-[16px]");
    }
  });
});

describe("cabeçalho do formulário no celular", () => {
  function cabecalho(extra: { podeEditar?: boolean; cancelada?: boolean } = {}) {
    const ev: string[] = [];
    montar(
      defineComponent({
        render: () =>
          h(CompraFormCabecalho, {
            anoMes: "2026-11",
            sequencia: 13,
            cancelada: extra.cancelada ?? false,
            podeEditar: extra.podeEditar ?? true,
            estado: "salvo",
            onDuplicar: () => ev.push("duplicar"),
            onCancelar: () => ev.push("cancelar"),
            onVoltar: () => ev.push("voltar"),
          }),
      }),
    );
    return ev;
  }

  it("'‹ Compras' volta para a lista (só aparece abaixo de lg) e tem nome acessível", () => {
    const ev = cabecalho();
    const b = q<HTMLButtonElement>("#btn-voltar-lista")!;
    expect(texto(b)).toBe("‹ Compras");
    expect(b.getAttribute("aria-label")).toBe("Voltar para a lista de compras");
    expect(b.className).toContain("lg:hidden");
    expect(b.className).toContain("min-h-11");
    b.click();
    expect(ev).toEqual(["voltar"]);
  });

  it("duas linhas: título (e selo Cancelada, se for) e o menu '…' (sem texto de salvamento); sem contador de pendências nem chips", () => {
    cabecalho();
    expect(texto(q("#compra-titulo"))).toBe("Compra 13 - Novembro/2026");
    expect(q("#compra-pendencias-celular")).toBeNull();
    expect(q("#compra-pendencias")).toBeNull();
    expect(q("[data-status]")).toBeNull();
    expect(q("#compra-salvamento")).toBeNull();
    expect(texto(q("#compra-cabecalho"))).not.toMatch(/Salvo|autom/i);
    expect(q("#btn-menu-compra")).not.toBeNull();
  });

  it("compra cancelada: o selo 'Cancelada' aparece ao lado do título", () => {
    cabecalho({ cancelada: true });
    expect(texto(q("[data-selo-cancelada]"))).toBe("Cancelada");
  });

  it("Duplicar e Cancelar viram o menu '…' (padrão ActionsMenu) no celular, e os botões comuns só em lg+", () => {
    cabecalho();
    expect(q("#btn-duplicar-compra")!.className).toContain("max-lg:hidden");
    expect(q("#btn-cancelar-compra")!.className).toContain("max-lg:hidden");
    const gatilho = q<HTMLButtonElement>("#btn-menu-compra")!;
    expect(gatilho.getAttribute("aria-label")).toBe("Mais ações da compra");
    expect(gatilho.getAttribute("aria-haspopup")).toBe("true");
    expect(gatilho.parentElement!.className).toContain("lg:hidden");
  });

  it("abrir o menu mostra Duplicar compra e Cancelar compra (perigo); cada um avisa", async () => {
    const ev = cabecalho();
    q<HTMLButtonElement>("#btn-menu-compra")!.click();
    await nextTick();
    const itens = qa<HTMLButtonElement>("[role=menuitem]");
    expect(itens.map((i) => texto(i))).toEqual(["Duplicar compra", "Cancelar compra"]);
    expect(itens[1]!.className).toContain("text-danger");
    expect(itens[0]!.className).toContain("max-lg:min-h-11"); // alvo de toque
    itens[0]!.click();
    await nextTick();
    q<HTMLButtonElement>("#btn-menu-compra")!.click();
    await nextTick();
    qa<HTMLButtonElement>("[role=menuitem]")[1]!.click();
    expect(ev).toEqual(["duplicar", "cancelar"]);
  });

  it("quem só lê e a compra cancelada não têm o menu (nem os botões)", () => {
    cabecalho({ podeEditar: false });
    expect(q("#btn-menu-compra")).toBeNull();
    expect(q("#btn-duplicar-compra")).toBeNull();
    document.body.innerHTML = "";
    cabecalho({ cancelada: true });
    expect(q("#btn-menu-compra")).toBeNull();
  });
});

describe("Resumo no celular: barra de ações fixa no pé da tela", () => {
  function resumo(compra: Compra = compraDeTeste({ paciente: "PACIENTE TESTE" })) {
    montar(defineComponent({ render: () => h(CompraColunaDireita, { compra, despachanteCadastro: null }) }));
  }

  it("'Copiar resumo' e 'Encaminhar para a DIR' lado a lado numa barra FIXA acima da barra de navegação, com o safe-area", () => {
    resumo();
    const barra = q<HTMLElement>("#compra-barra-acoes")!;
    for (const c of ["max-lg:fixed", "max-lg:inset-x-0", "max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))]", "max-lg:bg-paper-raised", "max-lg:z-30"]) {
      expect(barra.className, c).toContain(c);
    }
    const copiar = q<HTMLButtonElement>("#btn-copiar-resumo")!;
    const encaminhar = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(copiar.parentElement).toBe(encaminhar.parentElement); // na mesma linha
    expect(copiar.parentElement).toBe(barra);
    expect(copiar.className).toContain("flex-1");
    expect(encaminhar.className).toContain("flex-1");
    expect(copiar.className).toContain("max-lg:min-h-11");
    expect(encaminhar.disabled).toBe(true);
    expect(copiar.disabled).toBe(false);
    expect(encaminhar.getAttribute("title")).toBe("Em breve: depende da migração da DIR");
  });

  it("a coluna reserva espaço no fim para a barra fixa não cobrir o resumo (só abaixo de lg)", () => {
    resumo();
    expect(q("#compra-coluna-direita")!.className).toContain("max-lg:pb-28");
  });

  it("em lg+ a barra é comum (sem fixed): a classe fixa é toda max-lg:", () => {
    resumo();
    const classes = q("#compra-barra-acoes")!.className.split(/\s+/);
    expect(classes.filter((c) => /^(fixed|bottom-|inset-)/.test(c))).toEqual([]);
  });
});

describe("estado que a página guarda: useComprasPagina decide a aba (testes de lógica em useComprasPagina.spec.ts)", () => {
  beforeEach(() => vi.useRealTimers());
  it("sanidade: o rótulo da aba da lista é 'Compras' (não 'Lista')", () => {
    expect(ROTULO_ABA_COMPRAS.lista).toBe("Compras");
  });
});
