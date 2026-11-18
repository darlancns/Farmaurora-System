// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { NewProcessoDTO, Processo } from "#shared/types/processo";
import {
  gerarIdNovoProcesso,
  ID_NOVO_PROCESSO_RE,
  isIdNovoProcessoValido,
  MENSAGEM_PROCESSO_JA_CRIADO,
} from "#shared/utils/idNovoProcesso";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { useCriarProcesso } from "../../app/composables/useCriarProcesso";
import { ProcessoJaCriadoError, useProcessos } from "../../app/composables/useProcessos";
import { useTravaEnvio } from "../../app/composables/useTravaEnvio";
import { ApiError } from "../../app/utils/apiFetch";
import { getErrorMessage } from "../../app/utils/errorMessages";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Segunda proteção contra envio repetido (cliente): o id do "Novo processo" é gerado UMA vez ao abrir o formulário e vai em
// todo envio dele; o 409 "já criado" do servidor fecha o formulário sem toast de sucesso duplicado e recarrega a lista.

const ID_VALIDO = /^proc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ── fetch simulado ────────────────────────────────────────────────────────────────────────────────────
interface Chamada {
  method: string;
  url: string;
  body: Record<string, unknown> | undefined;
}
let chamadas: Chamada[] = [];
// Decide a resposta de cada POST (índice do POST, corpo) → status+corpo, ou lança (rede caiu).
let responderPost: (n: number, corpo: Record<string, unknown>) => { status: number; corpo: unknown } = () => ({ status: 201, corpo: {} });
let listaDoServidor: Processo[] = [];

const respostaHttp = (status: number, corpo: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response;

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  const method = opts?.method ?? "GET";
  const body = opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : undefined;
  chamadas.push({ method, url, body });
  if (method === "POST" && url === "/api/processos") {
    const n = chamadas.filter((c) => c.method === "POST").length;
    const r = responderPost(n, body ?? {});
    return respostaHttp(r.status, r.corpo);
  }
  if (method === "GET" && url === "/api/processos") return respostaHttp(200, listaDoServidor);
  throw new Error(`fetch inesperado: ${method} ${url}`);
}

const posts = () => chamadas.filter((c) => c.method === "POST");
const gets = () => chamadas.filter((c) => c.method === "GET");

function payload(extra: Record<string, unknown> = {}): NewProcessoDTO {
  return {
    paciente: "Maria",
    pasta: "",
    empresa: "FARMAURORA",
    consultor: "Dani",
    status: "elaboracao_fornecedores",
    medicamentos: [],
    datas: {},
    pendencias: [],
    atualizacoes: [],
    ...extra,
  } as NewProcessoDTO;
}

const processoCriado = (id: string, extra: Record<string, unknown> = {}): Processo =>
  montarProcesso(linhaCompleta({ id, ...extra }) as unknown as FollowUpRow);

beforeEach(() => {
  chamadas = [];
  listaDoServidor = [];
  responderPost = (_n, corpo) => ({ status: 201, corpo: processoCriado(String(corpo.id ?? "proc_servidor")) });
  vi.stubGlobal("fetch", vi.fn(fetchFalso));
  useProcessos().processos.value = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useProcessos().processos.value = [];
});

