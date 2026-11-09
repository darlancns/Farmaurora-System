// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDeliveredList from "../../app/components/processos/ProcessoDeliveredList.vue";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import ProcessoRow from "../../app/components/processos/ProcessoRow.vue";
import { contarProcessosPorPasta } from "../../app/utils/remessaNaLinha";
import { montarTextoAvisoChegada } from "../../shared/utils/avisoChegada";
import { NUMERO_ORDEM_ERRO } from "../../shared/utils/numeroOrdem";
import { NUMERO_REMESSA_ERRO } from "../../shared/utils/numeroRemessa";

// Troca de rótulos (user-visible), aplicada UMA vez:
//   numero_po       (antes "Nº Ordem" / "Ordem")   → "PO"
//   numero_remessa  (antes "Nº Remessa"/"Remessa") → "Nº Ordem" nos rótulos de campo (formulário, detalhe, aria-labels)
//                                                    e "Ordem N" em texto corrido (linha/card e aviso "Chegou?")
// Nenhum texto visível dos componentes de processo pode ainda dizer "Remessa". Ids/props/funções NÃO mudam.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "a",
    paciente: "Paciente A",
    numeroRemessa: 3,
    numeroPo: "PO-25-2652",
    pasta: "2026 - 100",
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

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Tudo que o usuário lê ou ouve: texto + title/aria-label/placeholder/alt de todos os elementos. */
function visivel(el: HTMLElement): string {
  const atributos = Array.from(el.querySelectorAll("[title], [aria-label], [placeholder], [alt]")).flatMap((n) =>
    ["title", "aria-label", "placeholder", "alt"].map((a) => n.getAttribute(a) ?? ""),
  );
  return [texto(el), ...atributos].join(" | ");
}

const SEM_REMESSA = /remessa/i;

function rotulosDoDetalhe(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll("#processo-detail-a > div.grid > div > div > span:first-child")).map(texto);
}

describe("Formulário (ProcessoFormModal)", () => {
  it("PO no campo numero_po e Nº Ordem no campo numero_remessa; aria-labels do stepper com Nº Ordem", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: null }) }));
    await nextTick();
    expect(texto(el.querySelector("label[for='pf-numero-po']"))).toBe("PO");
    expect(texto(el.querySelector("label[for='pf-numero-remessa']"))).toBe("Nº Ordem");
    expect(el.querySelector("#pf-numero-remessa-menos")!.getAttribute("aria-label")).toBe("Diminuir Nº Ordem");
    expect(el.querySelector("#pf-numero-remessa-mais")!.getAttribute("aria-label")).toBe("Aumentar Nº Ordem");
  });

  it("nenhum texto visível (texto, title, aria-label, placeholder) diz 'Remessa'", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: proc() }) }));
    await nextTick();
    expect(visivel(el)).not.toMatch(SEM_REMESSA);
  });

  it("os ids não mudaram", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoFormModal, { editingProcesso: null }) }));
    await nextTick();
    for (const id of ["pf-numero-po", "pf-numero-remessa", "pf-numero-remessa-menos", "pf-numero-remessa-mais"]) {
      expect(el.querySelector(`#${id}`), id).not.toBeNull();
    }
  });
});

describe("Detalhe (ProcessoDetail)", () => {
  it("coluna 1: Pasta / PO / Nº Ordem (nesta ordem), com os valores certos", () => {
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: proc() }) }));
    expect(rotulosDoDetalhe(el).slice(0, 3)).toEqual(["Pasta", "PO", "Nº Ordem"]);
    const valor = (rotulo: string) => {
      const campo = Array.from(el.querySelectorAll("#processo-detail-a div.flex-col > div")).find(
        (c) => texto(c.querySelector("span")) === rotulo,
      )!;
      return texto(campo.querySelectorAll("span")[1]);
    };
    expect(valor("PO")).toBe("PO-25-2652");
    expect(valor("Nº Ordem")).toBe("3");
  });

  it("nenhum texto visível diz 'Remessa'; PO e Nº Ordem aparecem uma vez cada (uma troca, sem cascata)", () => {
    const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: proc() }) }));
    expect(visivel(el)).not.toMatch(SEM_REMESSA);
    const rotulos = rotulosDoDetalhe(el);
    expect(rotulos).not.toContain("Ordem");
    expect(rotulos.filter((r) => r === "Nº Ordem")).toHaveLength(1);
    expect(rotulos.filter((r) => r === "PO")).toHaveLength(1);
  });
});

