// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Processo } from "../../shared/types/processo";

// Sino real (NotificacaoBell) no happy-dom, com fetch simulado — aviso "Prazo limite pra Manifestação da ANVISA" e a
// seção própria "Prazo da ANVISA" (separada do "Mandado de Segurança"). Arranjo copiado de notificacaoBellChegada.spec.ts.
// Relógio: só o Date e os timers são falsos. Brasília = UTC-3.

const estados = vi.hoisted(() => new Map<string, unknown>());
const navegar = vi.hoisted(() => vi.fn());

vi.mock("#app", () => ({
  useState: <T>(chave: string, init?: () => T): Ref<T> => {
    if (!estados.has(chave)) estados.set(chave, ref(init ? init() : undefined));
    return estados.get(chave) as Ref<T>;
  },
  navigateTo: navegar,
}));

import NotificacaoBell from "../../app/components/NotificacaoBell.vue";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

const BRT = (dia: string, hhmm: string): Date => new Date(`${dia}T${hhmm}:00-03:00`);

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: `2026 - ${id}`,
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    companhiaAerea: "Lufthansa",
    numeroAwb: "020-1",
    medicamentos: [],
    // em desembaraço e sem chegada (nenhum "chegou?" atrapalha); prazo quinta 19/11 -> aviso a partir de 23/11
    status: "desembaraco",
    datas: { prazoAnvisa: "2026-11-19" },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  };
}

const conta = (role: AuthUser["role"], nome?: string, permissoes?: Permissoes): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

// ── fetch simulado ────────────────────────────────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
  body: unknown;
}
const servidor = {
  processos: [] as Processo[],
  vistos: [] as Array<{ processoId: string; dataPrevista: string }>,
  // resposta do POST /chegada: função que decide (status HTTP + corpo)
  chegada: (_c: Chamada): { status: number; corpo: unknown } => ({ status: 200, corpo: {} }),
  visto: (_c: Chamada): { status: number; corpo: unknown } => ({ status: 200, corpo: { visto: true } }),
  ciente: (_c: Chamada): { status: number; corpo: unknown } => ({ status: 200, corpo: {} }),
  derrubarRede: false,
  chamadas: [] as Chamada[],
};

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  const chamada: Chamada = {
    url,
    method: opts?.method ?? "GET",
    body: opts?.body ? JSON.parse(String(opts.body)) : undefined,
  };
  servidor.chamadas.push(chamada);
  if (servidor.derrubarRede && chamada.method === "POST") throw new TypeError("Failed to fetch");

  if (url === "/api/notificacoes") return resposta(200, []);
  if (url === "/api/processos") return resposta(200, servidor.processos);
  if (url === "/api/chegada-avisos/vistos") return resposta(200, servidor.vistos);
  if (url === "/api/chegada-avisos/visto") {
    const r = servidor.visto(chamada);
    return resposta(r.status, r.corpo);
  }
  const ciente = /^\/api\/processos\/([^/]+)\/anvisa-ciente$/.exec(url);
  if (ciente) {
    const r = servidor.ciente(chamada);
    if (r.status !== 200) return resposta(r.status, r.corpo);
    const p = servidor.processos.find((x) => x.id === ciente[1])!;
    return resposta(200, { ...p, alertaAnvisaCientePrazo: (chamada.body as { prazo: string }).prazo });
  }
  if (/^\/api\/processos\/[^/]+\/chegada$/.test(url)) {
    const r = servidor.chegada(chamada);
    return resposta(r.status, r.corpo);
  }
  const unico = /^\/api\/processos\/([^/]+)$/.exec(url);
  if (unico) {
    const p = servidor.processos.find((x) => x.id === unico[1]);
    return p ? resposta(200, p) : resposta(404, { statusMessage: "Processo não encontrado." });
  }
  throw new Error(`fetch inesperado: ${url}`);
}

// ── montagem ──────────────────────────────────────────────────────────────────────────────────────────
let app: App | null = null;
let raiz: HTMLElement | null = null;

