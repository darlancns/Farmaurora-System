// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoKanban from "../../app/components/processos/ProcessoKanban.vue";
import ProcessoKanbanCard from "../../app/components/processos/ProcessoKanbanCard.vue";
import { useVisaoProcessos } from "../../app/composables/useVisaoProcessos";
import { deveRecarregar, useRecarregarAoVoltar } from "../../app/composables/useRecarregarAoVoltar";
import {
  CHAVE_VISAO_PROCESSOS,
  DEFAULT_VISAO,
  lerVisaoSalva,
  salvarVisao,
  type ArmazenamentoVisao,
} from "../../app/utils/processoVisao";
import { filtrarPorBusca } from "../../app/utils/processoBusca";
import { filtrarPorCotacao } from "../../app/utils/processoListas";
import { agruparPorColuna } from "../../app/utils/processoKanban";

// Etapa B do Kanban: card, quadro, alternância Kanban | Lista (só para quem edita, só no cliente) e recarga ao
// voltar para a aba. Componentes reais montados no happy-dom.

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [{ nome: "DROGA", dosagem: "10MG" }],
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
  vi.restoreAllMocks();
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("ProcessoKanbanCard", () => {
  function card(p: Processo, onAbrir: (p: Processo) => void = () => {}): HTMLElement {
    return montar(defineComponent({ setup: () => () => h(ProcessoKanbanCard, { processo: p, onAbrir }) }));
  }

  it("o <article> INTEIRO é o controle: role=button, tabindex=0, sem <button> dentro; clique, Enter e Espaço abrem", async () => {
    const abrir = vi.fn();
    const el = card(proc("p1"), abrir);
    const art = el.querySelector<HTMLElement>("article#processo-card-p1")!;
    expect(art.getAttribute("data-testid")).toBe("processo-card-p1");
    expect(art.getAttribute("role")).toBe("button");
    expect(art.getAttribute("tabindex")).toBe("0");
    expect(art.getAttribute("aria-haspopup")).toBe("dialog");
    expect(art.querySelectorAll("button")).toHaveLength(0); // nem o antigo "Mover para…" do card
    expect(art.className).toContain("focus-visible:outline-accent-dark");
    for (const key of ["Enter", " "]) {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      art.dispatchEvent(ev);
      expect(ev.defaultPrevented, "a tecla não rola a página").toBe(true);
    }
    expect(abrir).toHaveBeenCalledTimes(2);
    abrir.mockClear();
    art.click();
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("linhas: Pasta · PO, paciente, medicamento e consultor", () => {
    const el = card(proc("p1", { numeroPo: "PO-26-0471", paciente: "Maria", consultor: "Flávia" }));
    expect(texto(el.querySelector("#card-pasta-po-p1"))).toBe("2026 - 100 · PO-26-0471");
    expect(el.querySelector("#card-pasta-po-p1")!.className).toContain("font-mono");
    expect(texto(el.querySelector("#card-paciente-p1"))).toBe("Maria");
    expect(texto(el.querySelector("#card-medicamento-p1"))).toBe("DROGA 10MG");
    expect(el.querySelector("#card-medicamento-p1")!.className).toContain("line-clamp-2"); // até 2 linhas, não 1
    expect(texto(el.querySelector("#card-consultor-p1"))).toBe("Flávia");
  });

  it("PO ausente: só a Pasta", () => {
    const el = card(proc("p1"));
    expect(texto(el.querySelector("#card-pasta-po-p1"))).toBe("2026 - 100");
  });

  it("etiqueta de pagamento só com valor: Pago (verde), Pendente (âmbar), vazio = nenhuma", () => {
    const pago = card(proc("a", { statusPagamento: "pago" }));
    expect(texto(pago.querySelector("#card-pagamento-a"))).toBe("Pago");
    expect(pago.querySelector("#card-pagamento-a")!.className).toContain("bg-green-100 text-green-800");

    const pendente = card(proc("b", { statusPagamento: "pendente" }));
    expect(texto(pendente.querySelector("#card-pagamento-b"))).toBe("Pendente");
    expect(pendente.querySelector("#card-pagamento-b")!.className).toContain("bg-amber-100 text-amber-800");

    const vazio = card(proc("c"));
    expect(vazio.querySelector("#card-pagamento-c")).toBeNull();
  });

  it("pendências: ícone de alerta (text-danger) com a quantidade; sem pendências, nada", () => {
    const com = card(proc("a", { pendencias: ["x", "y", "z"] }));
    const alerta = com.querySelector("#card-pendencias-a")!;
    expect(alerta.className).toContain("text-danger");
    expect(alerta.querySelector("svg")).not.toBeNull();
    expect(texto(alerta)).toBe("3 pendências");

    const uma = card(proc("b", { pendencias: ["x"] }));
    expect(texto(uma.querySelector("#card-pendencias-b"))).toBe("1 pendência");

    expect(card(proc("c")).querySelector("#card-pendencias-c")).toBeNull();
  });

  it("estilo: rounded-lg, borda hairline, fundo paper-raised, sem sombra, hover com borda accent-dark", () => {
    const art = card(proc("p1")).querySelector("article")!;
    for (const c of ["rounded-lg", "border-hairline", "bg-paper-raised", "hover:border-accent-dark"]) {
      expect(art.className).toContain(c);
    }
    expect(art.className).not.toMatch(/\bshadow/);
  });
});

describe("ProcessoKanban (quadro)", () => {
  const colunas = (el: HTMLElement) => [...el.querySelectorAll("section[id^='kanban-coluna-']")].map((s) => s.id);
  const contador = (el: HTMLElement, id: string) => texto(el.querySelector(`#kanban-contador-${id}`));
  const cards = (el: HTMLElement, id: string) =>
    [...el.querySelectorAll(`#kanban-coluna-${id} article`)].map((a) => a.id.replace("processo-card-", ""));

  function quadro(processos: Processo[]): HTMLElement {
    return montar(defineComponent({ setup: () => () => h(ProcessoKanban, { processos }) }));
  }

  it("5 colunas na ordem do fluxo; cabeçalho em faixa accent-dark igual em todas: ícone + título + (número)", () => {
    const el = quadro([
      proc("a", { status: "entregue", pasta: "2026 - 2" }),
      proc("b", { status: "entregue", pasta: "2026 - 1" }),
      proc("c", { status: "elaboracao_fornecedores" }),
    ]);
    expect(colunas(el)).toEqual([
      "kanban-coluna-na-origem",
      "kanban-coluna-em-transito",
      "kanban-coluna-desembaraco",
      "kanban-coluna-liberado",
      "kanban-coluna-entregue",
    ]);
    expect(texto(el.querySelector("#kanban-titulo-na-origem"))).toBe("Na origem");
    for (const id of ["na-origem", "em-transito", "desembaraco", "liberado", "entregue"]) {
      const cab = el.querySelector("#kanban-cabecalho-" + id)!;
      const cls = cab.className;
      for (const c of ["bg-accent-dark", "text-white", "rounded-lg", "h-10", "px-3", "font-display", "text-[13.5px]", "font-medium", "w-full"]) {
        expect(cls, id + ": " + c).toContain(c);
      }
      expect(cls).not.toMatch(/bg-(gray|blue|purple|green|amber)-100/); // sem cor por status
      expect(cab.querySelector("svg")).not.toBeNull();
    }
    expect(texto(el.querySelector("#kanban-cabecalho-entregue"))).toBe("Entregue (2)");
    expect(texto(el.querySelector("#kanban-cabecalho-em-transito"))).toBe("Em trânsito (0)");
    expect(contador(el, "entregue")).toBe("2");
    expect(contador(el, "na-origem")).toBe("1");
    expect(contador(el, "em-transito")).toBe("0");
    expect(cards(el, "entregue")).toEqual(["b", "a"]); // Pasta crescente: o mais antigo em cima
  });

  it("estado vazio por coluna", () => {
    const el = quadro([proc("a", { status: "liberado" })]);
    expect(texto(el.querySelector("#kanban-vazio-desembaraco"))).toBe("Nenhum processo");
    expect(el.querySelector("#kanban-vazio-liberado")).toBeNull();
  });

  it("filtros e busca vêm ANTES do agrupamento: contadores refletem só o que sobrou", async () => {
    const todos = [
      proc("a", { paciente: "Ana Souza", status: "em_transito", modalEnvio: "Air Cargo" }),
      proc("b", { paciente: "Bruno Lima", status: "em_transito", modalEnvio: "Courier Simples" }),
      proc("c", { paciente: "Ana Prado", status: "entregue" }),
    ];
    const termo = ref("ana");
    const el = montar(
      defineComponent({ setup: () => () => h(ProcessoKanban, { processos: filtrarPorBusca(todos, termo.value) }) }),
    );
    expect(contador(el, "em-transito")).toBe("1");
    expect(contador(el, "entregue")).toBe("1");
    termo.value = "";
    await nextTick();
    expect(contador(el, "em-transito")).toBe("2");

    // Cotações ASD: nunca Entregues nem Courier Simples; Air Cargo sem cotação entra.
    const asd = agruparPorColuna(filtrarPorCotacao(todos, "asd"));
    expect(asd.entregue).toEqual([]);
    expect(asd.em_transito.map((p) => p.id)).toEqual(["a"]);
  });

  it("realce do ?processo=<id> (focoId) só no card certo", () => {
    const el = montar(
      defineComponent({ setup: () => () => h(ProcessoKanban, { processos: [proc("a"), proc("b")], focoId: "b" }) }),
    );
    expect(el.querySelector("#processo-card-b")!.className).toContain("bg-accent-dark/10");
    expect(el.querySelector("#processo-card-a")!.className).not.toContain("bg-accent-dark/10");
  });
});

describe("alternância Kanban | Lista (useVisaoProcessos)", () => {
  function sonda(podeEditar: () => boolean) {
    const estado: { alternancia: boolean[]; kanban: boolean[]; api?: ReturnType<typeof useVisaoProcessos> } = {
      alternancia: [],
      kanban: [],
    };
    montar(
      defineComponent({
        setup() {
          const api = useVisaoProcessos(podeEditar);
          estado.api = api;
          estado.alternancia.push(api.mostrarAlternancia.value); // primeiro render (igual ao SSR)
          estado.kanban.push(api.mostrarKanban.value);
          return () => h("div", { id: "sonda" }, String(api.mostrarAlternancia.value));
        },
      }),
    );
    return estado;
  }

  it("quem NÃO pode editar (consultor, só-leitura) nunca vê a alternância nem o Kanban, mesmo com kanban salvo", async () => {
    localStorage.setItem(CHAVE_VISAO_PROCESSOS, "kanban");
    const s = sonda(() => false);
    await nextTick();
    expect(s.api!.mostrarAlternancia.value).toBe(false);
    expect(s.api!.mostrarKanban.value).toBe(false);
    localStorage.removeItem(CHAVE_VISAO_PROCESSOS);
  });

  it("quem pode editar: nada no primeiro render (= SSR, sempre a Lista); depois de montar, alternância e Kanban (padrão)", async () => {
    localStorage.removeItem(CHAVE_VISAO_PROCESSOS);
    const s = sonda(() => true);
    expect(s.alternancia[0]).toBe(false);
    expect(s.kanban[0]).toBe(false); // primeiro render: Lista, como no SSR
    await nextTick();
    expect(s.api!.mostrarAlternancia.value).toBe(true);
    expect(DEFAULT_VISAO).toBe("kanban");
    expect(s.api!.visao.value).toBe("kanban");
    expect(s.api!.mostrarKanban.value).toBe(true);
  });

  it("escolher Lista fica lembrado no localStorage; a próxima montagem já abre na Lista (a um clique do Kanban)", async () => {
    localStorage.removeItem(CHAVE_VISAO_PROCESSOS);
    const s = sonda(() => true);
    await nextTick();
    s.api!.escolher("lista");
    expect(s.api!.mostrarKanban.value).toBe(false);
    expect(localStorage.getItem(CHAVE_VISAO_PROCESSOS)).toBe("lista");

    const s2 = sonda(() => true);
    await nextTick();
    expect(s2.api!.mostrarKanban.value).toBe(false);
    s2.api!.escolher("kanban");
    expect(s2.api!.mostrarKanban.value).toBe(true);
    expect(localStorage.getItem(CHAVE_VISAO_PROCESSOS)).toBe("kanban");
    localStorage.removeItem(CHAVE_VISAO_PROCESSOS);
  });
});

describe("preferência sem localStorage (funções puras)", () => {
  const quebrado: ArmazenamentoVisao = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("cota");
    },
  };

  it("leitura: sem armazenamento, erro ou valor estranho → padrão", () => {
    expect(lerVisaoSalva(null)).toBe(DEFAULT_VISAO);
    expect(lerVisaoSalva(quebrado)).toBe(DEFAULT_VISAO);
    expect(lerVisaoSalva({ getItem: () => "grade", setItem: () => {} })).toBe(DEFAULT_VISAO);
    expect(lerVisaoSalva({ getItem: () => "kanban", setItem: () => {} })).toBe("kanban");
  });

  it("gravação: erro é engolido", () => {
    expect(() => salvarVisao(quebrado, "kanban")).not.toThrow();
    expect(() => salvarVisao(null, "kanban")).not.toThrow();
  });
});

