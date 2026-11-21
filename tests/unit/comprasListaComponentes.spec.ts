// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { CompraDaLista, TotaisDaLista } from "../../shared/types/compra";
import CompraCartao from "../../app/components/compras/CompraCartao.vue";
import ComprasListaPainel from "../../app/components/compras/ComprasListaPainel.vue";

// Componentes REAIS no happy-dom: o cartão e o painel esquerdo (mês, "Mostrar canceladas" com contagem, mostrar mais, vazio, teclado).
// Sem chips de status nem pendências. Dados fictícios (TESTE).

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
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

const compra = (sequencia: number, extra: Partial<CompraDaLista> = {}): CompraDaLista => ({
  id: `cmp_${sequencia}`,
  anoMes: "2026-11",
  sequencia,
  cancelada: false,
  paciente: `PACIENTE TESTE ${sequencia}`,
  medicamentos: ["MED A", "MED B"],
  numeroOrdens: 1,
  atualizadoEm: "2026-11-19T12:00:00.000Z",
  ...extra,
});

describe("CompraCartao", () => {
  function cartao(c: CompraDaLista, selecionada = false) {
    const ev: string[] = [];
    montar(defineComponent({ render: () => h(CompraCartao, { compra: c, selecionada, onSelecionar: (id: string) => ev.push(id) }) }));
    return ev;
  }

  it("é um botão de verdade, com 'Compra 13' (2 dígitos), o paciente, os medicamentos e 'N ordens'", () => {
    cartao(compra(13, { numeroOrdens: 3, medicamentos: ["MEDICAMENTO UM", "MEDICAMENTO DOIS"] }));
    const botao = q<HTMLButtonElement>("#compra-cartao-cmp_13")!;
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.type).toBe("button");
    expect(texto(botao)).toContain("Compra 13");
    expect(texto(botao)).toContain("3 ordens");
    expect(texto(botao)).toContain("PACIENTE TESTE 13");
    expect(texto(botao)).toContain("MEDICAMENTO UM, MEDICAMENTO DOIS");
  });

  it("singular: '1 ordem'", () => {
    cartao(compra(2, { numeroOrdens: 1 }));
    expect(texto(q("button"))).toContain("1 ordem");
    expect(texto(q("button"))).not.toContain("1 ordens");
  });

  it("sem selo de status, sem chips e sem pendências (só a cancelada tem selo)", () => {
    cartao(compra(5));
    const t = texto(q("button"));
    for (const proibido of ["Rascunho", "Pronta", "Encaminhada", "pendência", "pendências"]) expect(t).not.toContain(proibido);
    expect(q("[data-status]")).toBeNull();
    expect(q("[data-selo-cancelada]")).toBeNull();
  });

  it("cancelada: selo 'Cancelada' e o número riscado", () => {
    cartao(compra(2, { cancelada: true }));
    expect(texto(q("[data-selo-cancelada]"))).toBe("Cancelada");
    expect(q("button span span")!.className).toContain("line-through");
  });

  it("sem medicamentos some a linha; sem paciente: 'Sem paciente'", () => {
    cartao(compra(5, { medicamentos: [], paciente: "" }));
    expect(texto(q("button"))).toContain("Compra 05");
    expect(texto(q("button"))).toContain("Sem paciente");
    expect(qa("span.truncate")).toHaveLength(1);
  });

  it("o paciente em negrito e a lista de medicamentos em UMA linha cortada com reticências (truncate)", () => {
    cartao(compra(1));
    const spans = qa("span.truncate");
    expect(spans[0]!.className).toContain("font-bold");
    expect(spans[1]!.className).toContain("truncate");
    expect(spans[1]!.getAttribute("title")).toBe("MED A, MED B");
  });

  it("selecionado: borda primária, fundo farm-blue-soft e aria-current; os outros não", () => {
    cartao(compra(1), true);
    const b = q<HTMLButtonElement>("button")!;
    expect(b.className).toContain("border-accent-dark");
    expect(b.className).toContain("bg-farm-blue-soft");
    expect(b.getAttribute("aria-current")).toBe("true");
    document.body.innerHTML = "";
    cartao(compra(1), false);
    expect(q("button")!.getAttribute("aria-current")).toBeNull();
  });

  it("clicar avisa o id", () => {
    const ev = cartao(compra(7));
    q<HTMLButtonElement>("button")!.click();
    expect(ev).toEqual(["cmp_7"]);
  });
});

const TOTAIS: TotaisDaLista = { ativas: 7, canceladas: 2 };