async function esperar(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

async function montar(user: AuthUser, processos: Processo[]): Promise<void> {
  servidor.processos = processos;
  const { useAuth } = await import("../../app/composables/useAuth");
  useAuth().user.value = user;
  const { useProcessos } = await import("../../app/composables/useProcessos");
  useProcessos().processos.value = processos;

  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(NotificacaoBell);
  app.mount(raiz);
  await esperar();
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const badge = () => $("#badge-notificacoes-fornecedor");

async function abrirSino(): Promise<void> {
  $("#btn-notificacoes-fornecedor")!.click();
  await esperar();
}
async function clicar(sel: string): Promise<void> {
  const el = $(sel);
  expect(el, `elemento ${sel}`).not.toBeNull();
  el!.click();
  await esperar();
}
const postsCiente = () => servidor.chamadas.filter((c) => c.method === "POST" && c.url.endsWith("/anvisa-ciente"));

beforeEach(() => {
  estados.clear();
  navegar.mockReset();
  servidor.chamadas = [];
  servidor.vistos = [];
  servidor.derrubarRede = false;
  servidor.chegada = () => ({ status: 200, corpo: {} });
  servidor.visto = () => ({ status: 200, corpo: { visto: true } });
  servidor.ciente = () => ({ status: 200, corpo: {} });
  vi.stubGlobal("fetch", fetchFalso);
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(BRT("2026-11-23", "08:00"));
});

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sino — aviso do prazo da ANVISA", () => {
  it("operacional dono: seção própria com título, paciente · pasta, prazo e o botão Ciente; conta no badge", async () => {
    await montar(conta("operacional", "Bruno Alves"), [proc("p1"), proc("p2", { responsavelOperacional: "Rebeca" })]);
    expect(texto(badge())).toBe("1");
    await abrirSino();
    expect(texto($("#secao-notificacoes-anvisa"))).toBe("Prazo da ANVISA");
    expect(texto($("#aviso-anvisa-p1"))).toContain("Prazo limite pra Manifestação da ANVISA");
    expect(texto($("#anvisa-processo-p1"))).toBe("Paciente p1 · 2026 - p1");
    expect(texto($("#anvisa-prazo-p1"))).toBe("Prazo: 19/11/2026");
    expect(texto($("#btn-ciente-anvisa-p1"))).toBe("Ciente");
    expect($("#aviso-anvisa-p2")).toBeNull(); // de outro operacional
  });

  it("antes do primeiro dia útil depois do prazo (domingo 22/11): nada", async () => {
    vi.setSystemTime(BRT("2026-11-22", "20:00"));
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    expect(badge()).toBeNull();
    await abrirSino();
    expect($("#secao-notificacoes-anvisa")).toBeNull();
  });

  it("pasta vazia: só o paciente", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1", { pasta: "" })]);
    await abrirSino();
    expect(texto($("#anvisa-processo-p1"))).toBe("Paciente p1");
  });

  it("separada da seção 'Mandado de Segurança' (os dois alertas ao mesmo tempo)", async () => {
    const comLpco = proc("p1", { datas: { prazoAnvisa: "2026-11-19", registroLpco: "01/11/2026" } });
    await montar(conta("administrador", "Cris"), [comLpco]);
    await abrirSino();
    expect($("#notificacao-mandado-p1")).not.toBeNull();
    expect($("#aviso-anvisa-p1")).not.toBeNull();
    expect(texto($("#secao-notificacoes-anvisa"))).toBe("Prazo da ANVISA");
    expect(texto(badge())).toBe("2");
  });

  it("Ciente: envia o prazo visto, o item some na hora e não navega nem fecha o sino", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-ciente-anvisa-p1");
    expect(postsCiente()).toEqual([{ url: "/api/processos/p1/anvisa-ciente", method: "POST", body: { prazo: "2026-11-19" } }]);
    expect($("#aviso-anvisa-p1")).toBeNull();
    expect(badge()).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();
  });

  it("Ciente com 409 (prazo trocado): o aviso volta e o processo é recarregado", async () => {
    servidor.ciente = () => ({ status: 409, corpo: { statusMessage: "O prazo da ANVISA deste processo mudou." } });
    await montar(conta("administrador", "Cris"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-ciente-anvisa-p1");
    expect($("#aviso-anvisa-p1")).not.toBeNull();
    expect(servidor.chamadas.some((c) => c.method === "GET" && c.url === "/api/processos/p1")).toBe(true);
  });

  it("clicar no texto abre o processo", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-abrir-anvisa-p1");
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "p1" } });
  });

  it("consultor não recebe o aviso", async () => {
    await montar(conta("consultor", "Dani"), [proc("p1")]);
    await abrirSino();
    expect($("#aviso-anvisa-p1")).toBeNull();
  });

  it("quem só 'vê' Processos não recebe o aviso (nem no badge)", async () => {
    await montar(conta("operacional", "Bruno", { processos: "ver", pagamentos: "nenhum", patients: "nenhum" }), [proc("p1")]);
    expect(badge()).toBeNull();
    await abrirSino();
    expect($("#aviso-anvisa-p1")).toBeNull();
  });

  it("Entregue ou com ciência para o prazo atual: nada", async () => {
    await montar(conta("administrador", "Cris"), [
      proc("p1", { status: "entregue" }),
      proc("p2", { alertaAnvisaCientePrazo: "2026-11-19" }),
    ]);
    await abrirSino();
    expect($("#secao-notificacoes-anvisa")).toBeNull();
  });
});
