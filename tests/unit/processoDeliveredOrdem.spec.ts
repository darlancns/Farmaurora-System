// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDeliveredList from "../../app/components/processos/ProcessoDeliveredList.vue";

// A aba Entregues ordena "Previsão entrega" por data REAL, crescente (antes era texto: "05/12" vinha antes de
// "20/08"). Componente real no happy-dom; "hoje" fixo em 07/11/2026.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

function entregue(id: string, previsao?: string): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "entregue",
    datas: previsao === undefined ? {} : { previsaoEntrega: previsao },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
  };
}

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(processos: Processo[]): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render: () => h(ProcessoDeliveredList, { processos }) }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}

const ordem = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("[id^='processo-delivered-']"))
    .map((n) => n.id.replace("processo-delivered-", ""))
    .filter((id) => !id.startsWith("list"));

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("ProcessoDeliveredList — ordem por data real", () => {
  it("'05/12' vem DEPOIS de '20/08' (a ordem por texto errava isso)", () => {
    const el = montar([entregue("dez", "05/12"), entregue("ago", "20/08"), entregue("jan", "10/01")]);
    expect(ordem(el)).toEqual(["jan", "ago", "dez"]);
  });

  it("mistura DD/MM e DD/MM/AAAA, texto antigo com observação, e sem data no fim (ordem original entre si)", () => {
    const el = montar([
      entregue("sem1"),
      entregue("ano27", "05/01/2027"),
      entregue("obs", "13/10; deferido 14/10"),
      entregue("ja-tem", "já tem, compra recorrente"),
      entregue("ano25", "30/12/2025"),
      entregue("inv", "31/02"),
      entregue("ago", "20/08"),
    ]);
    expect(ordem(el)).toEqual(["ano25", "ago", "obs", "ano27", "sem1", "ja-tem", "inv"]);
  });

  it("empates mantêm a ordem original", () => {
    const el = montar([entregue("b", "10/12"), entregue("a", "10/12"), entregue("c", "09/12")]);
    expect(ordem(el)).toEqual(["c", "b", "a"]);
  });

  it("reordena quando a lista muda (reativo)", async () => {
    const lista = ref<Processo[]>([entregue("dez", "05/12"), entregue("ago", "20/08")]);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(ProcessoDeliveredList, { processos: lista.value }) }));
    app.mount(el);
    montados.push({ unmount: () => app.unmount(), el });

    expect(ordem(el)).toEqual(["ago", "dez"]);
    lista.value = [...lista.value, entregue("nov", "01/11")];
    await nextTick();
    expect(ordem(el)).toEqual(["ago", "nov", "dez"]); // 20/08 < 01/11 < 05/12
  });

  it("o que aparece na linha é o texto original (a ordenação não altera os dados)", () => {
    const el = montar([entregue("obs", "13/10; deferido 14/10")]);
    expect(el.textContent).toContain("13/10; deferido 14/10");
  });
});
