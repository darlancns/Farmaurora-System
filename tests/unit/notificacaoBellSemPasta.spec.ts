// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Notificacao } from "../../shared/types/notificacao";
import type { Processo } from "../../shared/types/processo";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

// Sino real (NotificacaoBell + AvisoChegadaItem) no happy-dom, com fetch simulado: processos SEM pasta (opcional)
// aparecem só com o nome do paciente — sem "· " nem "(pasta )" sobrando. Mesmo harness de
// notificacaoBellPermissoes.spec.ts. Relógio: 08/11/2026 14:00 (Brasília).

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
// Pasta opcional: a lista do servidor é trocada por teste (com pasta / sem pasta).
let PROCESSOS: Processo[] = [P_CHEGADA, P_FORNECEDOR, P_MANDADO];
const semPasta = (lista: Processo[]) => lista.map((p) => ({ ...p, pasta: "" }));

const conta = (role: AuthUser["role"], nome?: string, permissoes?: Permissoes): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

const EDITAR: Permissoes = { processos: "editar", pagamentos: "nenhum", patients: "nenhum" };

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


beforeEach(() => {
  estados.clear();
  navegar.mockReset();
  servidor.chamadas = [];
  servidor.notificacoes = [];
  PROCESSOS = [P_CHEGADA, P_FORNECEDOR, P_MANDADO];
  vi.stubGlobal("fetch", fetchFalso);
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(BRT("2026-11-08", "14:00"));
});

afterEach(() => {
  desmontar();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sino — processos sem pasta", () => {
  it("fornecedor, mandado e chegada: só o nome do paciente, sem '·' nem '(pasta )'", async () => {
    PROCESSOS = semPasta(PROCESSOS);
    await montar(conta("operacional", "Bruno Alves", EDITAR));
    const fornecedor = texto($("#btn-abrir-fornecedor-pF"));
    expect(fornecedor.startsWith("Paciente pF")).toBe(true);
    expect(fornecedor).not.toContain("·");
    const mandado = texto($("#btn-abrir-mandado-pM"));
    expect(mandado).toContain("Solicitar Mandado de Segurança — Paciente pM. Registro do LPCO em");
    expect(mandado).not.toContain("pasta");
    expect(mandado).not.toContain("()");
    const chegada = texto($("#aviso-chegada-pC"));
    expect(chegada).toContain("Ordem de Paciente pC");
    expect(chegada).not.toMatch(/Paciente pC ·/);
  });

  it("com pasta: como sempre", async () => {
    await montar(conta("operacional", "Bruno Alves", EDITAR));
    expect(texto($("#btn-abrir-fornecedor-pF"))).toContain("Paciente pF · 2026 - pF");
    expect(texto($("#btn-abrir-mandado-pM"))).toContain("— Paciente pM (pasta 2026 - pM). Registro do LPCO em");
    expect(texto($("#aviso-chegada-pC"))).toContain("Ordem de Paciente pC · 2026 - pC");
  });
});