interface PropsPainel {
  compras?: CompraDaLista[];
  totais?: TotaisDaLista;
  total?: number;
  temMais?: boolean;
  mostrarCanceladas?: boolean;
  selecionadaId?: string | null;
  carregando?: boolean;
  erro?: string | null;
  podeEditar?: boolean;
  totalDoMes?: number;
}

function painel(p: PropsPainel = {}) {
  const ev: Array<[string, unknown?]> = [];
  const compras = p.compras ?? [compra(3), compra(2), compra(1)];
  montar(
    defineComponent({
      render: () =>
        h(ComprasListaPainel, {
          rotuloMes: "Novembro/2026",
          totalDoMes: p.totalDoMes ?? 7,
          compras,
          totais: p.totais ?? TOTAIS,
          total: p.total ?? compras.length,
          temMais: p.temMais ?? false,
          mostrarCanceladas: p.mostrarCanceladas ?? false,
          selecionadaId: p.selecionadaId ?? null,
          carregando: p.carregando ?? false,
          erro: p.erro ?? null,
          podeEditar: p.podeEditar ?? true,
          onAnterior: () => ev.push(["anterior"]),
          onProximo: () => ev.push(["proximo"]),
          onMostrarCanceladas: (v: boolean) => ev.push(["canceladas", v]),
          onSelecionar: (id: string) => ev.push(["selecionar", id]),
          onNova: () => ev.push(["nova"]),
          onMostrarMais: () => ev.push(["mais"]),
          onRecarregar: () => ev.push(["recarregar"]),
        }),
    }),
  );
  return ev;
}

describe("ComprasListaPainel: o mês e os totais", () => {
  it("o mês por extenso e 'N compras' (as ativas); as setas avisam", () => {
    const ev = painel({ totalDoMes: 13 });
    expect(texto(q("#compras-mes-rotulo"))).toBe("Novembro/2026");
    expect(texto(q("#compras-mes-total"))).toBe("13 compras");
    q<HTMLButtonElement>("#compras-mes-anterior")!.click();
    q<HTMLButtonElement>("#compras-mes-proximo")!.click();
    expect(ev).toEqual([["anterior"], ["proximo"]]);
    expect(q("#compras-mes-anterior")!.getAttribute("aria-label")).toBe("Mês anterior");
    expect(q("#compras-mes-proximo")!.getAttribute("aria-label")).toBe("Próximo mês");
  });

  it("singular: '1 compra'", () => {
    painel({ totalDoMes: 1 });
    expect(texto(q("#compras-mes-total"))).toBe("1 compra");
  });
});

