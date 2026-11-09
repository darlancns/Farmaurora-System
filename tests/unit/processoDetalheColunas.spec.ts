// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";

// Detalhe do processo: os campos são preenchidos por COLUNA (4 em lg+; 2 abaixo de lg, 1-2 em cima e 3-4
// embaixo). Cada coluna é um wrapper próprio; a ordem no DOM (= ordem de leitura/Tab) é coluna 1, 2, 3, 4.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "a",
    paciente: "Paciente A",
    numeroRemessa: 2,
    numeroPo: "PO-25-2652",
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    despachante: "Andreza Faconi",
    fornecedor: "Beldimed - Bélgica",
    modalEnvio: "Air Cargo",
    companhiaAerea: "Lufthansa",
    numeroAwb: "957-12345678",
    localEntrega: "Rua das Flores 123",
    numeroProcesso: "25BR00001234567-8/2026",
    medicamentos: [],
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

function montar(processo: Processo): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render: () => h(ProcessoDetail, { processo }) }));
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
});

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function colunas(el: HTMLElement): Element[] {
  // A primeira grade do detalhe é a dos campos (a segunda é a de Datas).
  const grade = el.querySelector("#processo-detail-a > div.grid")!;
  return Array.from(grade.children);
}

function rotulosPorColuna(el: HTMLElement): string[][] {
  return colunas(el).map((c) => Array.from(c.querySelectorAll(":scope > div > span:first-child")).map((s) => texto(s)));
}

describe("ProcessoDetail — campos em colunas", () => {
  it("quatro colunas, cada uma com os campos na ordem pedida (Transportadora presente)", () => {
    const el = montar(proc({ transportadoraNacional: { nome: "Jadlog", valor: 10 } }));
    expect(rotulosPorColuna(el)).toEqual([
      ["Pasta", "Nº Ordem", "Nº Remessa"],
      ["Envio", "Cia. aérea", "Nº AWB"],
      ["Fornecedor", "Despachante", "Nº do processo"],
      ["Transportadora", "Local de entrega"],
    ]);
  });

  it("sem Transportadora só a coluna 4 encurta; as outras três não mudam (um wrapper por coluna)", () => {
    const el = montar(proc());
    expect(rotulosPorColuna(el)).toEqual([
      ["Pasta", "Nº Ordem", "Nº Remessa"],
      ["Envio", "Cia. aérea", "Nº AWB"],
      ["Fornecedor", "Despachante", "Nº do processo"],
      ["Local de entrega"],
    ]);
  });

  it("a ordem do DOM (leitura/Tab) é coluna 1, 2, 3, 4 — rótulos achatados", () => {
    const el = montar(proc({ transportadoraNacional: { nome: "Jadlog" } }));
    expect(rotulosPorColuna(el).flat()).toEqual([
      "Pasta",
      "Nº Ordem",
      "Nº Remessa",
      "Envio",
      "Cia. aérea",
      "Nº AWB",
      "Fornecedor",
      "Despachante",
      "Nº do processo",
      "Transportadora",
      "Local de entrega",
    ]);
  });

  it("grade: 2 colunas abaixo de lg e 4 em lg+", () => {
    const el = montar(proc());
    const grade = el.querySelector("#processo-detail-a > div.grid")!;
    expect(grade.classList.contains("grid-cols-2")).toBe(true);
    expect(grade.classList.contains("lg:grid-cols-4")).toBe(true);
    expect(grade.classList.contains("sm:grid-cols-3")).toBe(false);
  });

  it("valores, formatadores e '—' para vazio continuam os mesmos", () => {
    const el = montar(proc({ despachante: undefined, fornecedor: undefined, numeroPo: undefined, localEntrega: undefined }));
    const valor = (rotulo: string) => {
      const campo = Array.from(el.querySelectorAll("#processo-detail-a div.flex-col > div")).find(
        (c) => texto(c.querySelector("span")) === rotulo,
      )!;
      return texto(campo.querySelectorAll("span")[1]);
    };
    expect(valor("Pasta")).toBe("2026 - 100");
    expect(valor("Nº Remessa")).toBe("2");
    expect(valor("Nº AWB")).toBe("957-12345678");
    expect(valor("Despachante")).toBe("—");
    expect(valor("Fornecedor")).toBe("—");
    expect(valor("Nº Ordem")).toBe("—");
    expect(valor("Local de entrega")).toBe("—");
  });

  it("Transportadora: nome e valor em R$ (formatCurrency) como antes", () => {
    const el = montar(proc({ transportadoraNacional: { nome: "Jadlog Logística", valor: 1234.5 } }));
    expect(texto(colunas(el)[3])).toContain("Jadlog Logística");
    expect(texto(colunas(el)[3])).toContain("R$ 1.234,50");
  });

  it("Nº do processo mantém as duas versões (mobile com <wbr>, desktop em um span)", () => {
    const el = montar(proc());
    const coluna3 = colunas(el)[2]!;
    expect(coluna3.querySelector("span.lg\\:inline")?.textContent).toBe("25BR00001234567-8/2026");
    expect(coluna3.querySelector("span.lg\\:hidden wbr")).not.toBeNull();
  });
});
