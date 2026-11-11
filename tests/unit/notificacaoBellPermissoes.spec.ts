// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Notificacao } from "../../shared/types/notificacao";
import type { Processo } from "../../shared/types/processo";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

// Sino real (NotificacaoBell + AvisoChegadaItem) no happy-dom, com fetch simulado, para as permissões por página:
// "editar" = como sempre; "ver" = alertas de processo na lista, sem botões e fora do badge; "nenhum" = sem alertas
// de processo (e sem buscar processos). Relógio: 08/11/2026 14:00 (Brasília).

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
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  };
}

// Um processo para cada alerta: chegada (em trânsito, prevista 06/11), fornecedor (Poros, compra 01/10, sem thread)
// e mandado (desembaraço, LPCO registrado em 01/11 = 7 dias).
const P_CHEGADA = proc("pC", { datas: { dataChegadaBrasil: "06/11" } });
const P_FORNECEDOR = proc("pF", {
  status: "elaboracao_fornecedores",
  fornecedor: "Poros - Turquia",
  datas: { dataCompraPO: "01/10" },
});
const P_MANDADO = proc("pM", { status: "desembaraco", datas: { registroLpco: "01/11" } });
const PROCESSOS = [P_CHEGADA, P_FORNECEDOR, P_MANDADO];

const RECADO: Notificacao = {
  id: "n1",
  destinatarioId: "u1",
  tipo: "recado_novo",
  mensagem: "Você tem um recado novo",
  lida: false,
  createdAt: "2026-11-08T10:00:00Z",
};

const conta = (role: AuthUser["role"], nome?: string, permissoes?: Permissoes): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

const VER: Permissoes = { processos: "ver", pagamentos: "nenhum", patients: "nenhum" };
const EDITAR: Permissoes = { processos: "editar", pagamentos: "nenhum", patients: "nenhum" };
const NENHUM: Permissoes = { processos: "nenhum", pagamentos: "editar", patients: "editar" };

// ── fetch simulado ───────────────────────────────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
}
const servidor = { notificacoes: [] as Notificacao[], chamadas: [] as Chamada[] };

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  servidor.chamadas.push({ url, method: opts?.method ?? "GET" });
  if (url === "/api/notificacoes") return resposta(200, servidor.notificacoes);
  if (url === "/api/processos") return resposta(200, PROCESSOS);
  if (url === "/api/chegada-avisos/vistos") return resposta(200, []);
  return resposta(200, {});
}

// ── montagem ─────────────────────────────────────────────────────────────────────────────────────────
let montagens = 0;
let app: App | null = null;
let raiz: HTMLElement | null = null;

