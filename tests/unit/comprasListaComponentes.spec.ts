// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { StatusDaCompra } from "../../shared/constants/compra";
import type { CompraDaLista, TotaisPorStatus } from "../../shared/types/compra";
import CompraCartao from "../../app/components/compras/CompraCartao.vue";
import CompraStatusChip from "../../app/components/compras/CompraStatusChip.vue";
import ComprasListaPainel from "../../app/components/compras/ComprasListaPainel.vue";
import { CLASSE_STATUS_COMPRA, ROTULO_STATUS_COMPRA, textoPendencias } from "../../app/utils/comprasEstilos";

// Componentes REAIS no happy-dom: o cartão, o selo de estado e o painel esquerdo (mês, chips com contagem, mostrar mais, vazio,
// teclado). Dados fictícios (TESTE).

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
  totalOrdens: 1,
  pendencias: 0,
  status: "rascunho",
  atualizadoEm: "2026-11-19T12:00:00.000Z",
  ...extra,
});

describe("CompraStatusChip e estilos", () => {
  it("o rótulo e a classe de cada estado", () => {
    expect(ROTULO_STATUS_COMPRA).toEqual({ rascunho: "Rascunho", pronta: "Pronta", cancelada: "Cancelada" });
    expect(CLASSE_STATUS_COMPRA.rascunho).toContain("text-ink-soft");
    expect(CLASSE_STATUS_COMPRA.pronta).toContain("green");
    expect(CLASSE_STATUS_COMPRA.cancelada).toContain("line-through"); // cinza riscada
    expect(CLASSE_STATUS_COMPRA.rascunho).not.toContain("line-through");
  });

  it.each(["rascunho", "pronta", "cancelada"] as StatusDaCompra[])("o selo '%s' mostra o rótulo e o data-status", (status) => {
    const el = montar(defineComponent({ render: () => h(CompraStatusChip, { status }) }));
    expect(texto(el)).toBe(ROTULO_STATUS_COMPRA[status]);
    expect(el.querySelector("span")!.getAttribute("data-status")).toBe(status);
  });

  it("'N pendências' (singular em 1; vazio em 0)", () => {
    expect(textoPendencias(0)).toBe("");
    expect(textoPendencias(1)).toBe("1 pendência");
    expect(textoPendencias(8)).toBe("8 pendências");
  });
});

describe("CompraCartao", () => {
  function cartao(c: CompraDaLista, selecionada = false) {
    const ev: string[] = [];
    montar(defineComponent({ render: () => h(CompraCartao, { compra: c, selecionada, onSelecionar: (id: string) => ev.push(id) }) }));
    return ev;
  }

  it("é um botão de verdade, com 'Compra 13' (2 dígitos), o selo, as pendências, o paciente e os medicamentos", () => {
    cartao(compra(13, { status: "pronta", pendencias: 3, medicamentos: ["MEDICAMENTO UM", "MEDICAMENTO DOIS"] }));
    const botao = q<HTMLButtonElement>("#compra-cartao-cmp_13")!;
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.type).toBe("button");
    expect(texto(botao)).toContain("Compra 13");
    expect(texto(botao)).toContain("Pronta");
    expect(texto(botao)).toContain("3 pendências");
    expect(texto(botao)).toContain("PACIENTE TESTE 13");
    expect(texto(botao)).toContain("MEDICAMENTO UM, MEDICAMENTO DOIS");
  });

  it("número com 2 dígitos: Compra 05; sem pendências não escreve nada; sem medicamentos some a linha", () => {
    cartao(compra(5, { pendencias: 0, medicamentos: [] }));
    expect(texto(q("button"))).toContain("Compra 05");
    expect(texto(q("button"))).not.toContain("pendência");
    expect(qa("span.truncate")).toHaveLength(1); // só o paciente
  });

  it("o paciente em negrito e a lista de medicamentos em UMA linha cortada com reticências (truncate)", () => {
    cartao(compra(1));
    const spans = qa("span.truncate");
    expect(spans[0]!.className).toContain("font-bold");
    expect(spans[1]!.className).toContain("truncate");
    expect(spans[1]!.getAttribute("title")).toBe("MED A, MED B");
  });

  it("sem paciente: 'Sem paciente'", () => {
    cartao(compra(1, { paciente: "" }));
    expect(texto(q("button"))).toContain("Sem paciente");
  });

  it("selecionado: borda primária, fundo #e3eef6 (farm-blue-soft) e aria-current; os outros não", () => {
    cartao(compra(1), true);
    const b = q<HTMLButtonElement>("button")!;
    expect(b.className).toContain("border-accent-dark");
    expect(b.className).toContain("bg-farm-blue-soft");
    expect(b.getAttribute("aria-current")).toBe("true");
    document.body.innerHTML = "";
    cartao(compra(1), false);
    expect(q("button")!.getAttribute("aria-current")).toBeNull();
    expect(q("button")!.className).not.toContain("bg-farm-blue-soft");
  });

  it("clicar avisa o id", () => {
    const ev = cartao(compra(7));
    q<HTMLButtonElement>("button")!.click();
    expect(ev).toEqual(["cmp_7"]);
  });

  it("cancelada: o número vai riscado", () => {
    cartao(compra(2, { status: "cancelada", cancelada: true }));
    expect(q("button span span")!.className).toContain("line-through");
  });
});

