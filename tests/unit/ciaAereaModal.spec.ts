// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import {
  CIAS_AEREAS_POR_MODAL,
  ciaAereaValidaParaModal,
  ciasAereasDoModal,
  MODAIS_ENVIO,
} from "../../shared/constants/processos";
import { CIA_AEREA_SEM_MODAL_LABEL, montarCiaAereaOptions } from "../../app/utils/processoOptions";
import { campoRecebePrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import AppSelect from "../../app/components/AppSelect.vue";
import plugin from "../../app/plugins/primeira-maiuscula.client";

// Item 6 do lote Follow-Up — "Cia. aérea" depende do "Modal de envio". Helpers puros (shared) e as
// opções do select.

describe("ciasAereasDoModal", () => {
  it("Air Cargo: Lufthansa, Emirates, Turkish, Qatar, Swiss", () => {
    expect(ciasAereasDoModal("Air Cargo")).toEqual(["Lufthansa", "Emirates", "Turkish", "Qatar", "Swiss"]);
  });

  it("Courier Formal e Courier Simples: FedEx, DHL", () => {
    expect(ciasAereasDoModal("Courier Formal")).toEqual(["FedEx", "DHL"]);
    expect(ciasAereasDoModal("Courier Simples")).toEqual(["FedEx", "DHL"]);
  });

  it("todo modal conhecido tem cias, e o mapa não tem modal fora de MODAIS_ENVIO", () => {
    for (const modal of MODAIS_ENVIO) expect(ciasAereasDoModal(modal).length, modal).toBeGreaterThan(0);
    expect(Object.keys(CIAS_AEREAS_POR_MODAL).sort()).toEqual([...MODAIS_ENVIO].sort());
  });

  it("modal vazio, nulo, desconhecido ou de outra caixa: lista vazia", () => {
    for (const modal of ["", null, undefined, "Courier", "air cargo", "AIR CARGO", " Air Cargo", "toString", "constructor"]) {
      expect(ciasAereasDoModal(modal), String(modal)).toEqual([]);
    }
  });

  it("'Turkish Cargo' (nome antigo) não está em lista nenhuma: virou 'Turkish'", () => {
    for (const modal of MODAIS_ENVIO) expect(ciasAereasDoModal(modal)).not.toContain("Turkish Cargo");
    expect(ciasAereasDoModal("Air Cargo")).toContain("Turkish");
  });
});

describe("ciaAereaValidaParaModal", () => {
  it("cada cia de cada modal é válida para o seu modal", () => {
    for (const modal of MODAIS_ENVIO) {
      for (const cia of ciasAereasDoModal(modal)) expect(ciaAereaValidaParaModal(modal, cia), `${modal}/${cia}`).toBe(true);
    }
  });

  it("cia de outro modal é inválida", () => {
    expect(ciaAereaValidaParaModal("Courier Formal", "Swiss")).toBe(false);
    expect(ciaAereaValidaParaModal("Courier Simples", "Lufthansa")).toBe(false);
    expect(ciaAereaValidaParaModal("Air Cargo", "FedEx")).toBe(false);
    expect(ciaAereaValidaParaModal("Air Cargo", "DHL")).toBe(false);
  });

  it("cia vazia é sempre válida (a cia é opcional), com qualquer modal, inclusive vazio", () => {
    for (const modal of ["Air Cargo", "Courier Formal", "", null, undefined, "Courier"]) {
      for (const cia of ["", "   ", null, undefined]) {
        expect(ciaAereaValidaParaModal(modal, cia), `${String(modal)}/${String(cia)}`).toBe(true);
      }
    }
  });

  it("cia preenchida sem modal (ou com modal desconhecido) é inválida", () => {
    expect(ciaAereaValidaParaModal("", "Lufthansa")).toBe(false);
    expect(ciaAereaValidaParaModal(null, "FedEx")).toBe(false);
    expect(ciaAereaValidaParaModal(undefined, "FedEx")).toBe(false);
    expect(ciaAereaValidaParaModal("Courier", "FedEx")).toBe(false);
  });

  it("compara após trim", () => {
    expect(ciaAereaValidaParaModal("Air Cargo", "  Qatar ")).toBe(true);
    expect(ciaAereaValidaParaModal("Courier Formal", "\tDHL\n")).toBe(true);
  });

  it("é sensível a maiúsculas e minúsculas (correspondência exata)", () => {
    expect(ciaAereaValidaParaModal("Air Cargo", "qatar")).toBe(false);
    expect(ciaAereaValidaParaModal("Air Cargo", "LUFTHANSA")).toBe(false);
    expect(ciaAereaValidaParaModal("Courier Formal", "Fedex")).toBe(false);
    expect(ciaAereaValidaParaModal("Courier Formal", "dhl")).toBe(false);
  });

  it("'Turkish Cargo' (nome antigo) é inválido em qualquer modal; 'Turkish' vale só no Air Cargo", () => {
    for (const modal of MODAIS_ENVIO) expect(ciaAereaValidaParaModal(modal, "Turkish Cargo"), modal).toBe(false);
    expect(ciaAereaValidaParaModal("Air Cargo", "Turkish")).toBe(true);
    expect(ciaAereaValidaParaModal("Courier Formal", "Turkish")).toBe(false);
  });

  it("valor antigo do mundo real: LATAM Cargo não vale para nenhum modal", () => {
    for (const modal of MODAIS_ENVIO) expect(ciaAereaValidaParaModal(modal, "LATAM Cargo")).toBe(false);
  });
});

describe("montarCiaAereaOptions", () => {
  const valores = (o: Array<{ value: string }>) => o.map((x) => x.value);

  it("sem modal: só o texto-guia 'Escolha o modal primeiro'", () => {
    expect(montarCiaAereaOptions("", "")).toEqual([{ value: "", label: CIA_AEREA_SEM_MODAL_LABEL }]);
    expect(CIA_AEREA_SEM_MODAL_LABEL).toBe("Escolha o modal primeiro");
  });

  it("com modal: 'Selecione' + as cias do modal", () => {
    expect(montarCiaAereaOptions("Air Cargo", "")).toEqual([
      { value: "", label: "Selecione" },
      ...["Lufthansa", "Emirates", "Turkish", "Qatar", "Swiss"].map((c) => ({ value: c, label: c })),
    ]);
    expect(valores(montarCiaAereaOptions("Courier Formal", ""))).toEqual(["", "FedEx", "DHL"]);
    expect(valores(montarCiaAereaOptions("Courier Simples", ""))).toEqual(["", "FedEx", "DHL"]);
  });

  it("valor atual dentro da lista: nenhuma opção extra", () => {
    expect(montarCiaAereaOptions("Air Cargo", "Qatar")).toHaveLength(6);
  });

  it("valor atual fora da lista entra como opção extra '<valor> (fora da lista)'", () => {
    const o = montarCiaAereaOptions("Courier Formal", "Swiss");
    expect(o.at(-1)).toEqual({ value: "Swiss", label: "Swiss (fora da lista)" });
    expect(valores(o)).toEqual(["", "FedEx", "DHL", "Swiss"]);
  });

  it("'Turkish Cargo' (valor antigo) aparece como fora da lista, no Air Cargo", () => {
    const o = montarCiaAereaOptions("Air Cargo", "Turkish Cargo");
    expect(o.at(-1)).toEqual({ value: "Turkish Cargo", label: "Turkish Cargo (fora da lista)" });
    expect(valores(o)).toEqual(["", "Lufthansa", "Emirates", "Turkish", "Qatar", "Swiss", "Turkish Cargo"]);
  });

  it("valor antigo sem modal: continua visível (fora da lista), junto do texto-guia", () => {
    expect(montarCiaAereaOptions("", "Swiss")).toEqual([
      { value: "", label: "Escolha o modal primeiro" },
      { value: "Swiss", label: "Swiss (fora da lista)" },
    ]);
  });
});

// A regra global de "primeira letra maiúscula" só age em <input> de texto e <textarea> (evento "input"). O
// select de cia usa o AppSelect (botão + lista): ele não entra na regra.
describe("a regra da primeira letra maiúscula não interfere no select de cia aérea", () => {
  const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

  beforeAll(() => {
    (plugin as unknown as () => void)();
  });

  afterEach(() => {
    while (montados.length) {
      const m = montados.pop()!;
      m.unmount();
      m.el.remove();
    }
  });

  it("botão e itens do AppSelect não são campos da regra; um 'input' sobre eles não altera o texto", async () => {
    const valor = ref("");
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(AppSelect<string>, {
            id: "pf-cia-aerea",
            modelValue: valor.value,
            options: [
              { value: "", label: "Selecione" },
              { value: "dhl", label: "dhl minúsculo" },
            ],
            "onUpdate:modelValue": (v: string) => (valor.value = v),
          }),
      }),
    );
    app.mount(el);
    montados.push({ unmount: () => app.unmount(), el });

    const botao = el.querySelector<HTMLButtonElement>("#pf-cia-aerea")!;
    expect(campoRecebePrimeiraMaiuscula(botao)).toBe(false);

    botao.click();
    await nextTick();
    const item = el.querySelector("li:nth-child(2)")!;
    expect(campoRecebePrimeiraMaiuscula(item)).toBe(false);

    botao.dispatchEvent(new InputEvent("input", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await nextTick();

    expect(valor.value).toBe("dhl"); // sem capitalizar
    expect(botao.textContent).toContain("dhl minúsculo");
  });
});