async function esperar(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

async function montar(user: AuthUser): Promise<void> {
  const { useAuth } = await import("../../app/composables/useAuth");
  useAuth().user.value = user;
  const { useProcessos } = await import("../../app/composables/useProcessos");
  // Já carregados (como o sino real encontra depois de visitar Follow-Up): prova que o que esconde os alertas é a
  // permissão, não a falta de dados. O relógio avança 1 min por montagem para a janela anti-repetição do
  // fetchProcessos (módulo, entre testes) não impedir a busca.
  useProcessos().processos.value = PROCESSOS;
  vi.setSystemTime(new Date(BRT("2026-11-08", "14:00").getTime() + ++montagens * 60_000));
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(NotificacaoBell);
  app.mount(raiz);
  await esperar();
  $("#btn-notificacoes-fornecedor")!.click();
  await esperar();
}

function desmontar(): void {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  estados.clear();
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const badge = () => $("#badge-notificacoes-fornecedor");
const buscouProcessos = () => servidor.chamadas.some((c) => c.url === "/api/processos");
const painelHtml = () => $("#painel-notificacoes-fornecedor")?.innerHTML ?? "";

// O que o sino mostra para uma conta: contador, painel inteiro e se buscou processos.
async function fotografar(user: AuthUser) {
  await montar(user);
  const foto = { badge: texto(badge()), painel: painelHtml(), buscou: buscouProcessos() };
  desmontar();
  servidor.chamadas = [];
  return foto;
}

const ID = {
  fornecedor: "#notificacao-fornecedor-pF",
  mandado: "#notificacao-mandado-pM",
  chegada: "#aviso-chegada-pC",
  resolverFornecedor: "#btn-resolver-notificacao-pF",
  resolverMandado: "#btn-resolver-mandado-pM",
  sim: "#btn-chegada-sim-pC",
  nao: "#btn-chegada-nao-pC",
  visto: "#btn-chegada-visto-pC",
};

beforeEach(() => {
  estados.clear();
  navegar.mockReset();
  servidor.chamadas = [];
  servidor.notificacoes = [];
  vi.stubGlobal("fetch", fetchFalso);
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(BRT("2026-11-08", "14:00"));
});

afterEach(() => {
  desmontar();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sino — (a) operacional com 'editar' em Processos = idêntico ao de hoje", () => {
  it("os três alertas, os botões e o contador 3", async () => {
    await montar(conta("operacional", "Bruno Alves", EDITAR));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.mandado)).not.toBeNull();
    expect($(ID.chegada)).not.toBeNull();
    expect($(ID.resolverFornecedor)).not.toBeNull();
    expect($(ID.resolverMandado)).not.toBeNull();
    expect($(ID.sim)).not.toBeNull();
    expect($(ID.nao)).not.toBeNull();
    expect($(ID.visto)).toBeNull(); // olhinho é do administrador
    expect(texto(badge())).toBe("3");
    expect(buscouProcessos()).toBe(true);
  });

  it("o contador e o painel são idênticos aos de uma conta SEM mapa (mesmo HTML)", async () => {
    servidor.notificacoes = [RECADO];
    const semMapa = await fotografar(conta("operacional", "Bruno Alves"));
    const comMapa = await fotografar(conta("operacional", "Bruno Alves", EDITAR));
    expect(comMapa).toEqual(semMapa);
    expect(semMapa.badge).toBe("4"); // 3 alertas + 1 recado
  });
});

describe("sino — (b) operacional com 'ver' em Processos", () => {
  it("os alertas ficam na lista, sem nenhum botão de ação", async () => {
    await montar(conta("operacional", "Bruno Alves", VER));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.mandado)).not.toBeNull();
    expect($(ID.chegada)).not.toBeNull();
    expect(texto($("#chegada-processo-pC"))).toContain("Paciente pC");
    // só o botão de ABRIR o processo (navegação) continua
    expect($("#btn-abrir-fornecedor-pF")).not.toBeNull();
    expect($("#btn-abrir-mandado-pM")).not.toBeNull();
    expect($("#btn-abrir-chegada-pC")).not.toBeNull();
    for (const sel of [ID.resolverFornecedor, ID.resolverMandado, ID.sim, ID.nao, ID.visto]) {
      expect($(sel), sel).toBeNull();
    }
    // nada de calendário do "ainda não" nem confirmação
    expect($("[id^='chegada-data-p']")).toBeNull();
    expect($("[id^='btn-chegada-confirmar']")).toBeNull();
  });

  it("o contador NÃO conta esses alertas (sem badge), mas conta os recados", async () => {
    await montar(conta("operacional", "Bruno Alves", VER));
    expect(badge()).toBeNull();
    desmontar();
    servidor.notificacoes = [RECADO];
    await montar(conta("operacional", "Bruno Alves", VER));
    expect(texto(badge())).toBe("1");
    expect($("#notificacao-recado-n1")).not.toBeNull();
  });

  it("busca os processos (pode LER) e continua abrindo o processo ao clicar no alerta", async () => {
    await montar(conta("operacional", "Bruno Alves", VER));
    expect(buscouProcessos()).toBe(true);
    $("#btn-abrir-chegada-pC")!.click();
    await esperar();
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "pC" } });
  });

  it("nenhuma chamada de escrita é disparada (POST/PATCH) ao abrir o sino", async () => {
    await montar(conta("operacional", "Bruno Alves", VER));
    expect(servidor.chamadas.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("sócio com 'ver': vê o alerta de Fornecedor sem botão e sem contagem; Mandado e Chegada não são dele", async () => {
    await montar(conta("socio", "Sócio", VER));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.resolverFornecedor)).toBeNull();
    expect($(ID.mandado)).toBeNull();
    expect($(ID.chegada)).toBeNull();
    expect(badge()).toBeNull();
  });

  it("operacional 'ver' SEM o nome do responsável: só o Fornecedor, sem botão e sem contagem", async () => {
    await montar(conta("operacional", "Maria Souza", VER));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.mandado)).toBeNull();
    expect($(ID.chegada)).toBeNull();
    expect($(ID.resolverFornecedor)).toBeNull();
    expect(badge()).toBeNull();
  });
});

