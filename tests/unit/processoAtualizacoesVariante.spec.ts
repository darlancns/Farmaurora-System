// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoAtualizacoes from "../../app/components/processos/ProcessoAtualizacoes.vue";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";

// A prop `variante` do ProcessoAtualizacoes é ADITIVA: o padrão ("lista", usado pelo detalhe da Lista) continua com o
// visual de sempre (botões de texto "Editar"/"Excluir", data em fonte de código, borda à esquerda, fio em cima); só a
// variante "painel" (barra lateral do Kanban) troca para a data em pílula e os ícones.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "p1",
    paciente: "Maria",
    numeroRemessa: 1,
    empresa: "FARMAURORA",
    medicamentos: [{ nome: "A" }],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [
      { data: "31/08", texto: "Carga embarcada." },
      { data: "", texto: "Sem data." },
    ],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  } as Processo;
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

describe("ProcessoAtualizacoes: variante padrão (lista) continua igual", () => {
  for (const [nome, props] of [
    ["sem prop", {}],
    ["variante='lista'", { variante: "lista" as const }],
  ] as const) {
    it(`${nome}: botões de TEXTO Editar/Excluir, data em fonte de código, '—' sem data, borda à esquerda e fio em cima`, async () => {
      const el = montar(defineComponent({ render: () => h(ProcessoAtualizacoes, { processo: proc(), ...props }) }));
      await nextTick();
      const raiz = el.firstElementChild!;
      expect(raiz.className).toContain("border-t");
      expect(raiz.className).toContain("pt-2.5");
      expect(texto(raiz.querySelector("p"))).toBe("Atualizações");
      expect(raiz.querySelector("p")!.className).toContain("mb-1.5");
      const ol = raiz.querySelector("ol")!;
      expect(ol.className).toContain("flex-col");
      expect(ol.className).not.toContain("divide-y");
      const itens = [...ol.querySelectorAll(":scope > li")];
      for (const li of itens) {
        expect(li.className).toContain("border-l-2");
        expect(li.className).toContain("pl-2.5");
      }
      expect(texto(itens[0]!.querySelector("button#btn-edit-atualizacao-p1-0"))).toBe("Editar");
      expect(texto(itens[0]!.querySelector("button#btn-delete-atualizacao-p1-0"))).toBe("Excluir");
      expect(itens[0]!.querySelector("button svg")).toBeNull();
      expect(texto(itens[0]!.querySelector("span.font-mono"))).toBe("31/08");
      expect(texto(itens[1]!.querySelector("span.font-mono"))).toBe("—"); // sem data: "—", não "obs."
      expect(texto(raiz)).not.toContain("obs.");
      expect(itens[0]!.querySelector("button")!.getAttribute("aria-label")).toBe("Editar atualização de 31/08");
    });

    it(`${nome}: sem atualizações, o texto é o de sempre`, async () => {
      const el = montar(defineComponent({ render: () => h(ProcessoAtualizacoes, { processo: proc({ atualizacoes: [] }), ...props }) }));
      await nextTick();
      expect(texto(el)).toContain("Nenhuma atualização registrada ainda.");
    });
  }

  it("o detalhe da Lista (ProcessoDetail) usa a variante padrão: botões de texto e texto vazio de sempre", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: proc() }) }));
    await nextTick();
    const botoes = [...el.querySelectorAll("#atualizacao-p1-0 button")];
    expect(botoes.map((b) => texto(b))).toEqual(["Editar", "Excluir"]);
    expect(el.querySelector("#atualizacao-p1-1 span.font-mono")!.textContent!.trim()).toBe("—");
    expect(el.querySelector("[id^='painel-']")).toBeNull();
  });

  it("a variante 'painel' é a única que troca para pílula e ícones", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoAtualizacoes, { processo: proc(), variante: "painel" }) }));
    await nextTick();
    expect(texto(el.querySelector("#atualizacao-p1-1 span"))).toBe("obs.");
    expect(texto(el.querySelector("#btn-edit-atualizacao-p1-0"))).toBe("");
    expect(el.firstElementChild!.className).not.toContain("border-t");
  });
});
