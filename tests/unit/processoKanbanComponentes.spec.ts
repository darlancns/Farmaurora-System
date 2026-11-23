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
    expect(texto(el.querySelector("#card-consultor-p1"))).toBe("Consultor: Flávia");
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
    expect(texto(alerta)).toBe("Pendências: 3");
    expect(alerta.getAttribute("title")).toBe("3 pendências");

    const uma = card(proc("b", { pendencias: ["x"] }));
    expect(uma.querySelector("#card-pendencias-b")!.getAttribute("title")).toBe("1 pendência");

    expect(card(proc("c")).querySelector("#card-pendencias-c")).toBeNull();
  });

  it("bloquinhos: 3 caixas na ordem, células com ícone, rótulo sr-only e title; fornecedor sem o país", () => {
    const el = card(
      proc("p1", {
        responsavelOperacional: "Rebeca",
        consultor: "Dani",
        pendencias: ["a", "b", "c", "d"],
        fornecedor: "Beldimed - Bélgica",
        despachante: "Aduaneira Sul",
        companhiaAerea: "LATAM Cargo",
        numeroAwb: "957-12345678",
      }),
    );
    const linhas = [...el.querySelectorAll("#card-info-p1 > span")].map((l) => l.id);
    expect(linhas).toEqual(["card-info-pessoas-p1", "card-info-origem-p1", "card-info-aereo-p1"]);
    const celulas = (linha: string) => [...el.querySelectorAll(`#card-info-${linha}-p1 > span`)].map((c) => c.id);
    expect(celulas("pessoas")).toEqual(["card-responsavel-p1", "card-consultor-p1", "card-pendencias-p1"]);
    expect(celulas("origem")).toEqual(["card-fornecedor-p1", "card-despachante-p1"]);
    expect(celulas("aereo")).toEqual(["card-aereo-p1"]);

    for (const linha of ["pessoas", "origem", "aereo"]) {
      const caixa = el.querySelector(`#card-info-${linha}-p1`)!;
      for (const c of ["rounded-[8px]", "border", "divide-x", "min-w-0", "bg-[#f6f8f8]"]) expect(caixa.className).toContain(c);
    }
    const rotulos = [...el.querySelectorAll("#card-info-p1 .sr-only")].map((s) => texto(s));
    expect(rotulos).toEqual(["Responsável:", "Consultor:", "Pendências:", "Fornecedor:", "Despachante:", "Cia. aérea · AWB:"]);
    for (const c of el.querySelectorAll("#card-info-p1 [id^='card-'][title]")) {
      expect(c.className).toContain("relative"); // contém o sr-only (absolute)
      expect(c.className).toContain("min-w-0");
      expect(c.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
    expect(el.querySelector("#card-responsavel-p1")!.className).toContain("flex-auto");
    expect(el.querySelector("#card-pendencias-p1")!.className).toContain("flex-none");
    expect(el.querySelector("#card-responsavel-p1")!.className).toContain("shrink-0");
    expect(el.querySelector("#card-consultor-p1")!.className).not.toContain("shrink-0");

    const fornecedor = el.querySelector("#card-fornecedor-p1")!;
    expect(texto(fornecedor)).toBe("Fornecedor: Beldimed");
    expect(fornecedor.getAttribute("title")).toBe("Beldimed");
    const aereo = el.querySelector("#card-aereo-p1")!;
    expect(texto(aereo)).toBe("Cia. aérea · AWB: LATAM Cargo · 957-12345678");
    expect(aereo.getAttribute("title")).toBe("LATAM Cargo · 957-12345678");
    expect(texto(aereo.querySelector(".font-mono"))).toBe("957-12345678");

    // Não interativo: nenhum botão nem parada de Tab nova dentro do card.
    expect(el.querySelectorAll("article button, article [tabindex]")).toHaveLength(0);
  });

  it("bloquinhos: célula vazia e linha vazia não são renderizadas (nada de caixa vazia nem '—')", () => {
    const so = card(proc("a", { responsavelOperacional: " ", fornecedor: "Pharyx - China", numeroAwb: "957-1" }));
    expect([...so.querySelectorAll("#card-info-a > span")].map((l) => l.id)).toEqual([
      "card-info-pessoas-a",
      "card-info-origem-a",
      "card-info-aereo-a",
    ]);
    expect(so.querySelector("#card-responsavel-a")).toBeNull();
    expect(so.querySelector("#card-despachante-a")).toBeNull();
    expect(texto(so.querySelector("#card-fornecedor-a"))).toBe("Fornecedor: Pharyx");
    expect(texto(so.querySelector("#card-aereo-a"))).toBe("Cia. aérea · AWB: 957-1"); // sem " · " solto
    expect(texto(so.querySelector("#card-info-a"))).not.toContain("—");

    const minimo = card(proc("b")); // só consultor
    expect([...minimo.querySelectorAll("#card-info-b > span")].map((l) => l.id)).toEqual(["card-info-pessoas-b"]);
    expect(minimo.querySelector("#card-info-origem-b")).toBeNull();
    expect(minimo.querySelector("#card-info-aereo-b")).toBeNull();

    const nada = card(proc("c", { consultor: "" as Processo["consultor"] }));
    expect(nada.querySelector("#card-info-c")).toBeNull();
  });

  it("previsão de entrega: com Cia + AWB, a data fica à direita, separada por divisória, sem ícone e sem encolher", () => {
    const el = card(proc("p1", { companhiaAerea: "LATAM Cargo", numeroAwb: "957-12345678", datas: { previsaoEntrega: "25/11/2026" } }));
    const linha = el.querySelector("#card-info-aereo-p1")!;
    expect([...linha.children].map((c) => c.id)).toEqual(["card-aereo-p1", "card-previsao-p1"]);
    expect(linha.className).toContain("divide-x"); // a divisória é a mesma dos outros bloquinhos
    const data = el.querySelector("#card-previsao-p1")!;
    expect(texto(data)).toBe("Previsão de entrega: 25/11");
    expect(data.getAttribute("title")).toBe("Previsão de entrega: 25/11/2026");
    for (const c of ["flex-none", "relative"]) expect(data.className).toContain(c);
    expect(data.className).not.toContain("flex-auto");
    expect(data.querySelector("svg")).toBeNull();
    const visivel = data.querySelector("span.flex")!;
    for (const c of ["whitespace-nowrap", "tabular-nums"]) expect(visivel.className).toContain(c);
    // Sempre 5 caracteres: sem limite de largura e sem reticências.
    expect(visivel.className).not.toContain("max-w-");
    expect(data.querySelector(".truncate")).toBeNull();
    expect(texto(visivel)).toBe("25/11");
    // Quem corta é a Cia · AWB: continua flex-auto + min-w-0 + truncate, com title.
    const aereo = el.querySelector("#card-aereo-p1")!;
    expect(aereo.className).toContain("flex-auto");
    expect(aereo.className).toContain("min-w-0");
    expect(aereo.querySelector(".truncate")).not.toBeNull();
    expect(aereo.getAttribute("title")).toBe("LATAM Cargo · 957-12345678");
    // Continua uma só caixa de bloquinhos aérea (não cria linha nova).
    expect([...el.querySelectorAll("#card-info-p1 > span")].map((l) => l.id)).toEqual(["card-info-pessoas-p1", "card-info-aereo-p1"]);
  });

  it("previsão de entrega: sem previsão o card é idêntico ao de hoje (sem divisória nem célula de data)", () => {
    const base = { companhiaAerea: "LATAM Cargo", numeroAwb: "957-12345678" };
    const sem = card(proc("p1", { ...base, datas: {} }));
    const espacos = card(proc("p2", { ...base, datas: { previsaoEntrega: "   " } }));
    for (const [el, id] of [[sem, "p1"], [espacos, "p2"]] as const) {
      expect(el.querySelector(`#card-previsao-${id}`)).toBeNull();
      expect([...el.querySelector(`#card-info-aereo-${id}`)!.children].map((c) => c.id)).toEqual([`card-aereo-${id}`]);
    }
    // Mesmo HTML do bloquinho aéreo (tirando o id) que o de um processo sem o campo `datas.previsaoEntrega`.
    const html = (e: HTMLElement, id: string) => e.querySelector(`#card-info-aereo-${id}`)!.outerHTML.replaceAll(id, "X");
    expect(html(sem, "p1")).toBe(html(espacos, "p2"));
  });

  it("previsão de entrega: sem Cia e sem AWB, um bloquinho só com a data, SEM ícone", () => {
    const el = card(proc("p1", { datas: { previsaoEntrega: "25/11" } }));
    const linha = el.querySelector("#card-info-aereo-p1")!;
    expect([...linha.children].map((c) => c.id)).toEqual(["card-previsao-p1"]);
    expect(el.querySelector("#card-aereo-p1")).toBeNull();
    const data = el.querySelector("#card-previsao-p1")!;
    expect(texto(data)).toBe("Previsão de entrega: 25/11");
    expect(data.querySelector("svg")).toBeNull();
  });

  it("previsão de entrega: texto anotado mostra só a data (DD/MM) e o title tem o texto completo", () => {
    for (const [anotado, curto] of [["20/11 (aguardando voo)", "20/11"], ["chega 20/11/2026", "20/11"], ["5/1", "05/01"]] as const) {
      const el = card(proc("p1", { companhiaAerea: "LATAM Cargo", datas: { previsaoEntrega: anotado } }));
      const data = el.querySelector("#card-previsao-p1")!;
      expect(data.getAttribute("title")).toBe(`Previsão de entrega: ${anotado}`);
      expect(texto(data)).toBe(`Previsão de entrega: ${curto}`);
      expect(data.querySelector(".truncate")).toBeNull();
    }
  });

  it("previsão de entrega: texto sem data reconhecível não cria célula nem divisória (card idêntico ao de hoje)", () => {
    const base = { companhiaAerea: "LATAM Cargo", numeroAwb: "957-12345678" };
    const sem = card(proc("p1", { ...base }));
    const html = (e: HTMLElement, id: string) => e.querySelector(`#card-info-aereo-${id}`)!.outerHTML.replaceAll(id, "X");
    for (const [i, previsaoEntrega] of ["aguardando confirmação", "32/13"].entries()) {
      const id = `t${i}`;
      const el = card(proc(id, { ...base, datas: { previsaoEntrega } }));
      expect(el.querySelector(`#card-previsao-${id}`), previsaoEntrega).toBeNull();
      expect(html(el, id), previsaoEntrega).toBe(html(sem, "p1"));
    }
    // Sem Cia/AWB e sem data reconhecível: nem o bloquinho aéreo existe.
    expect(card(proc("v", { datas: { previsaoEntrega: "aguardando confirmação" } })).querySelector("#card-info-aereo-v")).toBeNull();
  });

  it("previsão de entrega: vale em todas as colunas, inclusive Entregue", () => {
    for (const status of ["em_transito", "entregue"] as const) {
      const el = card(proc(`s-${status}`, { status, companhiaAerea: "LATAM Cargo", datas: { previsaoEntrega: "25/11/2026" } }));
      expect(texto(el.querySelector(`#card-previsao-s-${status}`))).toBe("Previsão de entrega: 25/11");
    }
  });

  it("hierarquia: nome 16px/600 é o maior (≥ 3px acima de qualquer outro) e o peso dele é ≥ o de qualquer texto; bloquinhos ≤ 12px", () => {
    const el = card(
      proc("p1", { statusPagamento: "pendente", responsavelOperacional: "Bruno", pendencias: ["x"], fornecedor: "Poros - Turquia", numeroAwb: "957-1" }),
    );
    const paciente = el.querySelector("#card-paciente-p1")!;
    for (const c of ["text-[16px]", "font-semibold", "leading-[1.25]", "tracking-[-0.01em]", "line-clamp-2", "text-ink"]) {
      expect(paciente.className).toContain(c);
    }
    const med = el.querySelector("#card-medicamento-p1")!.className;
    for (const c of ["text-[12px]", "font-medium", "uppercase", "tracking-[0.02em]", "line-clamp-2"]) expect(med).toContain(c);

    const PESOS: Record<string, number> = { "font-normal": 400, "font-medium": 500, "font-semibold": 600, "font-bold": 700 };
    const tamanho = (n: Element) => [...n.className.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
    const peso = (n: Element) => n.className.split(/\s+/).map((c) => PESOS[c] ?? 0);
    const outros = [...el.querySelectorAll("article *")].filter((n) => n !== paciente && typeof n.className === "string");
    const nomePx = tamanho(paciente)[0]!;
    const nomePeso = Math.max(...peso(paciente));
    expect(nomePx).toBe(16);
    expect(nomePeso).toBe(600);
    expect(nomePx - Math.max(...outros.flatMap(tamanho))).toBeGreaterThanOrEqual(3);
    expect(Math.max(...outros.flatMap(peso))).toBeLessThanOrEqual(nomePeso);
    const noBloco = [...el.querySelectorAll("#card-info-p1 *")].filter((n) => typeof n.className === "string").flatMap(tamanho);
    expect(noBloco.length).toBeGreaterThan(0);
    expect(Math.max(...noBloco)).toBeLessThanOrEqual(12);
    for (const n of el.querySelectorAll("#card-info-p1 svg")) expect(n.getAttribute("class")).toContain("h-3.5");
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

  it("5 colunas na ordem do fluxo; cabeçalho em faixa accent-dark igual em todas: ícone + título à esquerda, (N) à direita", () => {
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
      for (const c of ["bg-accent-dark", "text-white", "rounded-lg", "h-10", "px-3", "font-display", "text-[13.5px]", "font-medium", "w-full", "justify-between"]) {
        expect(cls, id + ": " + c).toContain(c);
      }
      expect(cls).not.toMatch(/bg-(gray|blue|purple|green|amber)-100/); // sem cor por status
      expect(cab.querySelector("svg")).not.toBeNull();
    }
    // Dois blocos na faixa: à esquerda [ícone] Título; à direita (N), com algarismos tabulares.
    const cabEntregue = el.querySelector("#kanban-cabecalho-entregue")!;
    const [esquerda, direita] = [...cabEntregue.children];
    expect(esquerda!.querySelector("svg")).not.toBeNull();
    expect(texto(esquerda!)).toBe("Entregue");
    expect(texto(direita!)).toBe("(2)");
    expect(direita!.className).toContain("tabular-nums");
    expect(cabEntregue.children).toHaveLength(2);
    // Nome legível da coluna para leitor de tela.
    expect(el.querySelector("#kanban-coluna-entregue")!.getAttribute("aria-label")).toBe("Entregue, 2 processos");
    expect(el.querySelector("#kanban-coluna-na-origem")!.getAttribute("aria-label")).toBe("Na origem, 1 processo");
    expect(el.querySelector("#kanban-coluna-em-transito")!.getAttribute("aria-label")).toBe("Em trânsito, 0 processos");
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

  it("ordem dos cards no DOM: pela entrada na coluna (mais antigo em cima; Entregue, mais novo em cima); mover manda para o fim/topo", async () => {
    const t = (dia: number, hora = 12) => `2026-11-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:00:00.000Z`;
    const lista = ref<Processo[]>([
      proc("t3", { status: "em_transito", pasta: "2026 - 1", statusDesde: t(3) }),
      proc("t1", { status: "em_transito", pasta: "2026 - 9", statusDesde: t(1) }),
      proc("t2", { status: "em_transito", pasta: "2026 - 5", statusDesde: t(2) }),
      proc("sem", { status: "em_transito", pasta: "", statusDesde: t(2) }),
      proc("e1", { status: "entregue", statusDesde: t(1) }),
      proc("e3", { status: "entregue", statusDesde: t(3) }),
      proc("d1", { status: "desembaraco", statusDesde: t(1) }),
    ]);
    const el = montar(defineComponent({ setup: () => () => h(ProcessoKanban, { processos: lista.value }) }));
    const ordem = (coluna: string) =>
      [...el.querySelectorAll<HTMLElement>(`#kanban-coluna-${coluna} article[id^='processo-card-']`)].map((a) =>
        a.id.replace("processo-card-", ""),
      );
    // Empate t2 x sem (mesmo instante): Pasta crescente, sem Pasta no fim.
    expect(ordem("em-transito")).toEqual(["t1", "t2", "sem", "t3"]);
    expect(ordem("entregue")).toEqual(["e3", "e1"]);

    // Mover "t1" (o do topo) para Desembaraço e "t3" para Entregue: a resposta do servidor traz status e statusDesde novos.
    const agora = "2026-11-18T15:30:00.000Z";
    lista.value = lista.value.map((p) =>
      p.id === "t1" ? { ...p, status: "desembaraco", statusDesde: agora } : p.id === "t3" ? { ...p, status: "entregue", statusDesde: agora } : p,
    );
    await nextTick();
    expect(ordem("desembaraco")).toEqual(["d1", "t1"]); // no FIM da coluna nova
    expect(ordem("entregue")).toEqual(["t3", "e3", "e1"]); // no TOPO de Entregue
    expect(ordem("em-transito")).toEqual(["t2", "sem"]);
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