describe("sino — (c) operacional com 'nenhum' em Processos", () => {
  it("não busca processos e não mostra nenhum alerta de processo", async () => {
    servidor.notificacoes = [RECADO];
    await montar(conta("operacional", "Bruno Alves", NENHUM));
    expect(buscouProcessos()).toBe(false);
    for (const sel of [ID.fornecedor, ID.mandado, ID.chegada, "#secao-notificacoes-chegada"]) expect($(sel), sel).toBeNull();
    // o resto do sino segue: recados contam
    expect(texto(badge())).toBe("1");
    expect($("#notificacao-recado-n1")).not.toBeNull();
  });

  it("sem recados: 'Nenhuma notificação no momento.' e sem badge", async () => {
    await montar(conta("operacional", "Bruno Alves", NENHUM));
    expect(texto($("#painel-notificacoes-fornecedor"))).toContain("Nenhuma notificação no momento.");
    expect(badge()).toBeNull();
  });
});

describe("sino — (d) administrador inalterado, com ou sem mapa gravado", () => {
  it("vê os três alertas, com olhinho e botões, contador 3", async () => {
    await montar(conta("administrador", "Cris"));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.mandado)).not.toBeNull();
    expect($(ID.chegada)).not.toBeNull();
    expect($(ID.resolverFornecedor)).not.toBeNull();
    expect($(ID.resolverMandado)).not.toBeNull(); // o administrador resolve qualquer Mandado
    expect($(ID.visto)).not.toBeNull();
    expect($(ID.sim)).toBeNull();
    expect(texto(badge())).toBe("3");
    expect(servidor.chamadas.some((c) => c.url === "/api/chegada-avisos/vistos")).toBe(true);
  });

  it("um mapa gravado na conta do administrador é ignorado (mesmo HTML)", async () => {
    servidor.notificacoes = [RECADO];
    const semMapa = await fotografar(conta("administrador", "Cris"));
    const comMapa = await fotografar(conta("administrador", "Cris", NENHUM));
    expect(comMapa).toEqual(semMapa);
  });
});

describe("sino — (e) conta SEM mapa: idêntica ao comportamento de antes, nos 4 cargos", () => {
  it("operacional responsável: 3 alertas, botões, badge 3", async () => {
    const foto = await fotografar(conta("operacional", "Bruno"));
    expect(foto.badge).toBe("3");
    expect(foto.buscou).toBe(true);
  });

  it("sócio: só o Fornecedor, com botão e contado (badge 1)", async () => {
    await montar(conta("socio", "Sócio"));
    expect($(ID.fornecedor)).not.toBeNull();
    expect($(ID.resolverFornecedor)).not.toBeNull();
    expect($(ID.mandado)).toBeNull();
    expect($(ID.chegada)).toBeNull();
    expect(texto(badge())).toBe("1");
  });

  it("consultor: nenhum alerta de processo, não busca processos, sem badge", async () => {
    servidor.notificacoes = [];
    await montar(conta("consultor", "Dani"));
    expect(buscouProcessos()).toBe(false);
    for (const sel of [ID.fornecedor, ID.mandado, ID.chegada]) expect($(sel), sel).toBeNull();
    expect(badge()).toBeNull();
  });

  it("consultor com um mapa gravado (ignorado) continua sem alertas de processo", async () => {
    await montar(conta("consultor", "Dani", VER));
    expect(buscouProcessos()).toBe(false);
    expect(badge()).toBeNull();
  });

  it("administrador: 3 alertas, badge 3", async () => {
    const foto = await fotografar(conta("administrador", "Cris"));
    expect(foto.badge).toBe("3");
  });
});