describe("recarregar ao voltar para a aba", () => {
  it("deveRecarregar: visível, sem bloqueio e passado o intervalo mínimo", () => {
    const base = { visivel: true, bloqueado: false, agora: 61_000, ultimaRecarga: 0, intervaloMinimoMs: 60_000 };
    expect(deveRecarregar(base)).toBe(true);
    expect(deveRecarregar({ ...base, agora: 59_999 })).toBe(false);
    expect(deveRecarregar({ ...base, bloqueado: true })).toBe(false);
    expect(deveRecarregar({ ...base, visivel: false })).toBe(false);
  });

  it("composable: focus recarrega no máximo 1x a cada 60s e nunca com o formulário aberto", async () => {
    let agora = 0;
    const formAberto = ref(false);
    const recarregar = vi.fn(async () => {});
    montar(
      defineComponent({
        setup() {
          useRecarregarAoVoltar({ recarregar, bloqueado: () => formAberto.value, agora: () => agora });
          return () => h("div");
        },
      }),
    );
    window.dispatchEvent(new Event("focus"));
    expect(recarregar).not.toHaveBeenCalled(); // acabou de abrir

    agora = 60_000;
    formAberto.value = true;
    window.dispatchEvent(new Event("focus"));
    expect(recarregar).not.toHaveBeenCalled(); // formulário aberto

    formAberto.value = false;
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 0));
    expect(recarregar).toHaveBeenCalledTimes(1);

    agora = 90_000;
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(recarregar).toHaveBeenCalledTimes(1); // só 30s depois

    agora = 121_000;
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 0));
    expect(recarregar).toHaveBeenCalledTimes(2);
  });
});
