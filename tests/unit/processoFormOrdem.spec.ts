// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoFormMedicamentos from "../../app/components/processos/ProcessoFormMedicamentos.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 11 — ORDEM dos campos do formulário de processo. Componente real (ProcessoFormModal) no happy-dom. A ordem do DOM
// é a ordem de tabulação e a ordem de leitura; os ids pf-... não mudam, só a posição e o agrupamento.

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

// De cima para baixo, com o Envio = Air Cargo (o Despachante e a Transportadora nacional aparecem).
const ORDEM_ESPERADA = [
  "pf-paciente",
  "pf-pasta",
  "pf-numero-po",
  "pf-numero-remessa",
  "pf-numero-processo",
  "pf-medicamento-quantidade-0",
  "pf-medicamento-nome-0",
  "pf-local-entrega",
  "pf-empresa",
  "pf-responsavel",
  "pf-consultor",
  "pf-fornecedor",
  "pf-status",
  "pf-status-pagamento",
  "pf-modal",
  "pf-cia-aerea",
  "pf-awb",
  "pf-despachante",
  "pf-transp-nome",
  "pf-transp-cotacao",
  "pf-transp-valor",
  ...DATAS,
  "btn-add-pendencia",
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

describe("Formulário de processo — ordem dos campos no DOM", () => {
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

  it("linha 1 = Paciente / Pasta / Nº Ordem; linha 2 = Nº Remessa / Nº do processo; só depois vêm os Medicamentos", async () => {
    const el = abrir();
    await nextTick();
    const linha = (id: string) => el.querySelector(`#${id}`)!.closest("#processo-form > div > div")!;
    const linha1 = linha("pf-paciente");
    expect(linha("pf-pasta")).toBe(linha1);
    expect(linha("pf-numero-po")).toBe(linha1);
    expect(linha1.querySelector("#pf-numero-remessa")).toBeNull(); // o Nº Remessa saiu da linha 1
    const linha2 = linha("pf-numero-remessa");
    expect(linha2).not.toBe(linha1);
    expect(linha("pf-numero-processo")).toBe(linha2);
    expect(linha1.compareDocumentPosition(linha2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O Nº do processo NÃO está mais no lugar antigo (grupo Empresa / Responsável / Consultor / Fornecedor e abaixo).
    const grupoSelects = linha("pf-empresa");
    expect(grupoSelects.querySelector("#pf-numero-processo")).toBeNull();
    expect(linha2.compareDocumentPosition(grupoSelects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(linha2.compareDocumentPosition(el.querySelector("#pf-medicamento-nome-0")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o rótulo 'Pendências' vem logo antes do botão de adicionar, depois das datas, e o rodapé fecha o formulário", async () => {
    const el = abrir();
    await nextTick();
    const rotulo = [...el.querySelectorAll("#processo-form p")].find((p) => texto(p) === "Pendências")!;
    expect(rotulo).toBeTruthy();
    const ultimaData = el.querySelector("#pf-suposta-estimativa")!;
    const salvar = el.querySelector("#btn-save-processo")!;
    expect(ultimaData.compareDocumentPosition(rotulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rotulo.compareDocumentPosition(el.querySelector("#btn-add-pendencia")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector("#btn-add-pendencia")!.compareDocumentPosition(salvar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("condicionais: 'Qual fornecedor?' logo depois do Fornecedor e 'Qual status?' logo depois do Pagamento", async () => {
    const el = abrir({ fornecedor: "Fornecedor Que Não Existe", status: "outro", status_outro: "Aguardando" });
    await nextTick();
    const ids = ["pf-fornecedor", "pf-fornecedor-outro", "pf-status", "pf-status-pagamento", "pf-status-outro", "pf-modal"];
    expect(idsNaOrdemDoDom(el, ids)).toEqual(ids);
  });

  it("Envio 'Courier Simples': Despachante e Transportadora nacional somem; o resto mantém a ordem", async () => {
    const el = abrir({ modal_envio: "Courier Simples", companhia_aerea: "DHL" });
    await nextTick();
    const esperado = ORDEM_ESPERADA.filter((id) => id !== "pf-despachante" && !id.startsWith("pf-transp-"));
    expect(idsNaOrdemDoDom(el, ORDEM_ESPERADA)).toEqual(esperado);
    expect(el.querySelector("#pf-despachante")).toBeNull();
    expect(el.querySelector("#pf-transp-nome")).toBeNull();
  });

  it("o campo pf-modal tem o rótulo 'Envio' (e não mais 'Modal'); nenhum rótulo do formulário diz 'Modal'", async () => {
    const el = abrir();
    await nextTick();
    expect(texto(el.querySelector("label[for='pf-modal']"))).toBe(ROTULO_ENVIO);
    const rotulos = [...el.querySelectorAll("#processo-form label, #processo-form legend, #processo-form p")].map(texto);
    expect(rotulos.filter((t) => /\bmodal\b/i.test(t))).toEqual([]);
  });

  it("blocos com moldura: 4 fieldsets, na ordem, com as legendas certas", async () => {
    const el = abrir();
    await nextTick();
    const legendas = [...el.querySelectorAll("#processo-form fieldset > legend")].map(texto);
    expect(legendas).toEqual(["Medicamentos e local de entrega", "Envio internacional", "Transportadora nacional", "Datas"]);
  });

  it("cada campo está dentro do bloco certo", async () => {
    const el = abrir();
    await nextTick();
    const blocoDe = (id: string) => texto(el.querySelector(`#${id}`)!.closest("fieldset")?.querySelector(":scope > legend") ?? null);
    for (const id of ["pf-medicamento-quantidade-0", "pf-medicamento-nome-0", "pf-local-entrega"]) {
      expect(blocoDe(id), id).toBe("Medicamentos e local de entrega");
    }
    for (const id of ["pf-modal", "pf-cia-aerea", "pf-awb"]) expect(blocoDe(id), id).toBe("Envio internacional");
    for (const id of ["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor"]) expect(blocoDe(id), id).toBe("Transportadora nacional");
    for (const id of DATAS) expect(blocoDe(id), id).toBe("Datas");
    // Fora de qualquer bloco: a linha 1, o grupo de selects, Nº do processo, Status/Pagamento e o Despachante.
    for (const id of [
      "pf-paciente", "pf-pasta", "pf-numero-po", "pf-numero-remessa", "pf-empresa", "pf-responsavel", "pf-consultor",
      "pf-fornecedor", "pf-numero-processo", "pf-status", "pf-status-pagamento", "pf-despachante",
    ]) {
      expect(el.querySelector(`#${id}`)!.closest("fieldset"), id).toBeNull();
    }
  });

  it("fieldsets e linhas são filhos DIRETOS do contêiner do corpo (o lg:contents do desktop depende disso)", async () => {
    const el = abrir();
    await nextTick();
    const corpo = el.querySelector("#processo-form > div")!;
    expect(corpo.className).toContain("lg:contents");
    for (const fieldset of el.querySelectorAll("#processo-form fieldset")) {
      // Os fieldsets das Datas e da Transportadora/Envio/Medicamentos: pai imediato = o contêiner do corpo.
      expect(fieldset.parentElement, texto(fieldset.querySelector("legend"))).toBe(corpo);
    }
    for (const id of ["pf-despachante", "pf-numero-processo", "pf-status"]) {
      const linha = el.querySelector(`#${id}`)!.closest("#processo-form > div > div");
      expect(linha?.parentElement, id).toBe(corpo);
    }
  });

  it("o rótulo 'Medicamentos' NÃO aparece duplicado (a legenda do bloco já diz isso)", async () => {
    const el = abrir();
    await nextTick();
    const duplicados = [...el.querySelectorAll("#processo-form p, #processo-form label, #processo-form legend")].filter(
      (n) => texto(n) === "Medicamentos",
    );
    expect(duplicados).toHaveLength(0);
    // A legenda existe uma vez só.
    expect([...el.querySelectorAll("#processo-form legend")].filter((l) => /medicamentos/i.test(texto(l)))).toHaveLength(1);
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