describe("ComprasListaPainel: sem chips de status; 'Mostrar canceladas'", () => {
  it("NÃO há chips de status (nem Todas, Rascunhos, Prontas) nem a barra de filtros", () => {
    painel();
    expect(q("#compras-filtros")).toBeNull();
    expect(qa("[id^=compras-chip-]")).toHaveLength(0);
    const t = texto(q("#compras-lista"));
    for (const proibido of ["Rascunhos", "Prontas", "Todas (", "Rasc."]) expect(t).not.toContain(proibido);
  });

  it("o interruptor 'Mostrar canceladas' é um switch acessível, mostra a contagem de canceladas e avisa o novo valor", () => {
    const ev = painel({ mostrarCanceladas: false, totais: { ativas: 5, canceladas: 4 } });
    const sw = q<HTMLButtonElement>("#compras-mostrar-canceladas")!;
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.getAttribute("aria-label")).toBe("Mostrar canceladas");
    expect(texto(q("#compras-lista label"))).toBe("Mostrar canceladas (4)");
    sw.click();
    expect(ev).toEqual([["canceladas", true]]);
  });

  it("ligado, o switch mostra aria-checked true", () => {
    painel({ mostrarCanceladas: true });
    expect(q("#compras-mostrar-canceladas")!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("ComprasListaPainel: cartões e seleção", () => {
  it("um cartão por compra, na ordem recebida; o selecionado destacado; clicar avisa", () => {
    const ev = painel({ selecionadaId: "cmp_2" });
    expect(qa("[data-compra-cartao]").map((c) => c.id)).toEqual(["compra-cartao-cmp_3", "compra-cartao-cmp_2", "compra-cartao-cmp_1"]);
    expect(qa("[data-compra-cartao]").map((c) => c.getAttribute("aria-current"))).toEqual([null, "true", null]);
    q<HTMLButtonElement>("#compra-cartao-cmp_1")!.click();
    expect(ev).toEqual([["selecionar", "cmp_1"]]);
  });

  it("cancelada na lista (com o interruptor ligado) mostra o selo", () => {
    painel({ compras: [compra(2, { cancelada: true }), compra(1)], mostrarCanceladas: true });
    expect(qa("[data-selo-cancelada]")).toHaveLength(1);
  });

  it("seta para baixo e para cima movem o foco entre os cartões (e param nas pontas)", async () => {
    painel();
    const cartoes = qa<HTMLButtonElement>("[data-compra-cartao]");
    cartoes[0]!.focus();
    const tecla = (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    };
    tecla("ArrowDown");
    expect(document.activeElement).toBe(cartoes[1]);
    tecla("ArrowDown");
    expect(document.activeElement).toBe(cartoes[2]);
    tecla("ArrowDown");
    expect(document.activeElement).toBe(cartoes[2]);
    tecla("ArrowUp");
    expect(document.activeElement).toBe(cartoes[1]);
    tecla("ArrowUp");
    tecla("ArrowUp");
    expect(document.activeElement).toBe(cartoes[0]);
    await nextTick();
  });

  it("a seta não rola a página (preventDefault) e outras teclas não fazem nada", () => {
    painel();
    const cartoes = qa<HTMLButtonElement>("[data-compra-cartao]");
    cartoes[0]!.focus();
    const seta = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    cartoes[0]!.dispatchEvent(seta);
    expect(seta.defaultPrevented).toBe(true);
    const outra = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(outra);
    expect(outra.defaultPrevented).toBe(false);
  });
});

describe("ComprasListaPainel: mostrar mais", () => {
  it("'Mostrar mais (N de M)' só com mais para ler; clicar avisa", () => {
    const ev = painel({ compras: Array.from({ length: 50 }, (_, i) => compra(100 - i)), total: 120, temMais: true });
    expect(texto(q("#compras-mostrar-mais"))).toBe("Mostrar mais (50 de 120)");
    q<HTMLButtonElement>("#compras-mostrar-mais")!.click();
    expect(ev).toEqual([["mais"]]);
  });

  it("sem mais, o botão não existe", () => {
    painel({ temMais: false });
    expect(q("#compras-mostrar-mais")).toBeNull();
  });
});

describe("ComprasListaPainel: vazio, carregando, erro e permissão", () => {
  it("vazio: só o texto 'Nenhuma compra neste mês.' (o '+ Nova compra' do topo basta)", () => {
    painel({ compras: [], total: 0, totalDoMes: 0, podeEditar: true });
    expect(texto(q("#compras-lista-vazia"))).toBe("Nenhuma compra neste mês.");
    expect(q("#compras-lista-vazia button")).toBeNull();
    expect(q("#compras-cartoes")).toBeNull();
    expect(q("#btn-nova-compra")).not.toBeNull();
  });

  it("vazio para quem só lê: a mensagem, sem botão de criar", () => {
    painel({ compras: [], total: 0, podeEditar: false });
    expect(texto(q("#compras-lista-vazia"))).toBe("Nenhuma compra neste mês.");
    expect(q("#btn-nova-compra")).toBeNull();
  });

  it("'+ Nova compra' no topo: só para quem edita; clicar avisa", () => {
    const ev = painel({ podeEditar: true });
    expect(texto(q("#btn-nova-compra"))).toBe("+ Nova compra");
    q<HTMLButtonElement>("#btn-nova-compra")!.click();
    expect(ev).toEqual([["nova"]]);
    document.body.innerHTML = "";
    painel({ podeEditar: false });
    expect(q("#btn-nova-compra")).toBeNull();
  });

  it("carregando sem nada: 'Carregando…' e nada de 'Nenhuma compra'", () => {
    painel({ compras: [], carregando: true });
    expect(texto(q("#compras-lista-carregando"))).toBe("Carregando…");
    expect(q("#compras-lista-vazia")).toBeNull();
  });

  it("erro: a mensagem com 'Tentar de novo', que avisa para recarregar", () => {
    const ev = painel({ compras: [], erro: "falhou" });
    expect(texto(q("#compras-lista-erro"))).toBe("Não foi possível carregar as compras. Tentar de novo");
    expect(q("#compras-lista-vazia")).toBeNull();
    qa<HTMLButtonElement>("#compras-lista-erro button")[0]!.click();
    expect(ev).toEqual([["recarregar"]]);
  });
});
