// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDeliveredList from "../../app/components/processos/ProcessoDeliveredList.vue";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import ProcessoGroupList from "../../app/components/processos/ProcessoGroupList.vue";
import ProcessoRow from "../../app/components/processos/ProcessoRow.vue";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { contarProcessosPorPasta } from "../../app/utils/remessaNaLinha";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// "Remessa N" na linha (Andamento desktop/mobile e Entregues), "Nº Remessa" sempre no detalhe e o campo do
// formulário (id pf-numero-remessa). Componentes reais no happy-dom.

function proc(id: string, pasta: string, numeroRemessa: number, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
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

describe("ProcessoRow — Em andamento", () => {
  function linha(p: Processo, todos: Processo[]) {
    return montar(
      defineComponent({ render: () => h(ProcessoRow, { processo: p, contagemPasta: contarProcessosPorPasta(todos) }) }),
    );
  }

  it("N > 1: mostra 'Remessa N' no desktop e no mobile", () => {
    const p = proc("a", "2026 - 100", 2);
    const el = linha(p, [p]);
    expect(texto(el.querySelector("#remessa-a"))).toBe("Remessa 2");
    expect(texto(el.querySelector("#mobile-ordem-pasta-a"))).toBe("Remessa 2 · Pasta 2026 - 100");
  });

  it("N = 1 com pasta única: nada de 'Remessa' em nenhum dos dois", () => {
    const p = proc("a", "2026 - 100", 1);
    const el = linha(p, [p]);
    expect(el.querySelector("#remessa-a")).toBeNull();
    expect(el.querySelector("#mobile-remessa-a")).toBeNull();
    expect(texto(el.querySelector("#mobile-ordem-pasta-a"))).toBe("Pasta 2026 - 100");
    expect(el.textContent).not.toContain("Remessa");
  });

  it("N = 1 com pasta repetida (nos outros processos carregados): mostra 'Remessa 1'", () => {
    const a = proc("a", "2026 - 409", 1);
    const b = proc("b", "2026 - 409", 2);
    const el = linha(a, [a, b]);
    expect(texto(el.querySelector("#remessa-a"))).toBe("Remessa 1");
    expect(texto(el.querySelector("#mobile-ordem-pasta-a"))).toBe("Remessa 1 · Pasta 2026 - 409");
  });

  it("sem contagem (mapa vazio, o padrão): só aparece com N > 1", () => {
    const el = montar(defineComponent({ render: () => h(ProcessoRow, { processo: proc("a", "2026 - 1", 1) }) }));
    expect(el.querySelector("#remessa-a")).toBeNull();
  });
});

describe("ProcessoGroupList — repassa a contagem às linhas", () => {
  it("a contagem vem de FORA (todos os processos), não da lista exibida", () => {
    const a = proc("a", "2026 - 409", 1);
    const b = proc("b", "2026 - 409", 2, { consultor: "Dani" });
    const exibidos = [a]; // a busca mostra só o 'a'
    const el = montar(
      defineComponent({
        render: () =>
          h(ProcessoGroupList, { processos: exibidos, flat: true, contagemPasta: contarProcessosPorPasta([a, b]) }),
      }),
    );
    expect(texto(el.querySelector("#remessa-a"))).toBe("Remessa 1");

    const semContagemDeFora = montar(
      defineComponent({ render: () => h(ProcessoGroupList, { processos: exibidos, flat: true }) }),
    );
    expect(semContagemDeFora.querySelector("#remessa-a")).toBeNull();
  });
});

describe("ProcessoDeliveredList — Entregues", () => {
  function lista(entregues: Processo[], todos: Processo[]) {
    return montar(
      defineComponent({
        render: () => h(ProcessoDeliveredList, { processos: entregues, contagemPasta: contarProcessosPorPasta(todos) }),
      }),
    );
  }

  it("N > 1 mostra 'Remessa N'", () => {
    const e = proc("e", "2026 - 5", 3, { status: "entregue" });
    expect(texto(lista([e], [e]).querySelector("#entregue-remessa-e"))).toBe("Remessa 3");
  });

  it("N = 1 com pasta única não mostra", () => {
    const e = proc("e", "2026 - 5", 1, { status: "entregue" });
    expect(lista([e], [e]).querySelector("#entregue-remessa-e")).toBeNull();
  });

  it("N = 1 com a pasta repetida em OUTRA aba (Andamento): mostra", () => {
    const e = proc("e", "2026 - 409", 1, { status: "entregue" });
    const emAndamento = proc("a", "2026 - 409", 2);
    expect(texto(lista([e], [e, emAndamento]).querySelector("#entregue-remessa-e"))).toBe("Remessa 1");
  });

  it("a linha de Entregues continua mostrando a empresa e o Nº Ordem (PO) ao lado da remessa", () => {
    const e = proc("e", "2026 - 409", 2, { status: "entregue", numeroPo: "PO-25-2652" });
    const el = lista([e], [e]);
    expect(texto(el.querySelector("#processo-delivered-e"))).toContain("FARMAURORA · Remessa 2 · PO-25-2652");
    expect(texto(el.querySelector("#entregue-numero-po-e"))).toBe("PO-25-2652");
  });
});

describe("ProcessoDetail — Nº Remessa sempre aparece", () => {
  it("mostra o rótulo e o valor, mesmo com N = 1 e pasta única", () => {
    const p = proc("a", "2026 - 100", 1);
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p }) }));
    const celula = Array.from(el.querySelectorAll("#processo-detail-a div.flex-col")).find(
      (c) => texto(c.querySelector("span")) === "Nº Remessa",
    )!;
    expect(celula).toBeTruthy();
    expect(texto(celula.querySelectorAll("span")[1] ?? null)).toBe("1");
  });

  it("mostra N quando maior que 1", () => {
    const p = proc("a", "2026 - 100", 12);
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p }) }));
    expect(el.textContent).toContain("Nº Remessa");
    const celula = Array.from(el.querySelectorAll("#processo-detail-a div.flex-col")).find(
      (c) => texto(c.querySelector("span")) === "Nº Remessa",
    )!;
    expect(texto(celula.querySelectorAll("span")[1] ?? null)).toBe("12");
  });

  it("fica na coluna 1, logo depois do Nº Ordem (a ordem completa das colunas está em processoDetalheColunas.spec.ts)", () => {
    const p = proc("a", "2026 - 100", 1);
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p }) }));
    const coluna1 = el.querySelector("#processo-detail-a > div.grid > div")!;
    expect(Array.from(coluna1.querySelectorAll(":scope > div > span:first-child")).map((c) => texto(c))).toEqual([
      "Pasta",
      "Nº Ordem",
      "Nº Remessa",
    ]);
  });
});

