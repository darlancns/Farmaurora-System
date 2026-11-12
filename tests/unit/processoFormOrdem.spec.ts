// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoFormMedicamentos from "../../app/components/processos/ProcessoFormMedicamentos.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// ORDEM dos campos do formulário de processo — a MESMA ordem do painel lateral do Kanban (Etapa D). Componente real
// (ProcessoFormModal) no happy-dom. A ordem do DOM é a ordem de tabulação e a ordem de leitura; os ids pf-... não
// mudam, só a posição e o agrupamento.

const ROTULO_ENVIO = "Envio"; // o id continua pf-modal; só o rótulo na tela mudou

const DATAS = [
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

// De cima para baixo, com o Envio = Air Cargo (o Despachante e a Transportadora aparecem).
const ORDEM_ESPERADA = [
  // 1. Paciente
  "pf-paciente",
  // 2. Pasta · PO · Nº Ordem
  "pf-pasta",
  "pf-numero-po",
  "pf-numero-remessa",
  // 3. Medicamentos
  "pf-medicamento-quantidade-0",
  "pf-medicamento-nome-0",
  // 4. Fornecedor · Envio
  "pf-fornecedor",
  "pf-modal",
  // 5. Cia. aérea · Nº AWB · Despachante
  "pf-cia-aerea",
  "pf-awb",
  "pf-despachante",
  // 6. Transportadora · Local de entrega
  "pf-transp-nome",
  "pf-transp-cotacao",
  "pf-transp-valor",
  "pf-local-entrega",
  // 7. Nº do processo
  "pf-numero-processo",
  // 8. Datas
  ...DATAS,
  // 9. Pendências
  "btn-add-pendencia",
  // 10. Controle do processo
  "pf-empresa",
  "pf-responsavel",
  "pf-consultor",
  "pf-status",
  "pf-status-pagamento",
];

// Legendas dos blocos (fieldset), na ordem.
const LEGENDAS = [
  "Medicamentos",
  "Fornecedor e envio",
  "Embarque",
  "Transportadora e entrega",
  "Processo",
  "Datas",
  "Pendências",
  "Controle do processo",
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

function abrir(extra: Record<string, unknown> = {}): HTMLElement {
  const processo: Processo = montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);
  return montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: processo }) }));
}

// Os ids do conjunto que aparecem no formulário, na ORDEM do DOM.
function idsNaOrdemDoDom(el: HTMLElement, conjunto: string[]): string[] {
  const permitidos = new Set(conjunto);
  return [...el.querySelectorAll<HTMLElement>("#processo-form [id]")].map((n) => n.id).filter((id) => permitidos.has(id));
}

const blocoDe = (el: HTMLElement, id: string) =>
  texto(el.querySelector(`#${id}`)!.closest("fieldset")?.querySelector(":scope > legend") ?? null);

