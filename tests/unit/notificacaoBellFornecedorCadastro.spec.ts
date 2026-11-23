// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type App, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Processo } from "../../shared/types/processo";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

// ETAPA 4, com o sino REAL (NotificacaoBell) no happy-dom e fetch simulado: o prazo do alerta de fornecedor vem do Cadastro; se a lista do Cadastro
// ainda não carregou, falhou ou veio vazia, o sino NÃO cai e usa a tabela antiga. Mesmo harness de notificacaoBellSemPasta.spec.ts.
// Relógio: 08/11/2026 14:00 (Brasília). Um processo Poros, compra em 01/10 (38 dias), sem abertura de thread.

const estados = vi.hoisted(() => new Map<string, unknown>());

vi.mock("#app", () => ({
  useState: <T>(chave: string, init?: () => T): Ref<T> => {
    if (!estados.has(chave)) estados.set(chave, ref(init ? init() : undefined));
    return estados.get(chave) as Ref<T>;
  },
  navigateTo: vi.fn(),
}));

import NotificacaoBell from "../../app/components/NotificacaoBell.vue";

const BRT = (dia: string, hhmm: string): Date => new Date(`${dia}T${hhmm}:00-03:00`);

function proc(id: string, fornecedor: string): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: `2026 - ${id}`,
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    medicamentos: [],
    status: "elaboracao_fornecedores",
    fornecedor,
    datas: { dataCompraPO: "01/10" },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
  };
}

let PROCESSOS: Processo[] = [];

const EDITAR: Permissoes = { processos: "editar", pagamentos: "nenhum", patients: "nenhum" };
const conta = (): AuthUser => ({ id: "u1", email: "u@x.com", role: "operacional", nome: "Bruno Alves", isAdmin: false, permissoes: EDITAR });

// Cadastro de fornecedores simulado. Cada teste escolhe: uma lista, uma falha (500) ou uma promessa que só resolve quando o teste mandar.
type Cadastro = { tipo: "lista"; itens: unknown[] } | { tipo: "falha" } | { tipo: "pendente" };
let cadastroFornecedores: Cadastro = { tipo: "lista", itens: [] };
let pendencia: Promise<Response> | null = null;

const forn = (nome: string, pais: string, prazoAlertaDias: number | null) => ({
  id: nome,
  nome,
  pais,
  ativo: true,
  prazoAlertaDias,
  semAlerta: prazoAlertaDias === null,
});

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string): Promise<Response> {
  if (url === "/api/notificacoes") return resposta(200, []);
  if (url === "/api/processos") return resposta(200, PROCESSOS);
  if (url === "/api/chegada-avisos/vistos") return resposta(200, []);
  if (url === "/api/cadastros/fornecedores") {
    if (cadastroFornecedores.tipo === "falha") return resposta(500, { statusMessage: "Falha ao listar os fornecedores." });
    if (cadastroFornecedores.tipo === "pendente") return pendencia!;
    return resposta(200, cadastroFornecedores.itens);
  }
  if (url.startsWith("/api/cadastros/")) return resposta(200, []);
  return resposta(200, {});
}

async function esperar(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
  // a carga dos Cadastros é uma cadeia de promessas (fetch → json → estado): deixa a fila esvaziar
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}

let montagens = 0;
let app: App | null = null;
let raiz: HTMLElement | null = null;

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

async function montar(): Promise<void> {
  const { useAuth } = await import("../../app/composables/useAuth");
  useAuth().user.value = conta();
  const { useProcessos } = await import("../../app/composables/useProcessos");
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

const alertaDo = (id: string) => $(`#btn-abrir-fornecedor-${id}`);

beforeEach(() => {
  estados.clear();
  pendencia = null;
  cadastroFornecedores = { tipo: "lista", itens: [] };
  PROCESSOS = [proc("pP", "Poros - Turquia")];
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
  estados.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sino: alerta de fornecedor com a lista do Cadastro que falhou, está vazia ou ainda não carregou (reserva)", () => {
  it("a lista do Cadastro FALHOU (500): o sino não cai e mostra o alerta da tabela antiga", async () => {
    cadastroFornecedores = { tipo: "falha" };
    await montar();
    expect(alertaDo("pP")).not.toBeNull();
  });

  it("a lista veio VAZIA: usa a tabela antiga (o Cadastro sempre tem fornecedores; vazio é falha de carga, não 'ninguém tem prazo')", async () => {
    cadastroFornecedores = { tipo: "lista", itens: [] };
    await montar();
    expect(alertaDo("pP")).not.toBeNull();
  });

  it("a lista ainda NÃO carregou (requisição pendente): o alerta aparece pela reserva e, quando ela chega, vale o Cadastro", async () => {
    let liberar: (r: Response) => void = () => undefined;
    pendencia = new Promise<Response>((r) => (liberar = r));
    cadastroFornecedores = { tipo: "pendente" };
    await montar();
    expect(alertaDo("pP")).not.toBeNull(); // enquanto a lista não chega: pela tabela antiga
    liberar(resposta(200, [forn("Poros", "Turquia", 90)]));
    await esperar();
    expect(alertaDo("pP")).toBeNull(); // a lista chegou: o prazo do Cadastro (90 dias) manda
  });
});

describe("sino: com a lista do Cadastro carregada, o prazo é o do Cadastro", () => {
  it("Poros com prazo 10 dias (38 dias desde a compra): continua alertando", async () => {
    cadastroFornecedores = { tipo: "lista", itens: [forn("Poros", "Turquia", 10)] };
    await montar();
    expect(alertaDo("pP")).not.toBeNull();
  });

  it("Poros com prazo de 90 dias no Cadastro (38 dias desde a compra): o alerta some, o Cadastro manda", async () => {
    cadastroFornecedores = { tipo: "lista", itens: [forn("Poros", "Turquia", 90)] };
    await montar();
    expect(alertaDo("pP")).toBeNull();
  });

  it("Poros marcado 'semAlerta' no Cadastro: o alerta some", async () => {
    cadastroFornecedores = { tipo: "lista", itens: [forn("Poros", "Turquia", null), forn("Beldimed", "Bélgica", 7)] };
    await montar();
    expect(alertaDo("pP")).toBeNull();
  });

  it("'Nacional' e legado sem país não alertam, mesmo com o Cadastro carregado", async () => {
    PROCESSOS = [proc("pN", "Nacional"), proc("pC", "Can Pharma"), proc("pP", "Poros - Turquia")];
    cadastroFornecedores = { tipo: "lista", itens: [forn("Poros", "Turquia", 3), forn("Can Pharma", "China", 1), forn("Nacional", "", 1)] };
    await montar();
    expect(alertaDo("pP")).not.toBeNull();
    expect(alertaDo("pN")).toBeNull();
    expect(alertaDo("pC")).toBeNull();
  });
});
