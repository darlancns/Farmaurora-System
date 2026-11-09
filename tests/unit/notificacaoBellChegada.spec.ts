// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Processo } from "../../shared/types/processo";

// Sino real (NotificacaoBell + AvisoChegadaItem) no happy-dom, com fetch simulado. Relógio: só o Date e os timers
// são falsos (as promises seguem normais). Brasília = UTC-3.

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
import { ATRASO_RECARGA_APOS_409_MS } from "../../app/composables/useChegadaAvisos";

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
    status: "em_transito",
    datas: { dataChegadaBrasil: "06/11" },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  };
}

const conta = (role: AuthUser["role"], nome?: string): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome,
  isAdmin: role === "administrador",
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
const postsChegada = () => servidor.chamadas.filter((c) => c.method === "POST" && c.url.endsWith("/chegada"));

beforeEach(() => {
  estados.clear();
  navegar.mockReset();
  servidor.chamadas = [];
  servidor.vistos = [];
  servidor.derrubarRede = false;
  servidor.chegada = () => ({ status: 200, corpo: {} });
  servidor.visto = () => ({ status: 200, corpo: { visto: true } });
  vi.stubGlobal("fetch", fetchFalso);
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(BRT("2026-11-08", "14:00"));
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

describe("sino — itens do aviso 'chegou?' por cargo", () => {
  it("operacional responsável: pergunta com 'Chegou?', as duas linhas e os dois botões; sem olhinho", async () => {
    await montar(conta("operacional", "Bruno Alves"), [proc("p1"), proc("p2", { responsavelOperacional: "Rebeca" })]);
    await abrirSino();

    expect(texto($("#chegada-titulo-p1"))).toBe("Chegou?");
    expect(texto($("#chegada-processo-p1"))).toBe("Ordem de Paciente p1 · 2026 - p1");
    expect(texto($("#chegada-data-linha-p1"))).toBe("Prevista para 06/11 (2 dias de atraso) · Lufthansa · AWB 020-1");
    expect(texto($("#btn-chegada-sim-p1"))).toBe("Sim, chegou");
    expect(texto($("#btn-chegada-nao-p1"))).toBe("Ainda não");
    expect($("#btn-chegada-visto-p1")).toBeNull();
    // o processo da Rebeca não aparece para o Bruno
    expect($("#aviso-chegada-p2")).toBeNull();
  });

  it("administrador: só texto + olhinho 'Marcar como visto'; sem título nem botões de atualizar", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1"), proc("p2", { responsavelOperacional: undefined })]);
    await abrirSino();

    expect($("#aviso-chegada-p1")).not.toBeNull();
    expect($("#aviso-chegada-p2")).not.toBeNull(); // sem responsável: só o administrador recebe
    expect($("#chegada-titulo-p1")).toBeNull();
    expect($("#btn-chegada-sim-p1")).toBeNull();
    expect($("#btn-chegada-nao-p1")).toBeNull();
    const olho = $("#btn-chegada-visto-p1")!;
    expect(olho.getAttribute("aria-label")).toBe("Marcar como visto");
    expect(texto($("#aviso-chegada-p1"))).not.toContain("Chegou?");
  });

  it("sócio e consultor não veem o aviso nem contam no badge", async () => {
    for (const role of ["socio", "consultor"] as const) {
      await montar(conta(role, "Bruno"), [proc("p1")]);
      await abrirSino();
      expect($("#aviso-chegada-p1")).toBeNull();
      expect($("#secao-notificacoes-chegada")).toBeNull();
      expect(badge()).toBeNull();
      app!.unmount();
      raiz!.remove();
      estados.clear();
    }
  });

  it("o contador do sino soma os avisos de chegada", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1"), proc("p2"), proc("p3", { status: "desembaraco" })]);
    expect(texto(badge())).toBe("2");
  });

  it("administrador: dispensas já gravadas escondem o aviso; antes de chegarem a lista não pisca", async () => {
    servidor.vistos = [{ processoId: "p1", dataPrevista: "2026-11-06" }];
    await montar(conta("administrador", "Cris"), [proc("p1"), proc("p2")]);
    await abrirSino();
    expect($("#aviso-chegada-p1")).toBeNull();
    expect($("#aviso-chegada-p2")).not.toBeNull();
    expect(texto(badge())).toBe("1");
  });

  it("clicar no texto abre o processo e fecha o sino", async () => {
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-abrir-chegada-p1");
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "p1" } });
    expect($("#painel-notificacoes-fornecedor")).toBeNull();
  });
});