describe("Linha / card (ProcessoRow) e Entregues", () => {
  it("desktop e mobile: 'Ordem N' (sem 'Nº' e sem 'Remessa'); o PO aparece como valor", () => {
    const p = proc();
    const el = montar(
      defineComponent({ render: () => h(ProcessoRow, { processo: p, contagemPasta: contarProcessosPorPasta([p]) }) }),
    );
    expect(texto(el.querySelector("#remessa-a"))).toBe("Ordem 3");
    expect(texto(el.querySelector("#mobile-remessa-a"))).toBe("Ordem 3");
    expect(texto(el.querySelector("#mobile-ordem-pasta-a"))).toBe("Ordem 3 · Pasta 2026 - 100 · PO-25-2652");
    expect(texto(el.querySelector("#numero-po-a"))).toBe("PO-25-2652");
    expect(visivel(el)).not.toMatch(SEM_REMESSA);
  });

  it("Entregues: 'Ordem N' e o PO ao lado, sem 'Remessa'", () => {
    const e = proc({ status: "entregue" });
    const el = montar(
      defineComponent({
        render: () => h(ProcessoDeliveredList, { processos: [e], contagemPasta: contarProcessosPorPasta([e]) }),
      }),
    );
    expect(texto(el.querySelector("#entregue-remessa-a"))).toBe("Ordem 3");
    expect(texto(el.querySelector("#processo-delivered-a"))).toContain("FARMAURORA · Ordem 3 · PO-25-2652");
    expect(visivel(el)).not.toMatch(SEM_REMESSA);
  });
});

describe("Aviso 'Chegou?'", () => {
  const base = {
    papel: "operacional" as const,
    paciente: "Fulana de Tal",
    pasta: "2026 - 7",
    numeroRemessa: 4,
    rotuloData: "06/11",
    diasAtraso: 2,
  };

  it("com N visível: 'Ordem [N] de {paciente} · {pasta}'", () => {
    const t = montarTextoAvisoChegada({ ...base, remessaVisivel: true });
    expect(t.titulo).toBe("Chegou?");
    expect(t.linhaProcesso).toBe("Ordem 4 de Fulana de Tal · 2026 - 7");
  });

  it("sem N visível: 'Ordem de {paciente} · {pasta}'", () => {
    expect(montarTextoAvisoChegada({ ...base, remessaVisivel: false }).linhaProcesso).toBe(
      "Ordem de Fulana de Tal · 2026 - 7",
    );
  });

  it("nunca diz 'Remessa'", () => {
    for (const remessaVisivel of [true, false]) {
      const t = montarTextoAvisoChegada({ ...base, remessaVisivel });
      expect(`${t.titulo} ${t.linhaProcesso} ${t.linhaData}`).not.toMatch(SEM_REMESSA);
    }
  });
});

describe("Busca e mensagens de validação", () => {
  const lerFonte = (caminho: string) => readFileSync(resolve(__dirname, "../..", caminho), "utf-8");

  it("placeholder da busca de /processos: 'Buscar por paciente, pasta ou PO'", () => {
    const pagina = lerFonte("app/pages/processos.vue");
    expect(pagina).toContain('placeholder="Buscar por paciente, pasta ou PO"');
    expect(pagina).not.toContain("pasta ou ordem");
  });

  it("mensagens de erro (cliente e servidor usam as mesmas constantes): PO e Nº Ordem", () => {
    expect(NUMERO_ORDEM_ERRO).toBe("PO inválido. Use o formato PO-00-0000 (opcionalmente seguido de / e números).");
    expect(NUMERO_REMESSA_ERRO).toBe("Nº Ordem inválido. Use um número inteiro maior ou igual a 1.");
    expect(`${NUMERO_ORDEM_ERRO} ${NUMERO_REMESSA_ERRO}`).not.toMatch(SEM_REMESSA);
  });
});

describe("Templates dos componentes de processo", () => {
  const COMPONENTES = [
    "ProcessoAtualizacoes",
    "ProcessoDeliveredList",
    "ProcessoDetail",
    "ProcessoFiltrosSheet",
    "ProcessoFormDatas",
    "ProcessoFormMedicamentos",
    "ProcessoFormModal",
    "ProcessoGroupList",
    "ProcessoRemessaStepper",
    "ProcessoRow",
  ];

  it.each(COMPONENTES)("%s: nenhum texto de template diz 'Remessa' (ids, props e nomes de componente ficam)", (nome) => {
    const fonte = readFileSync(resolve(__dirname, `../../app/components/processos/${nome}.vue`), "utf-8");
    const template = fonte.slice(fonte.indexOf("<template"));
    const semComentarios = template.replace(/<!--[\s\S]*?-->/g, "");
    // Identificadores que continuam (ids pf-numero-remessa*, mobile-remessa-, ProcessoRemessaStepper, numeroRemessa…).
    const semIdentificadores = semComentarios
      .replace(/ProcessoRemessaStepper/g, "")
      .replace(/numeroRemessa|mostrarRemessa|remessaVisivelNaLinha/g, "")
      .replace(/[\w-]*remessa[\w-]*/g, "");
    expect(semIdentificadores).not.toMatch(SEM_REMESSA);
  });
});
