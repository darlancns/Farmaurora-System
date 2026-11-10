// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";
import type { Processo } from "#shared/types/processo";

// A PÁGINA REAL de /processos (app/pages/processos.vue) com os componentes reais (AppSelect, ProcessoFiltrosSheet,
// listas, linha) no happy-dom. Só o entorno é simulado: o runtime do Nuxt ("#app"), a lista carregada (useProcessos),
// o usuário (useAuth) e o casco do cabeçalho (GlobalHeader, que só repassa os slots "filters" e "tabs").
// Cargo "consultor": lista plana, então as linhas ficam visíveis sem expandir grupo.

const estado = vi.hoisted(() => ({ processos: null as unknown as Ref<unknown[]> }));

vi.mock("#app", () => ({
  useRoute: () => ({ path: "/processos", query: {} }),
  useRouter: () => ({ replace: () => undefined }),
  useState: <T>(_chave: string, init?: () => T): Ref<T | undefined> => ref(init ? init() : undefined),
}));

vi.mock("../../app/composables/useProcessos", () => ({
  useProcessos: () => ({
    processos: estado.processos,
    error: ref(null),
    fetchProcessos: async () => undefined,
    addProcesso: async () => undefined,
    patchProcesso: async () => undefined,
    removeProcesso: async () => undefined,
  }),
}));

vi.mock("../../app/composables/useAuth", () => ({
  useAuth: () => ({
    role: ref("consultor"),
    consultorNome: ref("Dani"),
    canWrite: () => false,
  }),
}));

vi.mock("../../app/components/GlobalHeader.vue", async () => {
  const { defineComponent: define, h: hh } = await import("vue");
  return {
    default: define({
      setup: (_p, { slots }) => () => hh("div", [slots.filters?.(), slots.tabs?.()]),
    }),
  };
});

import Processos from "../../app/pages/processos.vue";

function proc(id: string, paciente: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente,
    pasta: `2026 - ${id.replace(/\D/g, "") || "1"}`,
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
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

// ASD = a1, a4, a5.
const LOTE: Processo[] = [
  proc("a1", "Maria Alves", { modalEnvio: "Air Cargo" }), // sem cotação                     → ASD
  proc("a2", "Mariana Costa", { modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "COT-9" } }), // com cotação
  proc("a3", "Carlos Dias", { modalEnvio: "Courier Simples" }), // bloco nem aparece           → fora
  proc("a4", "Carla Dias", { empresa: "MAINZFARMA", responsavelOperacional: "Rebeca" }), // sem Envio → ASD
  proc("a5", "Cíntia Dias", {
    modalEnvio: "Courier Formal",
    responsavelOperacional: "Rebeca",
    transportadoraNacional: { nome: "Braspress", cotacao: "   ", valor: 80 },
  }), // cotação só com espaços → ASD
  proc("e1", "Edu Entregue", { status: "entregue", modalEnvio: "Air Cargo" }), // Entregue sem cotação → fora
];

let app: App | null = null;
let el: HTMLElement;

async function montarPagina(): Promise<void> {
  estado.processos = ref(LOTE.map((p) => ({ ...p })));
  el = document.createElement("div");
  document.body.appendChild(el);
  app = createApp(defineComponent({ render: () => h(Processos) }));
  app.mount(el);
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  app?.unmount();
  app = null;
  el.remove();
});

const linhas = (): string[] =>
  Array.from(el.querySelectorAll("[id^='processo-row-']"))
    .map((n) => n.id.replace("processo-row-", ""))
    .sort();
const entregues = (): string[] =>
  Array.from(el.querySelectorAll("[id^='btn-toggle-entregue-']"))
    .map((n) => n.id.replace("btn-toggle-entregue-", ""))
    .sort();
const texto = (seletor: string): string => (el.querySelector(seletor)?.textContent ?? "").replace(/\s+/g, " ").trim();

