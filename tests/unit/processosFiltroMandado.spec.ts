// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";
import type { Processo } from "#shared/types/processo";

// A PÁGINA REAL de /processos (app/pages/processos.vue) com os componentes reais (AppSelect, ProcessoFiltrosSheet,
// listas, linha) no happy-dom. Só o entorno é simulado: o runtime do Nuxt ("#app"), a lista carregada (useProcessos),
// o usuário (useAuth) e o casco do cabeçalho (GlobalHeader, que só repassa os slots "filters" e "tabs").
// Filtro "Mandado de Segurança" (só processos com "MS Anexado em"). Arranjo copiado de processosFiltroCotacaoAsd.spec.ts.
// Cargo "consultor" por padrão (lista plana, linhas visíveis sem expandir grupo); o Kanban usa um cargo que edita.

const estado = vi.hoisted(() => ({
  processos: null as unknown as Ref<unknown[]>,
  role: "consultor" as string,
  consultorNome: "Dani" as string | null,
  podeEscrever: false,
}));

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
    role: ref(estado.role),
    consultorNome: ref(estado.consultorNome),
    canWrite: () => estado.podeEscrever,
    user: ref({ role: estado.role, nome: "Bruno" }),
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
import { filtrarPorMandado, haProcessoComMs } from "../../app/utils/processoListas";

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

// MS anexado em m1 (em andamento) e e1 (Entregue); s1 sem MS; f1 é de OUTRA consultora (Flávia), com MS.
const LOTE: Processo[] = [
  proc("m1", "Maria Alves", { datas: { msAnexadoEm: "2026-11-10" } }),
  proc("s1", "Sara Lima", { datas: { msAnexadoEm: "   " } }), // só espaços = sem MS
  proc("s2", "Sílvia Rocha"),
  proc("e1", "Edu Entregue", { status: "entregue", datas: { msAnexadoEm: "2026-10-01" } }),
  proc("e2", "Eva Entregue", { status: "entregue" }),
];

let app: App | null = null;
let el: HTMLElement | undefined;

async function montarPagina(lote: Processo[] = LOTE): Promise<void> {
  estado.processos = ref(lote.map((p) => ({ ...p })));
  const raiz = document.createElement("div");
  el = raiz;
  document.body.appendChild(raiz);
  app = createApp(defineComponent({ render: () => h(Processos) }));
  app.mount(raiz);
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  document.body.innerHTML = "";
  estado.role = "consultor";
  estado.consultorNome = "Dani";
  estado.podeEscrever = false;
  try {
    localStorage.clear();
  } catch {}
});

afterEach(() => {
  app?.unmount();
  app = null;
  el?.remove();
  el = undefined;
});

const linhas = (): string[] =>
  Array.from(el!.querySelectorAll("[id^='processo-row-']"))
    .map((n) => n.id.replace("processo-row-", ""))
    .sort();
const entregues = (): string[] =>
  Array.from(el!.querySelectorAll("[id^='btn-toggle-entregue-']"))
    .map((n) => n.id.replace("btn-toggle-entregue-", ""))
    .sort();
const texto = (seletor: string): string => (el!.querySelector(seletor)?.textContent ?? "").replace(/\s+/g, " ").trim();