describe("Formulário — campo Nº Remessa (pf-numero-remessa)", () => {
  function abrirModal(editando: Processo | null) {
    return montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: editando }) }));
  }

  function digitar(input: HTMLInputElement, valor: string, cursor = valor.length) {
    input.value = valor;
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("novo processo começa em 1; é um input de texto numérico (sem setas), sem o antigo pf-ordem", async () => {
    const el = abrirModal(null);
    await nextTick();
    const campo = el.querySelector<HTMLInputElement>("#pf-numero-remessa")!;
    expect(campo).toBeTruthy();
    expect(campo.value).toBe("1");
    expect(campo.type).toBe("text");
    expect(campo.getAttribute("inputmode")).toBe("numeric");
    expect(campo.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(texto(el.querySelector("label[for='pf-numero-remessa']"))).toBe("Nº Remessa");
    expect(el.querySelector("#pf-ordem")).toBeNull();
  });

  it("tem as setas ▲ e ▼ (ids e aria-labels combinados); no modal, ▲ e ▼ mudam o campo e ▼ fica desabilitado em 1", async () => {
    const el = abrirModal(null);
    await nextTick();
    const menos = el.querySelector<HTMLButtonElement>("#pf-numero-remessa-menos")!;
    const mais = el.querySelector<HTMLButtonElement>("#pf-numero-remessa-mais")!;
    const campo = el.querySelector<HTMLInputElement>("#pf-numero-remessa")!;
    expect(menos.getAttribute("aria-label")).toBe("Diminuir Nº Remessa");
    expect(mais.getAttribute("aria-label")).toBe("Aumentar Nº Remessa");
    expect(menos.disabled).toBe(true);

    mais.click();
    await nextTick();
    expect(campo.value).toBe("2");
    expect(menos.disabled).toBe(false);
    menos.click();
    await nextTick();
    expect(campo.value).toBe("1");
    expect(menos.disabled).toBe(true);
  });

  it("aceita só dígitos: 'e', '+', '-', '.', letras e espaços são removidos; sem zeros à esquerda", async () => {
    const el = abrirModal(null);
    await nextTick();
    const campo = el.querySelector<HTMLInputElement>("#pf-numero-remessa")!;

    digitar(campo, "1e3");
    expect(campo.value).toBe("13");
    digitar(campo, "-5");
    expect(campo.value).toBe("5");
    digitar(campo, "+7");
    expect(campo.value).toBe("7");
    digitar(campo, "2.5");
    expect(campo.value).toBe("25");
    digitar(campo, "abc");
    expect(campo.value).toBe("");
    digitar(campo, "007");
    expect(campo.value).toBe("7");
    digitar(campo, "0");
    expect(campo.value).toBe("");
  });

  it("sem máximo prático: aceita 2147483647 (10 dígitos)", async () => {
    const el = abrirModal(null);
    await nextTick();
    const campo = el.querySelector<HTMLInputElement>("#pf-numero-remessa")!;
    digitar(campo, "2147483647");
    expect(campo.value).toBe("2147483647");
  });

  it("edição: carrega o Nº Remessa do processo", async () => {
    const processo = montarProcesso(linhaCompleta({ numero_remessa: 12 }) as unknown as FollowUpRow);
    const el = abrirModal(processo);
    await nextTick();
    expect(el.querySelector<HTMLInputElement>("#pf-numero-remessa")!.value).toBe("12");
  });

  it("composable: campo esvaziado vira 1 no payload e processo novo começa em '1'", () => {
    const novo = useProcessoForm(() => null);
    expect(novo.form.numeroRemessa).toBe("1");

    novo.form.paciente = "Fulano";
    novo.form.pasta = "2026 - 1";
    novo.form.consultor = "Dani";
    novo.form.numeroRemessa = "";
    const r = novo.validar();
    if (!r.valido) throw new Error(r.erro);
    expect(r.payload.numeroRemessa).toBe(1);

    novo.form.numeroRemessa = "9";
    const r2 = novo.validar();
    if (!r2.valido) throw new Error(r2.erro);
    expect(r2.payload.numeroRemessa).toBe(9);
  });

  it("composable: acima de 2147483647 o formulário recusa com a mensagem do Nº Remessa", () => {
    const novo = useProcessoForm(() => null);
    novo.form.paciente = "Fulano";
    novo.form.pasta = "2026 - 1";
    novo.form.consultor = "Dani";
    novo.form.numeroRemessa = "2147483648";
    expect(novo.validar()).toEqual({
      valido: false,
      erro: "Nº Remessa inválido. Use um número inteiro maior ou igual a 1.",
    });
  });
});