describe("sino — reavaliação a cada minuto (corte das 13:00 de Brasília)", () => {
  it("o aviso de uma chegada prevista para hoje aparece sozinho às 13:00", async () => {
    vi.setSystemTime(new Date("2026-11-08T12:59:30-03:00"));
    await montar(conta("operacional", "Bruno"), [proc("p1", { datas: { dataChegadaBrasil: "08/11" } })]);
    await abrirSino();
    expect($("#aviso-chegada-p1")).toBeNull();
    expect(badge()).toBeNull();

    vi.advanceTimersByTime(60_000); // 13:00:30
    await esperar();
    expect($("#aviso-chegada-p1")).not.toBeNull();
    expect(texto($("#chegada-data-linha-p1"))).toBe("Prevista para hoje · Lufthansa · AWB 020-1");
    expect(texto(badge())).toBe("1");
  });

  it("o relógio para de rodar quando o sino é desmontado (sem timer vazando)", async () => {
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    app!.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("sino — Sim, chegou", () => {
  it("envia a ação, o item some, o badge zera e o sino continua aberto", async () => {
    const p1 = proc("p1");
    servidor.chegada = () => ({ status: 200, corpo: { ...p1, status: "desembaraco", updatedAt: "v2" } });
    await montar(conta("operacional", "Bruno"), [p1]);
    await abrirSino();

    await clicar("#btn-chegada-sim-p1");

    expect(postsChegada()).toEqual([{ url: "/api/processos/p1/chegada", method: "POST", body: { acao: "confirmar" } }]);
    expect($("#aviso-chegada-p1")).toBeNull();
    expect(badge()).toBeNull();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();
  });
});

describe("sino — Ainda não", () => {
  it("calendário com mínimo AMANHÃ, depois 'Nova data' com Confirmar; envia a data e o item some", async () => {
    const p1 = proc("p1");
    servidor.chegada = () => ({
      status: 200,
      corpo: { ...p1, datas: { dataChegadaBrasil: "12/11" }, updatedAt: "v2" },
    });
    await montar(conta("operacional", "Bruno"), [p1]);
    await abrirSino();

    await clicar("#btn-chegada-nao-p1");
    // o calendário abre sozinho; hoje (08/11) e os dias anteriores estão bloqueados, amanhã não
    const hoje = $<HTMLButtonElement>('[data-iso="2026-11-08"]')!;
    const amanha = $<HTMLButtonElement>('[data-iso="2026-11-09"]')!;
    expect($("#chegada-data-p1-calendario")).not.toBeNull();
    expect(hoje.disabled).toBe(true);
    expect(amanha.disabled).toBe(false);

    // clicar no calendário (fora do sino, num Teleport) não fecha o painel do sino
    $('[data-iso="2026-11-12"]')!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await esperar();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();

    await clicar('[data-iso="2026-11-12"]');
    expect(texto($("#chegada-nova-data-p1"))).toBe("Nova data: 12/11");
    expect(postsChegada()).toHaveLength(0); // nada é gravado antes do Confirmar

    await clicar("#btn-chegada-confirmar-p1");
    expect(postsChegada()).toEqual([
      { url: "/api/processos/p1/chegada", method: "POST", body: { acao: "adiar", novaData: "12/11" } },
    ]);
    expect($("#aviso-chegada-p1")).toBeNull();
    expect(badge()).toBeNull();
  });

  it("Cancelar na confirmação volta à pergunta, sem gravar", async () => {
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-chegada-nao-p1");
    await clicar('[data-iso="2026-11-12"]');
    await clicar("#btn-chegada-cancelar-p1");

    expect($("#btn-chegada-sim-p1")).not.toBeNull();
    expect($("#chegada-nova-data-p1")).toBeNull();
    expect(postsChegada()).toHaveLength(0);
  });

  it("data de outro ano vai como DD/MM/AAAA", async () => {
    const p1 = proc("p1");
    servidor.chegada = () => ({ status: 200, corpo: { ...p1, datas: { dataChegadaBrasil: "05/01/2027" } } });
    await montar(conta("operacional", "Bruno"), [p1]);
    await abrirSino();
    await clicar("#btn-chegada-nao-p1");
    // próximo mês até janeiro/2027 (de novembro: dezembro e janeiro)
    await clicar('[data-acao="mes-seguinte"]');
    await clicar('[data-acao="mes-seguinte"]');
    await clicar('[data-iso="2027-01-05"]');
    expect(texto($("#chegada-nova-data-p1"))).toBe("Nova data: 05/01/2027");
    await clicar("#btn-chegada-confirmar-p1");
    expect(postsChegada()[0]!.body).toEqual({ acao: "adiar", novaData: "05/01/2027" });
  });
});

describe("sino — administrador: olhinho", () => {
  it("grava a dispensa (processo + data prevista) e o aviso some só dele", async () => {
    await montar(conta("administrador", "Cris"), [proc("p1"), proc("p2")]);
    await abrirSino();

    await clicar("#btn-chegada-visto-p1");

    const posts = servidor.chamadas.filter((c) => c.url === "/api/chegada-avisos/visto");
    expect(posts).toEqual([
      { url: "/api/chegada-avisos/visto", method: "POST", body: { processoId: "p1", dataPrevista: "2026-11-06" } },
    ]);
    expect($("#aviso-chegada-p1")).toBeNull();
    expect($("#aviso-chegada-p2")).not.toBeNull();
    expect(texto(badge())).toBe("1");
    // o administrador não atualiza o processo por aqui
    expect(postsChegada()).toHaveLength(0);
  });

  it("falha ao marcar: mensagem no item, o aviso fica e o sino não fecha", async () => {
    servidor.visto = () => ({ status: 500, corpo: { statusMessage: "Falha temporária. Tente novamente." } });
    await montar(conta("administrador", "Cris"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-chegada-visto-p1");

    expect(texto($("#chegada-erro-p1"))).toBe("Falha temporária. Tente novamente.");
    expect($("#aviso-chegada-p1")).not.toBeNull();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();
  });
});

describe("sino — mensagens de erro no item", () => {
  it("403: mensagem curta no item, botões continuam, sino aberto", async () => {
    servidor.chegada = () => ({ status: 403, corpo: { statusMessage: "Apenas o operacional responsável por este processo pode responder ao aviso de chegada." } });
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-chegada-sim-p1");

    expect(texto($("#chegada-erro-p1"))).toContain("Apenas o operacional responsável");
    expect($("#btn-chegada-sim-p1")).not.toBeNull();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();
  });

  it("400 ao adiar: mensagem no item, na etapa de confirmação (dá para cancelar)", async () => {
    servidor.chegada = () => ({ status: 400, corpo: { statusMessage: "A nova data precisa ser depois de hoje." } });
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-chegada-nao-p1");
    await clicar('[data-iso="2026-11-12"]');
    await clicar("#btn-chegada-confirmar-p1");

    expect(texto($("#chegada-erro-p1"))).toBe("A nova data precisa ser depois de hoje.");
    expect($("#btn-chegada-cancelar-p1")).not.toBeNull();
  });

  it("409: mensagem, botões desligados e, passado o instante da leitura, o processo recarrega e o item sai", async () => {
    const p1 = proc("p1");
    servidor.chegada = () => ({ status: 409, corpo: { statusMessage: "Este processo já foi atualizado." } });
    await montar(conta("operacional", "Bruno"), [p1]);
    await abrirSino();
    await clicar("#btn-chegada-sim-p1");

    expect(texto($("#chegada-erro-p1"))).toBe("Este processo já foi atualizado.");
    expect($<HTMLButtonElement>("#btn-chegada-sim-p1")!.disabled).toBe(true);
    expect($<HTMLButtonElement>("#btn-chegada-nao-p1")!.disabled).toBe(true);
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();

    // outra pessoa já tinha atualizado: o servidor devolve o processo novo na recarga
    servidor.processos = [{ ...p1, status: "desembaraco" }];
    vi.advanceTimersByTime(ATRASO_RECARGA_APOS_409_MS);
    await esperar();
    expect($("#aviso-chegada-p1")).toBeNull();
    expect($("#painel-notificacoes-fornecedor")).not.toBeNull();
  });

  it("falha de rede: mensagem de conexão no item, nada some", async () => {
    servidor.derrubarRede = true;
    await montar(conta("operacional", "Bruno"), [proc("p1")]);
    await abrirSino();
    await clicar("#btn-chegada-sim-p1");

    expect(texto($("#chegada-erro-p1"))).toBe("Erro de conexão com o servidor. Tente novamente.");
    expect($("#aviso-chegada-p1")).not.toBeNull();
  });
});