describe("Formulário de processo — ordem dos campos no DOM (= ordem do painel)", () => {
  it("os campos aparecem exatamente na ordem aprovada (Envio = Air Cargo)", async () => {
    const el = abrir();
    await nextTick();
    const todos = [...ORDEM_ESPERADA, "pf-fornecedor-outro", "pf-status-outro"];
    expect(idsNaOrdemDoDom(el, todos)).toEqual(ORDEM_ESPERADA);
  });

  it("cada campo vem DEPOIS do anterior (compareDocumentPosition)", async () => {
    const el = abrir();
    await nextTick();
    for (let i = 1; i < ORDEM_ESPERADA.length; i++) {
      const antes = el.querySelector(`#${ORDEM_ESPERADA[i - 1]}`)!;
      const depois = el.querySelector(`#${ORDEM_ESPERADA[i]}`)!;
      expect(antes, ORDEM_ESPERADA[i - 1]).toBeTruthy();
      expect(depois, ORDEM_ESPERADA[i]).toBeTruthy();
      expect(
        antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${ORDEM_ESPERADA[i - 1]} → ${ORDEM_ESPERADA[i]}`,
      ).toBeTruthy();
    }
  });

  it("nenhum campo se perdeu: o conjunto de ids pf-* é o de sempre (menos o antigo 'Qual status?')", async () => {
    const el = abrir({ fornecedor: "Fornecedor Que Não Existe" });
    await nextTick();
    const ids = new Set([...el.querySelectorAll<HTMLElement>("#processo-form [id^='pf-']")].map((n) => n.id));
    for (const id of [...ORDEM_ESPERADA.filter((i) => i.startsWith("pf-")), "pf-fornecedor-outro"]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(ids.has("pf-status-outro")).toBe(false);
  });

  it("linha 1 = só o Paciente; linha 2 = Pasta / PO / Nº Ordem; depois os Medicamentos", async () => {
    const el = abrir();
    await nextTick();
    const linha = (id: string) => el.querySelector(`#${id}`)!.closest("#processo-form > div > div")!;
    const linha1 = linha("pf-paciente");
    expect(linha1.querySelector("#pf-pasta")).toBeNull();
    const linha2 = linha("pf-pasta");
    expect(linha2).not.toBe(linha1);
    expect(linha("pf-numero-po")).toBe(linha2);
    expect(linha("pf-numero-remessa")).toBe(linha2);
    expect(linha2.querySelector("#pf-numero-processo")).toBeNull(); // o Nº do processo foi para o bloco 7
    expect(linha1.compareDocumentPosition(linha2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(linha2.compareDocumentPosition(el.querySelector("#pf-medicamento-nome-0")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("linha 2 em lg+: Pasta e PO com a MESMA largura (7rem) e Nº Ordem 5rem; abaixo de lg, Pasta | PO iguais", async () => {
    const el = abrir();
    await nextTick();
    const linha2 = el.querySelector("#pf-pasta")!.closest("#processo-form > div > div")!;
    const classes = (linha2.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("grid-cols-2");
    expect(classes).toContain("lg:grid-cols-[7rem_7rem_5rem]");
    expect(classes.filter((c) => c.startsWith("lg:grid-cols-"))).toHaveLength(1);
    // A largura comporta a máscara de 10 caracteres ("2026 - 234" e "PO-00-0000": JetBrains Mono 13,5px = 0,6em por
    // caractere, padding 2×10px, borda 2×1px) com a mesma sobra.
    const necessaria = 10 * 0.6 * 13.5 + 2 * 10 + 2 * 1; // 103px
    const sobra = 7 * 16 - necessaria;
    expect(sobra).toBeGreaterThanOrEqual(8);
    expect(sobra).toBeLessThan(10);
    for (const id of ["pf-pasta", "pf-numero-po"]) {
      const cls = (linha2.querySelector(`#${id}`)!.getAttribute("class") ?? "").split(/\s+/);
      expect(cls.filter((c) => /(^|:)(max-w|w)-/.test(c) && c !== "w-full"), id).toEqual([]);
      expect(cls.filter((c) => /(^|:)px-/.test(c)), `${id}: padding só o de sempre (px-2.5)`).toEqual(["px-2.5"]);
    }
    // Nº Ordem: 5rem também abaixo de lg (w-20), em linha própria.
    const ordem = linha2.querySelector("#pf-numero-remessa")!.closest("#processo-form > div > div > div")!;
    expect(ordem.getAttribute("class")).toContain("w-20");
    expect(ordem.getAttribute("class")).toContain("col-span-2");
  });

  it("Nº do processo: bloco próprio, em linha inteira (sem teto de largura)", async () => {
    const el = abrir();
    await nextTick();
    expect(blocoDe(el, "pf-numero-processo")).toBe("Processo");
    const campo = el.querySelector("#pf-numero-processo")!;
    const cls = (campo.getAttribute("class") ?? "").split(/\s+/);
    expect(cls.filter((c) => /(^|:)(max-w|w)-/.test(c) && c !== "w-full")).toEqual([]);
  });

  it("Pendências: bloco depois das datas, com o botão de adicionar, e antes do Controle do processo; o rodapé fecha", async () => {
    const el = abrir();
    await nextTick();
    expect(blocoDe(el, "btn-add-pendencia")).toBe("Pendências");
    const ultimaData = el.querySelector("#pf-suposta-estimativa")!;
    const add = el.querySelector("#btn-add-pendencia")!;
    const salvar = el.querySelector("#btn-save-processo")!;
    expect(ultimaData.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.compareDocumentPosition(el.querySelector("#pf-empresa")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector("#pf-status-pagamento")!.compareDocumentPosition(salvar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("condicional: 'Qual fornecedor?' em linha própria logo depois de Fornecedor · Envio; 'Qual status?' não existe", async () => {
    const el = abrir({ fornecedor: "Fornecedor Que Não Existe", status: "outro", status_outro: "Aguardando" });
    await nextTick();
    const ids = ["pf-fornecedor", "pf-modal", "pf-fornecedor-outro", "pf-cia-aerea"];
    expect(idsNaOrdemDoDom(el, ids)).toEqual(ids);
    expect(blocoDe(el, "pf-fornecedor-outro")).toBe("Fornecedor e envio");
    const linhaGrade = el.querySelector("#pf-fornecedor")!.closest(".grid")!;
    expect(linhaGrade.querySelector("#pf-fornecedor-outro")).toBeNull();
    expect(el.querySelector("#pf-status-outro")).toBeNull();
  });

  it("Envio 'Courier Simples': Despachante e Transportadora (nome/cotação/valor) somem; o resto mantém a ordem", async () => {
    const el = abrir({ modal_envio: "Courier Simples", companhia_aerea: "DHL" });
    await nextTick();
    const esperado = ORDEM_ESPERADA.filter((id) => id !== "pf-despachante" && !id.startsWith("pf-transp-"));
    expect(idsNaOrdemDoDom(el, ORDEM_ESPERADA)).toEqual(esperado);
    expect(el.querySelector("#pf-despachante")).toBeNull();
    expect(el.querySelector("#pf-transp-nome")).toBeNull();
    expect(el.querySelector("#pf-local-entrega")).not.toBeNull(); // Local de entrega continua
  });

  it("Status com as 5 opções na ordem do fluxo", async () => {
    const el = abrir();
    await nextTick();
    el.querySelector<HTMLButtonElement>("#pf-status")!.click();
    await nextTick();
    const opcoes = [...el.querySelectorAll("li")]
      .map(texto)
      .filter((t) => ["Na origem", "Em trânsito", "Desembaraço", "Liberado", "Entregue"].includes(t));
    expect(opcoes).toEqual(["Na origem", "Em trânsito", "Desembaraço", "Liberado", "Entregue"]);
  });

  it("o campo pf-modal tem o rótulo 'Envio' (e não 'Modal'); nenhum rótulo do formulário diz 'Modal'", async () => {
    const el = abrir();
    await nextTick();
    expect(texto(el.querySelector("label[for='pf-modal']"))).toBe(ROTULO_ENVIO);
    const rotulos = [...el.querySelectorAll("#processo-form label, #processo-form legend, #processo-form p")].map(texto);
    expect(rotulos.filter((t) => /\bmodal\b/i.test(t))).toEqual([]);
  });

  it("blocos (fieldset) na ordem, com as legendas certas e o estilo do painel (linha em cima, sem moldura)", async () => {
    const el = abrir();
    await nextTick();
    expect([...el.querySelectorAll("#processo-form fieldset > legend")].map(texto)).toEqual(LEGENDAS);
    for (const fs of el.querySelectorAll("#processo-form fieldset")) {
      const cls = (fs.getAttribute("class") ?? "").split(/\s+/);
      expect(cls).toContain("border-t");
      expect(cls).toContain("border-hairline");
      expect(cls).not.toContain("rounded-md");
    }
  });

  it("cada campo está dentro do bloco certo", async () => {
    const el = abrir();
    await nextTick();
    for (const id of ["pf-medicamento-quantidade-0", "pf-medicamento-nome-0"]) expect(blocoDe(el, id), id).toBe("Medicamentos");
    for (const id of ["pf-fornecedor", "pf-modal"]) expect(blocoDe(el, id), id).toBe("Fornecedor e envio");
    for (const id of ["pf-cia-aerea", "pf-awb", "pf-despachante"]) expect(blocoDe(el, id), id).toBe("Embarque");
    for (const id of ["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor", "pf-local-entrega"]) {
      expect(blocoDe(el, id), id).toBe("Transportadora e entrega");
    }
    for (const id of DATAS) expect(blocoDe(el, id), id).toBe("Datas");
    for (const id of ["pf-empresa", "pf-responsavel", "pf-consultor", "pf-status", "pf-status-pagamento"]) {
      expect(blocoDe(el, id), id).toBe("Controle do processo");
    }
    // Fora de qualquer bloco: Paciente e a linha Pasta / PO / Nº Ordem.
    for (const id of ["pf-paciente", "pf-pasta", "pf-numero-po", "pf-numero-remessa"]) {
      expect(el.querySelector(`#${id}`)!.closest("fieldset"), id).toBeNull();
    }
  });

  it("fieldsets e linhas são filhos DIRETOS do contêiner do corpo (o lg:contents do desktop depende disso)", async () => {
    const el = abrir();
    await nextTick();
    const corpo = el.querySelector("#processo-form > div")!;
    expect(corpo.className).toContain("lg:contents");
    for (const fieldset of el.querySelectorAll("#processo-form fieldset")) {
      expect(fieldset.parentElement, texto(fieldset.querySelector("legend"))).toBe(corpo);
    }
    for (const id of ["pf-paciente", "pf-pasta"]) {
      const linha = el.querySelector(`#${id}`)!.closest("#processo-form > div > div");
      expect(linha?.parentElement, id).toBe(corpo);
    }
  });

  it("o rótulo 'Medicamentos' aparece UMA vez (a legenda do bloco; o componente não repete)", async () => {
    const el = abrir();
    await nextTick();
    const iguais = [...el.querySelectorAll("#processo-form p, #processo-form label, #processo-form legend")].filter(
      (n) => texto(n) === "Medicamentos",
    );
    expect(iguais).toHaveLength(1);
    expect(iguais[0]!.tagName).toBe("LEGEND");
  });

  // Guarda de Tab: a ordem visual é a ordem do DOM em todas as larguras. Reordenar só no CSS (order-*) faria o Tab pular
  // para onde não se espera. Vale para qualquer variante (order-1, lg:order-last, max-lg:order-last, !order-2...).
  it("nenhum elemento do formulário tem classe order-* (nem tabindex positivo): o Tab acompanha o visual", async () => {
    for (const extra of [{}, { modal_envio: "Courier Simples" }, { fornecedor: "Outro Fornecedor", status: "outro", status_outro: "x" }]) {
      const el = abrir(extra);
      await nextTick();
      for (const n of el.querySelectorAll<HTMLElement>("#processo-form [tabindex]")) {
        expect(Number(n.getAttribute("tabindex")), n.id).toBeLessThanOrEqual(0);
      }
      // Só as classes de `order` do Tailwind, não "border-*". getAttribute (e não className): SVG não tem className string.
      const ehOrder = (token: string) => /(^|[:!])-?order-/.test(token);
      const comOrder = [...el.querySelectorAll<HTMLElement>("#processo-form [class], #processo-form *")]
        .filter((n) => (n.getAttribute("class") ?? "").split(/\s+/).some(ehOrder))
        .map((n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}.${n.getAttribute("class")}`);
      expect(comOrder).toEqual([]);
    }
  });
});

describe("ProcessoFormMedicamentos — prop semRotulo", () => {
  const medicamentos = [{ nome: "", quantidade: "" }];

  it("por padrão mostra o rótulo 'Medicamentos' (comportamento de antes)", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormMedicamentos, { items: medicamentos }) }));
    await nextTick();
    expect([...el.querySelectorAll("p")].map(texto)).toContain("Medicamentos");
    expect(el.querySelector("#pf-medicamento-nome-0")).not.toBeNull();
  });

  it("com semRotulo esconde só o rótulo; os campos continuam iguais", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormMedicamentos, { items: medicamentos, semRotulo: true }) }));
    await nextTick();
    expect([...el.querySelectorAll("p")].map(texto)).not.toContain("Medicamentos");
    for (const id of ["pf-medicamento-quantidade-0", "pf-medicamento-nome-0"]) {
      expect(el.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(el.querySelector("button[title='Adicionar medicamento']")).not.toBeNull();
  });
});