// ── Gerador e formato ─────────────────────────────────────────────────────────────────────────────────
describe("gerarIdNovoProcesso / isIdNovoProcessoValido", () => {
  it("gera proc_ + UUID em minúsculas, único a cada chamada", () => {
    const ids = Array.from({ length: 50 }, () => gerarIdNovoProcesso());
    for (const id of ids) {
      expect(id).toMatch(ID_VALIDO);
      expect(ID_NOVO_PROCESSO_RE.test(id!)).toBe(true);
      expect(isIdNovoProcessoValido(id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(50);
  });

  it("sem crypto.randomUUID (contexto não seguro / navegador antigo): devolve undefined e o POST segue sem id", () => {
    vi.stubGlobal("crypto", {});
    expect(gerarIdNovoProcesso()).toBeUndefined();
  });

  it("validador: aceita só o formato exato", () => {
    expect(isIdNovoProcessoValido("proc_3f2b8c1e-5a47-4d9e-8b21-0c6d7e9a1f34")).toBe(true);
    for (const ruim of ["", "proc_1", "proc_3F2B8C1E-5A47-4D9E-8B21-0C6D7E9A1F34", "x", null, undefined, 3]) {
      expect(isIdNovoProcessoValido(ruim), String(ruim)).toBe(false);
    }
  });
});

// ── useProcessos ──────────────────────────────────────────────────────────────────────────────────────
describe("useProcessos — addProcesso e fetchProcessos(forcar)", () => {
  it("manda o `id` no corpo do POST e põe o criado no topo da lista", async () => {
    const id = gerarIdNovoProcesso()!;
    const { addProcesso, processos } = useProcessos();
    await addProcesso({ ...payload(), id });
    expect(posts()[0]!.body).toMatchObject({ id, paciente: "Maria" });
    expect(processos.value.map((p) => p.id)).toEqual([id]);
  });

  it("409 COM id → ProcessoJaCriadoError (mensagem própria) e a lista não muda", async () => {
    responderPost = () => ({ status: 409, corpo: { statusMessage: MENSAGEM_PROCESSO_JA_CRIADO } });
    const { addProcesso, processos } = useProcessos();
    const erro = await addProcesso({ ...payload(), id: gerarIdNovoProcesso()! }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ProcessoJaCriadoError);
    expect((erro as Error).message).toBe("Esse processo já foi criado.");
    expect(processos.value).toEqual([]);
  });

  it("409 SEM id (aba antiga) e outros erros seguem como ApiError comum", async () => {
    const { addProcesso } = useProcessos();
    responderPost = () => ({ status: 409, corpo: { statusMessage: "Outro conflito." } });
    const e409 = await addProcesso(payload()).catch((e: unknown) => e);
    expect(e409).toBeInstanceOf(ApiError);
    expect(e409).not.toBeInstanceOf(ProcessoJaCriadoError);

    responderPost = () => ({ status: 500, corpo: { statusMessage: "Falha." } });
    const e500 = await addProcesso({ ...payload(), id: gerarIdNovoProcesso()! }).catch((e: unknown) => e);
    expect(e500).toBeInstanceOf(ApiError);
    expect((e500 as ApiError).status).toBe(500);
  });

  it("fetchProcessos(true) ignora a janela de reaproveitamento; sem o argumento continua reaproveitando", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const { fetchProcessos } = useProcessos();
    await fetchProcessos();
    expect(gets()).toHaveLength(1);
    await fetchProcessos(); // dentro da janela de 5s: não busca
    expect(gets()).toHaveLength(1);
    await fetchProcessos(true); // forçado: busca
    expect(gets()).toHaveLength(2);
  });
});

// ── useCriarProcesso ──────────────────────────────────────────────────────────────────────────────────
describe("useCriarProcesso — o id vale por formulário aberto", () => {
  it("reenvios do MESMO formulário levam o MESMO id; um formulário novo gera outro", async () => {
    responderPost = (n, corpo) =>
      n === 1 ? { status: 500, corpo: { statusMessage: "Falha." } } : { status: 201, corpo: processoCriado(String(corpo.id)) };
    const { iniciar, criar } = useCriarProcesso();

    iniciar();
    await expect(criar(payload())).rejects.toBeInstanceOf(ApiError); // erro: o usuário tenta de novo
    await expect(criar(payload())).resolves.toEqual({ tipo: "criado" });
    const [a, b] = posts().map((p) => p.body!.id);
    expect(a).toMatch(ID_VALIDO);
    expect(b).toBe(a);

    iniciar(); // abriu outro formulário
    await criar(payload());
    expect(posts()[2]!.body!.id).toMatch(ID_VALIDO);
    expect(posts()[2]!.body!.id).not.toBe(a);
  });

  it("encerrar esquece o id (nenhum id vai se ninguém abriu o formulário) e sem crypto o POST vai sem id", async () => {
    const { iniciar, encerrar, criar } = useCriarProcesso();
    iniciar();
    encerrar();
    await criar(payload());
    expect(posts()[0]!.body).not.toHaveProperty("id");

    vi.stubGlobal("crypto", {});
    iniciar();
    await criar(payload());
    expect(posts()[1]!.body).not.toHaveProperty("id");
  });

  it("409 → { tipo: 'ja_criado' } e recarrega a lista (GET forçado), sem lançar", async () => {
    responderPost = () => ({ status: 409, corpo: { statusMessage: MENSAGEM_PROCESSO_JA_CRIADO } });
    listaDoServidor = [processoCriado("proc_ja_existe")];
    const { iniciar, criar } = useCriarProcesso();
    iniciar();
    await expect(criar(payload())).resolves.toEqual({ tipo: "ja_criado" });
    await vi.waitFor(() => expect(useProcessos().processos.value.map((p) => p.id)).toEqual(["proc_ja_existe"]));
    expect(gets()).toHaveLength(1);
  });

  it("outros erros sobem para quem chamou (a página mostra o toast de erro)", async () => {
    responderPost = () => ({ status: 500, corpo: { statusMessage: "Falha." } });
    const { iniciar, criar } = useCriarProcesso();
    iniciar();
    await expect(criar(payload())).rejects.toBeInstanceOf(ApiError);
    expect(gets()).toHaveLength(0);
  });
});

// ── Cola da página: 2 envios com o mesmo id; o 2º recebe 409 e o cliente fecha limpo ───────────────────
describe("processos.vue — segundo envio do mesmo formulário (a resposta do 1º se perdeu)", () => {
  let app: App | null = null;
  let raiz: HTMLElement | null = null;
  let toasts: string[] = [];
  let fechou = 0;

  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  async function esperar(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  function enviar(): void {
    $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  // Mesma cola de handleSubmit/openCreateForm/closeForm de processos.vue.
  function abrirPagina(): void {
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp(
      defineComponent({
        setup() {
          const { iniciar, encerrar, criar } = useCriarProcesso();
          const { emAndamento: salvando, executar } = useTravaEnvio();
          iniciar(); // openCreateForm
          async function handleSubmit(p: NewProcessoDTO): Promise<void> {
            await executar(async () => {
              try {
                const r = await criar(p);
                toasts.push(r.tipo === "ja_criado" ? MENSAGEM_PROCESSO_JA_CRIADO : "Processo adicionado");
                fechou++;
                encerrar(); // closeForm
              } catch (e) {
                toasts.push(getErrorMessage(e, "Erro ao adicionar processo"));
              }
            });
          }
          return () => (fechou === 0 ? h(ProcessoFormModal, { salvando: salvando.value, onSubmit: handleSubmit }) : h("p", { id: "fechado" }));
        },
      }),
    );
    app.mount(raiz);
  }

  beforeEach(() => {
    toasts = [];
    fechou = 0;
  });
  afterEach(() => {
    app?.unmount();
    raiz?.remove();
    app = null;
    raiz = null;
  });

  async function preencher(): Promise<void> {
    const campo = $<HTMLInputElement>("#pf-paciente")!;
    campo.value = "maria";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    $<HTMLButtonElement>("#pf-consultor")!.click();
    await nextTick();
    [...document.querySelectorAll<HTMLElement>("#pf-consultor-listbox [role='option']")]
      .find((o) => texto(o) === "Dani")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await nextTick();
  }

  it("1º envio: a rede cai e o erro aparece; o servidor tinha criado. 2º envio: mesmo id, 409 → fecha com aviso neutro e recarrega", async () => {
    // O servidor simulado guarda os ids já criados (a chave primária).
    const criados = new Set<string>();
    listaDoServidor = [processoCriado("proc_criado_pelo_1o")];
    responderPost = (n, corpo) => {
      const id = String(corpo.id);
      if (criados.has(id)) return { status: 409, corpo: { statusMessage: MENSAGEM_PROCESSO_JA_CRIADO } };
      criados.add(id); // o INSERT aconteceu...
      if (n === 1) throw new TypeError("Failed to fetch"); // ...mas a resposta nunca chegou
      return { status: 201, corpo: processoCriado(id) };
    };

    abrirPagina();
    await esperar();
    await preencher();

    enviar();
    await esperar();
    expect(posts()).toHaveLength(1);
    expect(fechou, "erro de rede: o formulário continua aberto").toBe(0);
    expect(toasts).toHaveLength(1);
    expect($("#btn-save-processo")).not.toBeNull();
    expect(($("#btn-save-processo") as HTMLButtonElement).disabled, "reabilitou após o erro").toBe(false);

    enviar(); // a pessoa clica de novo
    await esperar();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body!.id, "o MESMO id do 1º envio").toBe(posts()[0]!.body!.id);
    expect(fechou).toBe(1);
    expect($("#fechado"), "fechou limpo").not.toBeNull();
    expect(toasts[1]).toBe("Esse processo já foi criado.");
    expect(toasts).not.toContain("Processo adicionado"); // sem toast de sucesso duplicado
    await vi.waitFor(() => expect(useProcessos().processos.value.map((p) => p.id)).toEqual(["proc_criado_pelo_1o"]));
  });

  it("envio normal (sem 409): um POST com id válido, toast de sucesso e fecha", async () => {
    abrirPagina();
    await esperar();
    await preencher();
    enviar();
    await esperar();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body!.id).toMatch(ID_VALIDO);
    expect(toasts).toEqual(["Processo adicionado"]);
    expect(fechou).toBe(1);
  });
});
