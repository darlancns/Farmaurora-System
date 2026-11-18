// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import { NUMERO_PO_EXEMPLO, NUMERO_PO_LIMITE } from "#shared/utils/numeroPo";
import ProcessoFormMedicamentos from "../../app/components/processos/ProcessoFormMedicamentos.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { BOTAO_FECHAR_HOVER_CLASS, BOTAO_ICONE_CLASS } from "../../app/utils/botaoIcone";
import { ICONES_PROCESSO } from "../../app/utils/processoIcones";
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
  "pf-medicamento-laboratorio-0", // linha Laboratório / Brand, abaixo de Qtd. + Medicamento
  "pf-medicamento-brand-0",
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

  it("linha 1 = Paciente / Pasta / PO; linha 2 = Nº Ordem / Nº do processo; só depois vêm os Medicamentos", async () => {
    const el = abrir();
    await nextTick();
    const linha = (id: string) => el.querySelector(`#${id}`)!.closest("#processo-form > div > div")!;
    const linha1 = linha("pf-paciente");
    expect(linha("pf-pasta")).toBe(linha1);
    expect(linha("pf-numero-po")).toBe(linha1);
    expect(linha1.querySelector("#pf-numero-remessa")).toBeNull(); // o Nº Ordem saiu da linha 1
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

  it("linha 1 em lg+: Paciente flexível, Pasta 7rem e PO 8rem (cada um com 9px de sobra); abaixo de lg, 2 colunas iguais", async () => {
    const el = abrir();
    await nextTick();
    const linha1 = el.querySelector("#pf-paciente")!.closest("#processo-form > div > div")!;
    const classes = (linha1.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("grid-cols-2"); // abaixo de lg: Pasta | PO iguais (o Paciente ocupa as 2)
    expect(classes).toContain("lg:grid-cols-[minmax(0,1fr)_7rem_8rem]");
    expect(classes.filter((c) => c.startsWith("lg:grid-cols-"))).toHaveLength(1);
    // As duas colunas estreitas (lidas do elemento montado): a Pasta (7rem) comporta a máscara dela, de 10 caracteres
    // ("2026 - 234"), e o PO (8rem) comporta a dele, de 12 ("PO26-10-0471"): JetBrains Mono 13,5px = 0,6em por caractere,
    // padding 2×10px, borda 2×1px. Cada um sobra os mesmos ~9px depois do texto (por isso o PO é 1rem mais largo).
    const colunasLg = classes.find((c) => c.startsWith("lg:grid-cols-"))!;
    const [, pasta, po] = /_(\d+(?:\.\d+)?)rem_(\d+(?:\.\d+)?)rem\]$/.exec(colunasLg)!.slice(0, 3).map(Number) as [number, number, number];
    expect(pasta).toBe(7);
    expect(po).toBe(8);
    const necessariaPasta = 10 * 0.6 * 13.5 + 2 * 10 + 2 * 1; // 103px
    const necessariaPo = NUMERO_PO_LIMITE * 0.6 * 13.5 + 2 * 10 + 2 * 1; // 119,2px
    const sobraPasta = pasta * 16 - necessariaPasta; // 9px
    const sobraPo = po * 16 - necessariaPo; // 8,8px
    expect(sobraPasta).toBeGreaterThanOrEqual(8);
    expect(sobraPasta).toBeLessThan(10);
    expect(sobraPo, "o PO CABE (sobra depois do texto)").toBeGreaterThanOrEqual(8);
    expect(sobraPo).toBeLessThan(10);
    expect(Math.abs(sobraPo - sobraPasta), "PO e Pasta com a mesma sobra (±1px)").toBeLessThanOrEqual(1);
    // O tamanho do texto vem do formato do PO (a máscara chega a 12 caracteres).
    expect(NUMERO_PO_EXEMPLO.length).toBe(NUMERO_PO_LIMITE);
    // Nenhum dos dois leva largura própria no campo.
    for (const id of ["pf-pasta", "pf-numero-po"]) {
      const cls = (linha1.querySelector(`#${id}`)!.getAttribute("class") ?? "").split(/\s+/);
      expect(cls.filter((c) => /(^|:)(max-w|w)-/.test(c) && c !== "w-full"), id).toEqual([]);
      expect(cls.filter((c) => /(^|:)px-/.test(c)), `${id}: padding só o de sempre (px-2.5)`).toEqual(["px-2.5"]);
    }
  });

  it("linha 2: Nº Ordem com 5rem e Nº do processo com TODO o resto da linha (sem teto de largura em nenhuma faixa)", async () => {
    const el = abrir();
    await nextTick();
    const linha2 = el.querySelector("#pf-numero-remessa")!.closest("#processo-form > div > div")!;
    const classes = (linha2.getAttribute("class") ?? "").split(/\s+/);
    // Uma única definição de colunas (vale em todas as larguras): 5rem | o resto. Nenhuma variante com teto (minmax(0,Nrem)).
    expect(classes.filter((c) => c.includes("grid-cols-"))).toEqual(["grid-cols-[5rem_minmax(0,1fr)]"]);
    expect(linha2.getAttribute("class")).not.toMatch(/minmax\(0,\d+(\.\d+)?(rem|px)\)/);
    // O Nº do processo é a 2ª coluna: nenhum max-w/w-* no próprio campo nem no contêiner dele.
    const campo = linha2.querySelector("#pf-numero-processo")!;
    for (const n of [campo, campo.parentElement!]) {
      const cls = (n.getAttribute("class") ?? "").split(/\s+/);
      expect(cls.filter((c) => /(^|:)(max-w|w)-/.test(c) && c !== "w-full"), n.tagName).toEqual([]);
    }
  });

  it("o bloco 'Pendências' (fieldset com legenda) vem depois das datas, com o botão de adicionar dentro; o rodapé só tem o Cancelar", async () => {
    const el = abrir();
    await nextTick();
    const rotulo = [...el.querySelectorAll("#processo-form fieldset > legend")].find((l) => texto(l) === "Pendências")!;
    expect(rotulo).toBeTruthy();
    const ultimaData = el.querySelector("#pf-suposta-estimativa")!;
    const cancelar = el.querySelector("#btn-cancel-processo")!;
    expect(ultimaData.compareDocumentPosition(rotulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rotulo.compareDocumentPosition(el.querySelector("#btn-add-pendencia")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector("#btn-add-pendencia")!.compareDocumentPosition(cancelar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O rodapé (último filho do form) não tem mais o botão principal: só o Cancelar (some em lg+).
    const rodape = el.querySelector("#processo-form")!.lastElementChild!;
    expect([...rodape.children].map((c) => c.id)).toEqual(["btn-cancel-processo"]);
    expect(cancelar.getAttribute("type")).toBe("button");
    expect(cancelar.getAttribute("class")).toContain("lg:hidden");
    expect(rodape.getAttribute("class")).toContain("lg:contents");
  });

  it("condicional: 'Qual fornecedor?' logo depois do Fornecedor; 'Qual status?' não existe mais (nem com linha legada 'outro')", async () => {
    const el = abrir({ fornecedor: "Fornecedor Que Não Existe", status: "outro", status_outro: "Aguardando" });
    await nextTick();
    const ids = ["pf-fornecedor", "pf-fornecedor-outro", "pf-status", "pf-status-pagamento", "pf-modal"];
    expect(idsNaOrdemDoDom(el, ids)).toEqual(ids);
    expect(el.querySelector("#pf-status-outro")).toBeNull();
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

  it("blocos com moldura: 5 fieldsets, na ordem, com as legendas certas", async () => {
    const el = abrir();
    await nextTick();
    const legendas = [...el.querySelectorAll("#processo-form fieldset > legend")].map(texto);
    expect(legendas).toEqual(["Medicamentos e local de entrega", "Envio e desembaraço", "Transportadora nacional", "Datas", "Pendências"]);
  });

  it("Pendências: fieldset como os demais, com aria-label por posição nos inputs e nos ✕ (title mantido)", async () => {
    const el = abrir({ pendencias: ["Enviar laudo", "Ligar para a clínica"] });
    await nextTick();
    const fieldset = [...el.querySelectorAll("#processo-form fieldset")].find((f) => texto(f.querySelector(":scope > legend")) === "Pendências")!;
    expect(fieldset).toBeTruthy();
    expect(fieldset.parentElement).toBe(el.querySelector("#processo-form > div")); // filho direto do lg:contents
    const demais = [...el.querySelectorAll("#processo-form fieldset")].find((f) => f !== fieldset)!;
    expect(fieldset.getAttribute("class")).toBe(demais.getAttribute("class")); // FIELDSET_CLASS
    expect(fieldset.querySelector(":scope > legend")!.getAttribute("class")).toBe(demais.querySelector(":scope > legend")!.getAttribute("class"));
    const inputs = [...fieldset.querySelectorAll<HTMLInputElement>("input")];
    expect(inputs.map((i) => i.value)).toEqual(["Enviar laudo", "Ligar para a clínica"]);
    expect(inputs.map((i) => i.getAttribute("aria-label"))).toEqual(["Pendência 1", "Pendência 2"]);
    const remover = [...fieldset.querySelectorAll("button[title='Remover pendência']")];
    expect(remover.map((b) => b.getAttribute("aria-label"))).toEqual(["Remover pendência 1", "Remover pendência 2"]);
    expect(fieldset.querySelector("#btn-add-pendencia")).not.toBeNull();
    // Nenhuma largura fixa no bloco (min-w-11 é só o alvo de toque de 44px do ✕; lg:min-w-min já é do FIELDSET_CLASS).
    const tokens = [fieldset, ...fieldset.querySelectorAll("*")].flatMap((n) => (n.getAttribute("class") ?? "").split(/\s+/));
    expect(tokens.filter((c) => /(^|:)(min-w|max-w)-/.test(c) && !["lg:min-w-min", "min-w-0", "min-w-11", "lg:min-w-auto"].includes(c))).toEqual([]);
  });

  it("Pendências: o botão '+ Pendência' tem o mesmo estilo do '+' dos Medicamentos e largura total abaixo de lg", async () => {
    const el = abrir();
    await nextTick();
    const add = el.querySelector("#btn-add-pendencia")!;
    const cls = (add.getAttribute("class") ?? "").split(/\s+/);
    for (const c of ["min-h-11", "w-full", "rounded-md", "border", "border-hairline", "px-2.5", "py-2", "text-[14px]", "font-semibold", "text-accent-dark", "lg:w-auto", "lg:text-[13px]"]) {
      expect(cls, c).toContain(c);
    }
    const maisMed = el.querySelector("button[title='Adicionar medicamento']")!;
    const base = ["rounded-md", "border", "border-hairline", "px-2.5", "py-2", "text-[14px]", "font-semibold", "text-accent-dark", "min-h-11", "lg:min-h-auto", "lg:text-[13px]"];
    for (const c of base) expect((maisMed.getAttribute("class") ?? "").split(/\s+/), `medicamentos: ${c}`).toContain(c);
    for (const c of base) expect(cls, `pendências: ${c}`).toContain(c);
  });

  it("cada campo está dentro do bloco certo", async () => {
    const el = abrir();
    await nextTick();
    const blocoDe = (id: string) => texto(el.querySelector(`#${id}`)!.closest("fieldset")?.querySelector(":scope > legend") ?? null);
    for (const id of [
      "pf-medicamento-quantidade-0",
      "pf-medicamento-nome-0",
      "pf-medicamento-laboratorio-0",
      "pf-medicamento-brand-0",
      "pf-local-entrega",
    ]) {
      expect(blocoDe(id), id).toBe("Medicamentos e local de entrega");
    }
    for (const id of ["pf-modal", "pf-cia-aerea", "pf-awb", "pf-despachante"]) expect(blocoDe(id), id).toBe("Envio e desembaraço");
    for (const id of ["pf-transp-nome", "pf-transp-cotacao", "pf-transp-valor"]) expect(blocoDe(id), id).toBe("Transportadora nacional");
    for (const id of DATAS) expect(blocoDe(id), id).toBe("Datas");
    // Fora de qualquer bloco: a linha 1, o grupo de selects, Nº do processo e Status/Pagamento.
    for (const id of [
      "pf-paciente", "pf-pasta", "pf-numero-po", "pf-numero-remessa", "pf-empresa", "pf-responsavel", "pf-consultor",
      "pf-fornecedor", "pf-numero-processo", "pf-status", "pf-status-pagamento",
    ]) {
      expect(el.querySelector(`#${id}`)!.closest("fieldset"), id).toBeNull();
    }
  });

  it("bloco 'Envio e desembaraço': grade de 2 colunas; Envio e Despachante em linha inteira abaixo de sm; sem largura forçada", async () => {
    const el = abrir();
    await nextTick();
    const fieldset = el.querySelector("#pf-modal")!.closest("fieldset")!;
    const grade = el.querySelector("#pf-modal")!.closest("fieldset > div")!;
    const classes = (grade.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("grid-cols-2");
    expect(classes.filter((c) => c.includes("grid-cols-"))).toEqual(["grid-cols-2"]); // nenhuma variante sm:/lg:grid-cols-N
    // Células na ordem Envio, Cia., AWB, Despachante (a do DOM é a do Tab).
    const celula = (id: string) => el.querySelector(`#${id}`)!.closest("fieldset > div > div")!;
    expect([...grade.children]).toEqual(["pf-modal", "pf-cia-aerea", "pf-awb", "pf-despachante"].map(celula));
    for (const id of ["pf-modal", "pf-despachante"]) {
      const cls = (celula(id).getAttribute("class") ?? "").split(/\s+/);
      expect(cls, id).toContain("col-span-2");
      expect(cls, id).toContain("sm:col-span-1");
    }
    for (const id of ["pf-cia-aerea", "pf-awb"]) {
      expect((celula(id).getAttribute("class") ?? "").split(/\s+/).filter((c) => c.includes("col-span")), id).toEqual([]);
    }
    // Nada que force largura no bloco: sem w-*/min-w-*/max-w-* nas células nem na grade (as variantes [&_ul]: do
    // SELECT_CAMPO_CLASS são da lista do select, não da célula).
    for (const n of [grade, ...grade.children]) {
      const cls = (n.getAttribute("class") ?? "").split(/\s+/).filter((c) => !c.includes("[&"));
      expect(cls.filter((c) => /(^|:)(min-w|max-w|w)-/.test(c)), n.tagName).toEqual([]);
    }
    expect(fieldset.parentElement!.className).toContain("lg:contents");
  });

  it("Despachante usa a mesma célula de select de sempre (SELECT_CAMPO_CLASS) e continua com o v-model do formulário", async () => {
    const el = abrir({ despachante: "Bruno Lopes" });
    await nextTick();
    const cls = el.querySelector("#pf-despachante")!.closest("fieldset > div > div")!.getAttribute("class") ?? "";
    expect(cls).toContain("[&_button]:min-h-11");
    expect(cls).toContain("lg:[&_ul]:absolute");
    expect(texto(el.querySelector("#pf-despachante"))).toContain("Bruno Lopes");
  });

  it("Courier Simples: o bloco fica com Envio, Cia. e AWB (3 células); o AWB não ganha largura forçada", async () => {
    const el = abrir({ modal_envio: "Courier Simples", companhia_aerea: "DHL" });
    await nextTick();
    const grade = el.querySelector("#pf-modal")!.closest("fieldset > div")!;
    expect(grade.children).toHaveLength(3);
    const awb = el.querySelector("#pf-awb")!.closest("fieldset > div > div")!;
    expect((awb.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.includes("col-span") || /(^|:)w-/.test(c))).toEqual([]);
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
    for (const id of ["pf-numero-processo", "pf-status"]) {
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

describe("Botão principal no cabeçalho do modal", () => {
  function montarComEventos(editingProcesso: Processo | null) {
    const eventos = { submit: [] as unknown[], update: [] as unknown[][], invalid: [] as string[], unchanged: 0 };
    const el = montar(
      defineComponent({
        render: () =>
          h(ProcessoFormModal, {
            editingProcesso,
            onSubmit: (p: unknown) => eventos.submit.push(p),
            onUpdate: (...a: unknown[]) => eventos.update.push(a),
            onInvalid: (m: string) => eventos.invalid.push(m),
            onUnchanged: () => eventos.unchanged++,
          }),
      }),
    );
    return { el, eventos };
  }
  // O clique num botão ligado ao form por form= dispara o submit de forma assíncrona no happy-dom: espera uma macrotarefa.
  const aguardar = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  };
  // Sem o valor da transportadora: o happy-dom acha 1500 inválido num <input type=number step=0.01> e trava o submit por
  // clique (validação nativa; o Chrome aceita). A validação nativa vale igual para o botão antigo dentro do form.
  const processoEditavel = () => montarProcesso(linhaCompleta({ transportadora_nacional_valor: null }) as unknown as FollowUpRow);

  it("fica no cabeçalho, ANTES do X (que é o último), fora do <form>, ligado a ele por form= e type=submit; só existe um", async () => {
    for (const editando of [false, true]) {
      const { el } = montarComEventos(editando ? processoEditavel() : null);
      await nextTick();
      const fechar = el.querySelector("#btn-close-processo-form")!;
      const cabecalho = fechar.parentElement!;
      const salvar = el.querySelector("#btn-save-processo")!;
      expect(el.querySelectorAll("#btn-save-processo")).toHaveLength(1);
      expect(salvar.parentElement, "sem wrapper novo: o cabeçalho é o pai dos dois").toBe(cabecalho);
      expect(cabecalho.lastElementChild).toBe(fechar);
      expect(salvar.compareDocumentPosition(fechar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(el.querySelector("#processo-form")!.contains(salvar)).toBe(false);
      expect(el.querySelector("#processo-form")!.compareDocumentPosition(salvar) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(salvar.getAttribute("type")).toBe("submit");
      expect(salvar.getAttribute("form")).toBe("processo-form");
      expect(cabecalho.querySelector("h2")).not.toBeNull();
    }
  });

  it("nome acessível = o texto completo de sempre; abaixo de sm o texto visível é curto e de sm em diante é o completo", async () => {
    const novo = montarComEventos(null);
    await nextTick();
    const sNovo = novo.el.querySelector("#btn-save-processo")!;
    expect(sNovo.getAttribute("aria-label")).toBe("+ Adicionar processo");
    expect([...sNovo.querySelectorAll("span")].map((s) => [s.getAttribute("class"), texto(s)])).toEqual([
      ["sm:hidden", "Adicionar"],
      ["hidden sm:inline", "+ Adicionar processo"],
    ]);
    const edicao = montarComEventos(processoEditavel());
    await nextTick();
    const sEd = edicao.el.querySelector("#btn-save-processo")!;
    expect(sEd.getAttribute("aria-label")).toBe("Salvar alterações");
    expect([...sEd.querySelectorAll("span")].map((s) => [s.getAttribute("class"), texto(s)])).toEqual([
      ["sm:hidden", "Salvar"],
      ["hidden sm:inline", "Salvar alterações"],
    ]);
  });

  it("estilo: azul escuro/texto branco, compacto (sem w-full), não encolhe nem quebra linha, 44px abaixo de lg, ml-auto, sem order-*", async () => {
    const { el } = montarComEventos(null);
    await nextTick();
    const cls = (el.querySelector("#btn-save-processo")!.getAttribute("class") ?? "").split(/\s+/);
    for (const c of ["bg-accent-dark", "text-white", "min-h-11", "lg:min-h-auto", "shrink-0", "whitespace-nowrap", "ml-auto"]) expect(cls, c).toContain(c);
    expect(cls.filter((c) => /(^|:)w-/.test(c))).toEqual([]);
    expect(cls.filter((c) => /(^|[:!])-?order-/.test(c))).toEqual([]);
    // O título pode ceder espaço (min-w-0) e quebrar linha.
    const bloco = el.querySelector("#btn-close-processo-form")!.parentElement!.firstElementChild!;
    expect(bloco.getAttribute("class")).toContain("min-w-0");
    expect(texto(el.querySelector("#processo-form-modal-overlay p"))).toBe("Follow-up");
  });

  it("Tab: o botão do cabeçalho é o primeiro item, depois o X, depois os campos (Paciente...)", async () => {
    const { el } = montarComEventos(null);
    await nextTick();
    const focaveis = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
    expect(focaveis.slice(0, 3).map((n) => n.id)).toEqual(["btn-save-processo", "btn-close-processo-form", "pf-paciente"]);
    for (const n of el.querySelectorAll<HTMLElement>("[tabindex]")) expect(Number(n.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });

  // Um formulário por vez: o botão do cabeçalho acha o form pelo id (form="processo-form"), então dois modais montados ao
  // mesmo tempo (ids repetidos) confundiriam o clique.
  it("o clique no botão do cabeçalho dispara o MESMO envio do submit do form: Novo vazio avisa o mesmo erro", async () => {
    const porClique = montarComEventos(null);
    await nextTick();
    porClique.el.querySelector<HTMLButtonElement>("#btn-save-processo")!.click();
    await aguardar();
    expect(porClique.eventos.invalid, "o clique passa pela validação de sempre").toEqual(["Informe o nome do paciente."]);
    expect(porClique.eventos.submit).toEqual([]);
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();

    const porSubmit = montarComEventos(null);
    await nextTick();
    porSubmit.el.querySelector("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await aguardar();
    expect(porSubmit.eventos.invalid).toEqual(porClique.eventos.invalid);
  });

  it("Editar sem mudança: o clique avisa 'unchanged' e não envia nada", async () => {
    const sem = montarComEventos(processoEditavel());
    await nextTick();
    sem.el.querySelector<HTMLButtonElement>("#btn-save-processo")!.click();
    await aguardar();
    expect(sem.eventos.unchanged).toBe(1);
    expect(sem.eventos.update).toEqual([]);
  });

  it("Editar com mudança: o clique envia só o que mudou (patch diferencial)", async () => {
    const com = montarComEventos(processoEditavel());
    await nextTick();
    const awb = com.el.querySelector<HTMLInputElement>("#pf-awb")!;
    awb.value = "ZZ999999999BR";
    awb.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    com.el.querySelector<HTMLButtonElement>("#btn-save-processo")!.click();
    await aguardar();
    expect(com.eventos.update).toHaveLength(1);
    const [id, patch] = com.eventos.update[0]! as [string, Record<string, unknown>];
    expect(id).toBe("proc_1");
    expect(patch).toMatchObject({ numeroAwb: "ZZ999999999BR" });
    expect(Object.keys(patch).filter((k) => !["numeroAwb", "versao", "parcial"].includes(k)), "só o que mudou").toEqual([]);
  });

  it("o botão está ligado ao form (button.form === #processo-form), requisito do Enter nos campos (envio implícito)", async () => {
    const { el } = montarComEventos(null);
    await nextTick();
    expect((el.querySelector("#btn-save-processo") as HTMLButtonElement).form).toBe(el.querySelector("#processo-form"));
  });

  it("o X tem o MESMO visual do X da barra lateral (classes compartilhadas e ícone SVG), com title e nome 'Fechar'", async () => {
    const { el } = montarComEventos(null);
    await nextTick();
    const fechar = el.querySelector("#btn-close-processo-form")!;
    const cls = (fechar.getAttribute("class") ?? "").split(/\s+/);
    for (const c of BOTAO_ICONE_CLASS.split(" ")) expect(cls, c).toContain(c);
    for (const c of BOTAO_FECHAR_HOVER_CLASS.split(" ")) expect(cls, c).toContain(c);
    for (const c of ["h-11", "w-11", "lg:h-9", "lg:w-9", "rounded-lg", "border", "border-hairline"]) expect(cls, c).toContain(c);
    expect(cls.filter((c) => /(^|:)-?m[r]-/.test(c)), "sem margem negativa: a borda alinha com a margem do conteúdo").toEqual([]);
    expect(cls.filter((c) => /(^|[:!])-?order-/.test(c))).toEqual([]);
    expect(fechar.getAttribute("title")).toBe("Fechar");
    expect(fechar.getAttribute("aria-label")).toBe("Fechar");
    expect(fechar.getAttribute("type")).toBe("button");
    const svg = fechar.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toContain("h-4");
    expect(svg.getAttribute("stroke-width")).toBe("1.75");
    expect([...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(ICONES_PROCESSO.fechar);
    expect(texto(fechar)).toBe(""); // sem o glifo ✕
    // Continua sendo o último item do cabeçalho, sem wrapper novo.
    expect(fechar.parentElement!.lastElementChild).toBe(fechar);
    expect(fechar.parentElement!.getAttribute("class")).toContain("gap-2");
  });

  it("o botão principal tem a altura do X em lg+ (36px) e 44px abaixo de lg", async () => {
    const { el } = montarComEventos(null);
    await nextTick();
    const cls = (el.querySelector("#btn-save-processo")!.getAttribute("class") ?? "").split(/\s+/);
    for (const c of ["min-h-11", "lg:h-9", "lg:min-h-auto", "lg:py-0"]) expect(cls, c).toContain(c);
  });

  it("Cancelar e o X fecham", async () => {
    let fechou = 0;
    const el = montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: null, onClose: () => fechou++ }) }));
    await nextTick();
    el.querySelector<HTMLButtonElement>("#btn-cancel-processo")!.click();
    el.querySelector<HTMLButtonElement>("#btn-close-processo-form")!.click();
    expect(fechou).toBe(2);
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
