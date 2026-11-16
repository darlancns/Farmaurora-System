// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";
import ProcessoKanbanCard from "../../app/components/processos/ProcessoKanbanCard.vue";
import ProcessoPainel from "../../app/components/processos/ProcessoPainel.vue";
import ProcessoRow from "../../app/components/processos/ProcessoRow.vue";
import { contarProcessosPorPasta } from "../../app/utils/remessaNaLinha";

// Pasta OPCIONAL na exibição: vazia, é OMITIDA (sem "Sem pasta", sem "Pasta " solto, sem "·" sobrando).
// Componentes reais no happy-dom.

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [{ nome: "DROGA", dosagem: "10MG" }],
    status: "em_transito",
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
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("ProcessoKanbanCard — primeira linha", () => {
  const card = (p: Processo) => montar(defineComponent({ setup: () => () => h(ProcessoKanbanCard, { processo: p }) }));

  it("pasta e PO / só pasta / só PO / nenhum", () => {
    expect(texto(card(proc("a", { numeroPo: "PO26-10-0471" })).querySelector("#card-pasta-po-a"))).toBe(
      "2026 - 100 · PO26-10-0471",
    );
    expect(texto(card(proc("b")).querySelector("#card-pasta-po-b"))).toBe("2026 - 100");
    expect(texto(card(proc("c", { pasta: "", numeroPo: "PO26-10-0471" })).querySelector("#card-pasta-po-c"))).toBe(
      "PO26-10-0471",
    );
    expect(texto(card(proc("d", { pasta: "" })).querySelector("#card-pasta-po-d"))).toBe("");
  });

  it("sem pasta e sem PO: a linha CONTINUA existindo, vazia, com altura mínima de uma linha e sem title", () => {
    const el = card(proc("d", { pasta: "  ", statusPagamento: "pendente" }));
    const linha = el.querySelector("#card-pasta-po-d")!;
    expect(linha).not.toBeNull();
    expect(texto(linha)).toBe("");
    expect(linha.className).toContain("min-h-lh");
    expect(linha.hasAttribute("title")).toBe(false);
    // A etiqueta continua na mesma linha (mesmo pai), à direita.
    expect(linha.parentElement).toBe(el.querySelector("#card-pagamento-d")!.parentElement);
  });
});

describe("ProcessoRow — Lista", () => {
  const linha = (p: Processo, todos: Processo[] = [p]) =>
    montar(defineComponent({ render: () => h(ProcessoRow, { processo: p, contagemPasta: contarProcessosPorPasta(todos) }) }));

  it("celular: sem pasta, nada de 'Pasta ' solto; só PO quando houver", () => {
    expect(texto(linha(proc("a", { pasta: "", numeroPo: "PO26-10-0471" })).querySelector("#mobile-ordem-pasta-a"))).toBe(
      "PO26-10-0471",
    );
    expect(texto(linha(proc("b", { pasta: "", numeroRemessa: 2, numeroPo: "PO26-10-0471" })).querySelector("#mobile-ordem-pasta-b"))).toBe(
      "Ordem 2 · PO26-10-0471",
    );
    expect(texto(linha(proc("c", { pasta: "", numeroRemessa: 3 })).querySelector("#mobile-ordem-pasta-c"))).toBe("Ordem 3");
  });

  it("celular: sem pasta, sem PO e sem Ordem, a linha não aparece", () => {
    expect(linha(proc("a", { pasta: "" })).querySelector("#mobile-ordem-pasta-a")).toBeNull();
  });

  it("celular: com pasta, como sempre", () => {
    expect(texto(linha(proc("a", { numeroPo: "PO26-10-0471" })).querySelector("#mobile-ordem-pasta-a"))).toBe(
      "Pasta 2026 - 100 · PO26-10-0471",
    );
  });

  it("desktop: sem pasta, nenhum '·' sobrando; com PO, um só '·' antes do PO", () => {
    // O bloco de metadados ao lado do nome (Ordem · pasta · PO). Os spans são irmãos sem espaço entre si.
    const linhaDesktop = (el: HTMLElement) => texto(el.querySelector(".\\@\\[700px\\]\\:contents"));
    expect(linhaDesktop(linha(proc("a", { pasta: "" })))).toBe("");
    expect(linhaDesktop(linha(proc("b", { pasta: "", numeroPo: "PO26-10-0471" })))).toBe("·PO26-10-0471");
    expect(linhaDesktop(linha(proc("c")))).toBe("·2026 - 100");
    expect(linhaDesktop(linha(proc("d", { numeroPo: "PO26-10-0471" })))).toBe("·2026 - 100·PO26-10-0471");
  });

  it("dois processos sem pasta NÃO mostram 'Ordem N'", () => {
    const a = proc("a", { pasta: "" });
    const b = proc("b", { pasta: "" });
    const el = linha(a, [a, b]);
    expect(el.querySelector("#remessa-a")).toBeNull();
    expect(el.querySelector("#mobile-remessa-a")).toBeNull();
  });
});

describe("ProcessoPainel", () => {
  const painel = (p: Processo, todos: Processo[] = [p]) =>
    montar(defineComponent({ setup: () => () => h(ProcessoPainel, { processo: p, contagemPasta: contarProcessosPorPasta(todos) }) }));

  it("sem pasta, com PO: só o PO (sem 'Pasta ' vazio)", () => {
    painel(proc("p1", { pasta: "", numeroPo: "PO26-10-0471" }));
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("PO26-10-0471");
  });

  it("sem pasta e sem PO, com Responsável: só a linha do Responsável", () => {
    painel(proc("p1", { pasta: "", responsavelOperacional: "Bruno" }));
    expect(document.querySelector("#painel-pasta-po")).toBeNull();
    expect(texto(document.querySelector("#painel-ordem-responsavel"))).toBe("Responsável Bruno");
    expect(document.querySelector("#painel-ordem-responsavel")!.className).not.toContain("mt-1");
  });

  it("sem pasta, sem PO e sem Responsável: o bloco some", () => {
    painel(proc("p1", { pasta: "" }));
    expect(document.querySelector("#painel-bloco-pasta")).toBeNull();
  });

  it("dois sem pasta: sem 'Ordem N'", () => {
    const a = proc("p1", { pasta: "", responsavelOperacional: "Bruno" });
    painel(a, [a, proc("p2", { pasta: "" })]);
    expect(texto(document.querySelector("#painel-ordem-responsavel"))).toBe("Responsável Bruno");
  });
});

describe("ProcessoDetail", () => {
  const detalhe = (p: Processo) => montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p }) }));

  it("sem pasta: a linha 'Pasta' não aparece; com pasta, aparece", () => {
    expect(texto(detalhe(proc("a", { pasta: "" })))).not.toMatch(/Pasta/);
    expect(texto(detalhe(proc("b")))).toContain("Pasta2026 - 100"); // rótulo e valor são elementos irmãos
  });
});