async function escolher(triggerId: string, rotulo: string): Promise<void> {
  el.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click();
  await nextTick();
  const opcao = Array.from(el.querySelectorAll<HTMLElement>(`#${triggerId}-listbox [role='option']`)).find(
    (o) => o.textContent?.trim() === rotulo,
  );
  expect(opcao, `opção "${rotulo}" em #${triggerId}`).toBeTruthy();
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function buscar(termo: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>("#processo-search")!;
  input.value = termo;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

const opcoesDe = async (triggerId: string): Promise<string[]> => {
  el.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click();
  await nextTick();
  const rotulos = Array.from(el.querySelectorAll(`#${triggerId}-listbox [role='option']`)).map((o) => o.textContent!.trim());
  el.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click(); // fecha
  await nextTick();
  return rotulos;
};

describe("/processos — filtro 'Cotações ASD' (desktop)", () => {
  it("aparece como select, depois dos outros três, com as opções 'Todas as cotações' e 'Cotações ASD'", async () => {
    await montarPagina();
    const ids = Array.from(el.querySelectorAll("#processo-filtros button[id^='filtro-']")).map((b) => b.id);
    expect(ids).toEqual(["filtro-status", "filtro-empresa", "filtro-responsavel", "filtro-cotacao"]);
    expect(texto("#filtro-cotacao")).toBe("Todas as cotações");
    expect(await opcoesDe("filtro-cotacao")).toEqual(["Todas as cotações", "Cotações ASD"]);
  });

  it("sem filtro mostra tudo; com 'Cotações ASD' lista só os processos sem a cotação (fora Entregues e Courier Simples)", async () => {
    await montarPagina();
    expect(linhas()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(texto("#tab-andamento")).toBe("Em andamento (5)");
    expect(texto("#tab-entregues")).toBe("Entregues (1)");

    await escolher("filtro-cotacao", "Cotações ASD");

    expect(texto("#filtro-cotacao")).toBe("Cotações ASD");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);
    expect(texto("#tab-andamento")).toBe("Em andamento (3)");
  });

  it("combina (E) com empresa e com responsável", async () => {
    await montarPagina();
    await escolher("filtro-cotacao", "Cotações ASD");

    await escolher("filtro-empresa", "MAINZFARMA");
    expect(linhas()).toEqual(["a4"]);
    await escolher("filtro-empresa", "Todas as empresas");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);

    await escolher("filtro-responsavel", "Rebeca");
    expect(linhas()).toEqual(["a4", "a5"]);

    await escolher("filtro-status", "Em trânsito");
    expect(linhas()).toEqual(["a4", "a5"]);
    await escolher("filtro-status", "Desembaraço");
    expect(linhas()).toEqual([]);
  });

  it("combina (E) com a busca: a busca só enxerga o que o filtro deixou", async () => {
    await montarPagina();
    await escolher("filtro-cotacao", "Cotações ASD");

    await buscar("dias"); // Carlos Dias (Courier Simples) fica de fora pelo filtro
    expect(linhas()).toEqual(["a4", "a5"]);

    await buscar("maria"); // Maria Alves (ASD) sim; Mariana Costa (com cotação) não
    expect(linhas()).toEqual(["a1"]);

    await buscar("mariana");
    expect(linhas()).toEqual([]);

    await buscar("");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);
  });

  it("voltar a 'Todas as cotações' mostra tudo de novo", async () => {
    await montarPagina();
    await escolher("filtro-cotacao", "Cotações ASD");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);

    await escolher("filtro-cotacao", "Todas as cotações");
    expect(linhas()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(texto("#tab-andamento")).toBe("Em andamento (5)");
    expect(texto("#tab-entregues")).toBe("Entregues (1)");
  });

  it("some na aba Entregues (como o status): lá ninguém entra em 'Cotações ASD'", async () => {
    await montarPagina();
    expect(el.querySelector("#filtro-cotacao")).not.toBeNull();

    el.querySelector<HTMLButtonElement>("#tab-entregues")!.click();
    await nextTick();
    expect(el.querySelector("#filtro-cotacao")).toBeNull();
    expect(el.querySelector("#filtro-status")).toBeNull();
    expect(entregues()).toEqual(["e1"]);

    el.querySelector<HTMLButtonElement>("#tab-andamento")!.click();
    await nextTick();
    expect(el.querySelector("#filtro-cotacao")).not.toBeNull();
  });

  it("o processo Entregue nunca aparece com o filtro ligado, nem com a aba Entregues aberta", async () => {
    await montarPagina();
    await escolher("filtro-cotacao", "Cotações ASD");
    expect(texto("#tab-entregues")).toBe("Entregues (0)");

    el.querySelector<HTMLButtonElement>("#tab-entregues")!.click();
    await nextTick();
    expect(entregues()).toEqual([]);
  });
});

describe("/processos — filtro 'Cotações ASD' (painel de filtros abaixo de lg)", () => {
  async function abrirPainel(): Promise<void> {
    el.querySelector<HTMLButtonElement>("#btn-filtros-processo")!.click();
    await nextTick();
  }

  it("o painel tem o select 'Cotações ASD' por último; escolher filtra na hora e conta na bolinha", async () => {
    await montarPagina();
    await abrirPainel();

    const ids = Array.from(el.querySelectorAll("#processo-filtros-sheet button[id^='sheet-filtro-']")).map((b) => b.id);
    expect(ids).toEqual(["sheet-filtro-status", "sheet-filtro-empresa", "sheet-filtro-responsavel", "sheet-filtro-cotacao"]);
    expect(el.querySelector("#badge-filtros-ativos")).toBeNull();

    await escolher("sheet-filtro-cotacao", "Cotações ASD");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);
    expect(texto("#badge-filtros-ativos")).toBe("1");

    await escolher("sheet-filtro-empresa", "FARMAURORA");
    expect(linhas()).toEqual(["a1", "a5"]);
    expect(texto("#badge-filtros-ativos")).toBe("2");
  });

  it("os selects do painel e os da barra são o MESMO estado", async () => {
    await montarPagina();
    await abrirPainel();
    await escolher("sheet-filtro-cotacao", "Cotações ASD");
    expect(texto("#filtro-cotacao")).toBe("Cotações ASD");
  });

  it("'Limpar' devolve a 'Todas as cotações', tira a bolinha e mostra tudo", async () => {
    await montarPagina();
    await abrirPainel();
    await escolher("sheet-filtro-cotacao", "Cotações ASD");
    expect(linhas()).toEqual(["a1", "a4", "a5"]);

    el.querySelector<HTMLButtonElement>("#btn-filtros-limpar")!.click();
    await nextTick();
    expect(texto("#sheet-filtro-cotacao")).toBe("Todas as cotações");
    expect(el.querySelector("#badge-filtros-ativos")).toBeNull();
    expect(linhas()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });

  it("na aba Entregues o painel não mostra o select de cotações", async () => {
    await montarPagina();
    el.querySelector<HTMLButtonElement>("#tab-entregues")!.click();
    await nextTick();
    await abrirPainel();
    expect(el.querySelector("#sheet-filtro-empresa")).not.toBeNull();
    expect(el.querySelector("#sheet-filtro-cotacao")).toBeNull();
  });
});