async function escolher(triggerId: string, rotulo: string): Promise<void> {
  el!.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click();
  await nextTick();
  const opcao = Array.from(el!.querySelectorAll<HTMLElement>(`#${triggerId}-listbox [role='option']`)).find(
    (o) => o.textContent?.trim() === rotulo,
  );
  expect(opcao, `opção "${rotulo}" em #${triggerId}`).toBeTruthy();
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function buscar(termo: string): Promise<void> {
  const input = el!.querySelector<HTMLInputElement>("#processo-search")!;
  input.value = termo;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

const opcoesDe = async (triggerId: string): Promise<string[]> => {
  el!.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click();
  await nextTick();
  const rotulos = Array.from(el!.querySelectorAll(`#${triggerId}-listbox [role='option']`)).map((o) => o.textContent!.trim());
  el!.querySelector<HTMLButtonElement>(`#${triggerId}`)!.click(); // fecha
  await nextTick();
  return rotulos;
};

describe("funções puras (processoListas.ts)", () => {
  it("filtrarPorMandado: '' = todos; 'com_ms' = só com MS (vazio/só espaços não conta)", () => {
    expect(filtrarPorMandado(LOTE, "").map((p) => p.id)).toEqual(["m1", "s1", "s2", "e1", "e2"]);
    expect(filtrarPorMandado(LOTE, "com_ms").map((p) => p.id)).toEqual(["m1", "e1"]);
  });

  it("haProcessoComMs", () => {
    expect(haProcessoComMs(LOTE)).toBe(true);
    expect(haProcessoComMs([proc("x", "X"), proc("y", "Y", { datas: { msAnexadoEm: "" } })])).toBe(false);
    expect(haProcessoComMs([])).toBe(false);
  });
});

describe("página /processos — filtro 'Mandado de Segurança'", () => {
  it("sem nenhum processo com MS, o controle não existe (barra e painel)", async () => {
    await montarPagina(LOTE.filter((p) => p.id.startsWith("s") || p.id === "e2"));
    expect(el!.querySelector("#filtro-mandado")).toBeNull();
    el!.querySelector<HTMLButtonElement>("#btn-filtros-processo")!.click();
    await nextTick();
    expect(el!.querySelector("#sheet-filtro-mandado")).toBeNull();
  });

  it("com processo com MS: aparece no padrão dos outros (nome dentro da caixa, sem rótulo solto) e com aria-label", async () => {
    await montarPagina();
    expect(texto("#filtro-mandado")).toBe("Todos os mandados"); // fechado, como "Todas as cotações"
    expect(el!.querySelector("label[for='filtro-mandado']")).toBeNull();
    expect(el!.querySelector("#filtro-mandado")!.getAttribute("aria-label")).toBe("Mandado de Segurança");
    // mesmas classes do select de Cotações (mesmo componente, nada de estilo novo)
    expect(el!.querySelector("#filtro-mandado")!.className).toBe(el!.querySelector("#filtro-cotacao")!.className);
    expect(await opcoesDe("filtro-mandado")).toEqual(["Todos os mandados", "Com Mandado de Segurança"]);
  });

  it("'Com Mandado de Segurança' mostra só os processos com MS, em Em andamento e em Entregues; 'Todos os mandados' volta tudo", async () => {
    await montarPagina();
    expect(linhas()).toEqual(["m1", "s1", "s2"]);
    await escolher("filtro-mandado", "Com Mandado de Segurança");
    expect(linhas()).toEqual(["m1"]);
    el!.querySelector<HTMLButtonElement>("#tab-entregues")?.click();
    await nextTick();
    expect(entregues()).toEqual(["e1"]);
    await escolher("filtro-mandado", "Todos os mandados");
    expect(entregues()).toEqual(["e1", "e2"]);
  });

  it("conta na bolinha; o painel do celular tem o mesmo select e o 'Limpar' zera", async () => {
    await montarPagina();
    el!.querySelector<HTMLButtonElement>("#btn-filtros-processo")!.click();
    await nextTick();
    expect(el!.querySelector("label[for='sheet-filtro-mandado']")).toBeNull();
    expect(el!.querySelector("#sheet-filtro-mandado")!.getAttribute("aria-label")).toBe("Mandado de Segurança");
    expect(el!.querySelector("#sheet-filtro-mandado")!.className).toBe(el!.querySelector("#sheet-filtro-cotacao")!.className);
    await escolher("sheet-filtro-mandado", "Com Mandado de Segurança");
    expect(linhas()).toEqual(["m1"]);
    expect(texto("#badge-filtros-ativos")).toBe("1");
    expect(texto("#filtro-mandado")).toBe("Com Mandado de Segurança"); // mesmo estado da barra
    el!.querySelector<HTMLButtonElement>("#btn-filtros-limpar")!.click();
    await nextTick();
    expect(linhas()).toEqual(["m1", "s1", "s2"]);
    expect(el!.querySelector("#badge-filtros-ativos")).toBeNull();
  });

  it("se o último MS for apagado com o filtro ligado, o filtro volta a 'Todos' e o controle some", async () => {
    await montarPagina([proc("m1", "Maria Alves", { datas: { msAnexadoEm: "2026-11-10" } }), proc("s2", "Sílvia Rocha")]);
    await escolher("filtro-mandado", "Com Mandado de Segurança");
    expect(linhas()).toEqual(["m1"]);
    estado.processos.value = [proc("m1", "Maria Alves"), proc("s2", "Sílvia Rocha")];
    await nextTick();
    await nextTick();
    expect(el!.querySelector("#filtro-mandado")).toBeNull();
    expect(linhas()).toEqual(["m1", "s2"]);
    expect(el!.querySelector("#badge-filtros-ativos")).toBeNull();
  });

  it("consultor: só vê o filtro se um processo DELE tiver MS", async () => {
    await montarPagina([proc("s2", "Sílvia Rocha"), proc("f1", "Fábio", { consultor: "Flávia", datas: { msAnexadoEm: "2026-11-10" } })]);
    expect(el!.querySelector("#filtro-mandado")).toBeNull();
  });

  it("Kanban (quem edita): o mesmo filtro esconde os cards sem MS", async () => {
    estado.role = "operacional";
    estado.consultorNome = null;
    estado.podeEscrever = true;
    try {
      localStorage.setItem("followup-visao", "kanban");
    } catch {}
    await montarPagina();
    const cards = (): string[] =>
      Array.from(el!.querySelectorAll("[id^='processo-card-']"))
        .map((n) => n.id.replace("processo-card-", ""))
        .sort();
    expect(cards()).toEqual(["e1", "e2", "m1", "s1", "s2"]);
    await escolher("filtro-mandado", "Com Mandado de Segurança");
    expect(cards()).toEqual(["e1", "m1"]);
  });
});
