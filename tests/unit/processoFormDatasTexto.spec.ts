// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import AppDatePicker from "../../app/components/AppDatePicker.vue";
import ProcessoFormDatas from "../../app/components/processos/ProcessoFormDatas.vue";

// Item 11 — o texto do campo de data VAZIO, no fieldset "Datas" do formulário de processo, é só "Escolher". O padrão
// do AppDatePicker ("Escolher data") continua valendo nos outros usos (data do pagamento, etc.): o texto vai por prop.

const IDS_DATAS = [
  "pf-data-po",
  "pf-data-embarque",
  "pf-thread",
  "pf-chegada",
  "pf-radar",
  "pf-duimp",
  "pf-lpco",
  "pf-previsao",
  "pf-suposta-estimativa",
];

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
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const valores = (extra: Record<string, string> = {}) => ({
  dataCompraPO: "",
  dataEmbarque: "",
  aberturaThread: "",
  dataChegadaBrasil: "",
  registroRadar: "",
  registroDuimp: "",
  registroLpco: "",
  previsaoEntrega: "",
  supostaEstimativa: "",
  ...extra,
});

describe("Formulário de processo — fieldset Datas", () => {
  it("os 9 campos vazios mostram apenas 'Escolher' (sem a palavra 'data')", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormDatas, { values: valores() }) }));
    await nextTick();
    for (const id of IDS_DATAS) {
      const botao = el.querySelector(`#${id}`)!;
      expect(botao, id).toBeTruthy();
      expect(texto(botao), id).toBe("Escolher");
    }
    // A legenda do fieldset continua "Datas" (e só ela).
    expect(texto(el.querySelector("legend"))).toBe("Datas");
  });

  it("campo preenchido mostra o valor (DD/MM), não o texto-guia", async () => {
    const el = montar(
      defineComponent({ render: () => h(ProcessoFormDatas, { values: valores({ dataCompraPO: "05/09/2026" }) }) }),
    );
    await nextTick();
    expect(texto(el.querySelector("#pf-data-po"))).toContain("05/09");
    expect(texto(el.querySelector("#pf-data-po"))).not.toContain("Escolher");
    expect(texto(el.querySelector("#pf-data-embarque"))).toBe("Escolher");
  });

  it("o aria-label do botão (rótulo + situação) não mudou: 'Compra (PO): nenhuma data escolhida'", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormDatas, { values: valores() }) }));
    await nextTick();
    expect(el.querySelector("#pf-data-po")!.getAttribute("aria-label")).toBe("Compra (PO): nenhuma data escolhida");
  });
});

describe("AppDatePicker — texto-guia dos outros usos", () => {
  it("sem prop, o padrão continua 'Escolher data' (ex.: Data do pagamento)", async () => {
    const el = montar(
      defineComponent({ render: () => h(AppDatePicker, { id: "epr-data", formato: "iso", label: "Data do pagamento" }) }),
    );
    await nextTick();
    expect(texto(el.querySelector("#epr-data"))).toBe("Escolher data");
  });

  it("com placeholder próprio (ex.: 'Escolher nova data' do aviso 'chegou?') usa o dele", async () => {
    const el = montar(
      defineComponent({ render: () => h(AppDatePicker, { id: "chegada-data-x", placeholder: "Escolher nova data" }) }),
    );
    await nextTick();
    expect(texto(el.querySelector("#chegada-data-x"))).toBe("Escolher nova data");
  });
});
