// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import AppDatePicker from "../../app/components/AppDatePicker.vue";
import ProcessoFormDatas from "../../app/components/processos/ProcessoFormDatas.vue";

// Item 11 — o texto-guia do campo de data VAZIO no fieldset "Datas" do formulário de processo vai por prop. Com o ano
// automático (campo digitável) ele é "DD/MM/AAAA", o formato que se digita. O padrão do AppDatePicker ("Escolher
// data") continua valendo nos outros usos (data do pagamento, etc.).

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
  it("os 9 campos vazios são digitáveis e mostram só o texto-guia 'DD/MM/AAAA'", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormDatas, { values: valores() }) }));
    await nextTick();
    for (const id of IDS_DATAS) {
      const campo = el.querySelector<HTMLInputElement>(`input#${id}`)!;
      expect(campo, id).toBeTruthy();
      expect(campo.value, id).toBe("");
      expect(campo.placeholder, id).toBe("DD/MM/AAAA");
    }
    // A legenda do fieldset continua "Datas" (e só ela).
    expect(texto(el.querySelector("legend"))).toBe("Datas");
  });

  it("campo preenchido mostra o valor como está gravado (DD/MM/AAAA ou o DD/MM antigo)", async () => {
    const el = montar(
      defineComponent({
        render: () => h(ProcessoFormDatas, { values: valores({ dataCompraPO: "05/09/2026", dataEmbarque: "06/09" }) }),
      }),
    );
    await nextTick();
    expect(el.querySelector<HTMLInputElement>("#pf-data-po")!.value).toBe("05/09/2026");
    expect(el.querySelector<HTMLInputElement>("#pf-data-embarque")!.value).toBe("06/09");
    expect(el.querySelector<HTMLInputElement>("#pf-thread")!.value).toBe("");
  });

  it("acessível: o rótulo é o <label for> do campo e o botão do calendário diz de qual data é", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormDatas, { values: valores() }) }));
    await nextTick();
    expect(texto(el.querySelector("label[for='pf-data-po']"))).toBe("Compra (PO)");
    expect(el.querySelector("#pf-data-po-abrir-calendario")!.getAttribute("aria-label")).toBe(
      "Abrir calendário de Compra (PO)",
    );
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