// ── O painel ──────────────────────────────────────────────────────────────────────────────────────────────────

const TOTAIS: TotaisPorStatus = { rascunho: 3, pronta: 4, cancelada: 2 };

interface PropsPainel {
  compras?: CompraDaLista[];
  totais?: TotaisPorStatus;
  total?: number;
  temMais?: boolean;
  status?: StatusDaCompra | null;
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
          totalDoMes: p.totalDoMes ?? 13,
          compras,
          totais: p.totais ?? TOTAIS,
          total: p.total ?? compras.length,
          temMais: p.temMais ?? false,
          status: p.status ?? null,
          mostrarCanceladas: p.mostrarCanceladas ?? false,
          selecionadaId: p.selecionadaId ?? null,
          carregando: p.carregando ?? false,
          erro: p.erro ?? null,
          podeEditar: p.podeEditar ?? true,
          onAnterior: () => ev.push(["anterior"]),
          onProximo: () => ev.push(["proximo"]),
          onStatus: (s: StatusDaCompra | null) => ev.push(["status", s]),
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

describe("ComprasListaPainel: o mês", () => {
  it("o mês por extenso e 'N compras'; as setas avisam", () => {
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

describe("ComprasListaPainel: chips com contagem", () => {
  it("Todas (soma sem canceladas), Rascunhos e Prontas", () => {
    painel({ totalDoMes: 7 });
    // Texto CURTO no chip (cabem numa linha só na coluna de ~320px); o nome inteiro vai no aria-label e na dica.
    expect(qa("#compras-filtros button").map((b) => texto(b))).toEqual(["Todas (7)", "Rasc. (3)", "Prontas (4)"]);
    expect(qa("#compras-filtros button").map((b) => b.getAttribute("aria-label"))).toEqual(["Todas (7)", "Rascunhos (3)", "Prontas (4)"]);
    expect(qa("#compras-filtros button")).toHaveLength(3);
  });

  it("os chips ficam numa LINHA só: sem quebra (flex-nowrap) e com rolagem horizontal discreta se não couber; cada chip não encolhe", () => {
    painel({ totalDoMes: 7 });
    const linha = q("#compras-filtros")!;
    expect(linha.className).toContain("flex-nowrap");
    expect(linha.className).toContain("overflow-x-auto");
    expect(linha.className).not.toContain("flex-wrap");
    for (const chip of qa("#compras-filtros button")) {
      expect(chip.className).toContain("shrink-0");
      expect(chip.className).toContain("whitespace-nowrap");
      expect(chip.className).toContain("px-1.5"); // pouco padding horizontal
    }
  });

  it("o chip ativo leva aria-pressed e o estilo primário; clicar avisa o estado (Todas = null)", () => {
    const ev = painel({ status: "pronta" });
    expect(q("#compras-chip-pronta")!.getAttribute("aria-pressed")).toBe("true");
    expect(q("#compras-chip-pronta")!.className).toContain("bg-accent-dark");
    expect(q("#compras-chip-todas")!.getAttribute("aria-pressed")).toBe("false");
    q<HTMLButtonElement>("#compras-chip-rascunho")!.click();
    q<HTMLButtonElement>("#compras-chip-todas")!.click();
    expect(ev).toEqual([["status", "rascunho"], ["status", null]]);
  });

  it("o interruptor 'Mostrar canceladas' é um switch acessível e avisa o novo valor", () => {
    const ev = painel({ mostrarCanceladas: false });
    const sw = q<HTMLButtonElement>("#compras-mostrar-canceladas")!;
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.getAttribute("aria-label")).toBe("Mostrar canceladas");
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

  it("Enter num cartão focado abre: o botão recebe o clique do navegador (cada cartão é um <button>)", () => {
    painel();
    expect(qa("[data-compra-cartao]").every((c) => c.tagName === "BUTTON")).toBe(true);
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
  it("vazio: só o texto 'Nenhuma compra neste mês.' (o '+ Nova compra' do topo da coluna basta; nada de botão dentro do aviso)", () => {
    painel({ compras: [], total: 0, totalDoMes: 0, podeEditar: true });
    expect(texto(q("#compras-lista-vazia"))).toBe("Nenhuma compra neste mês.");
    expect(q("#compras-lista-vazia button")).toBeNull();
    expect(q("#btn-nova-compra-vazio")).toBeNull();
    expect(q("#compras-cartoes")).toBeNull();
    expect(q("#btn-nova-compra")).not.toBeNull(); // o do topo continua
  });

  it("vazio para quem só lê: a mensagem, sem botão de criar (nem o do topo)", () => {
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

  it("carregando sem nada: 'Carregando…' (um só caractere de reticências) e nada de 'Nenhuma compra'", () => {
    painel({ compras: [], carregando: true });
    expect(texto(q("#compras-lista-carregando"))).toBe("Carregando…");
    expect(texto(q("#compras-lista-carregando"))).not.toContain("...");
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
