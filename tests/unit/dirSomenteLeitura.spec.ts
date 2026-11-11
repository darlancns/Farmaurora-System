// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Dir } from "../../shared/types/dir";
import type { Permissoes } from "../../shared/utils/permissoesPagina";
import { agruparPorPaciente } from "../../app/utils/dirFiltros";
import { novoDir } from "./helpers/dirFixtures";

// A DIR com o mapa de permissões: "editar" (e contas sem mapa) = como sempre; "ver" = abre só para consulta, sem
// nenhum caminho de gravação. Componentes e página REAIS no happy-dom (o GlobalHeader é trocado por um casco que só
// repassa os slots, porque o sino/menu da conta não fazem parte desta verificação).

vi.mock("../../app/components/GlobalHeader.vue", () => ({
  default: defineComponent({
    props: { title: { type: String, default: "" }, subtitle: { type: String, default: "" } },
    setup(_, { slots }) {
      return () => h("div", [slots.filters?.(), slots.tabs?.()]);
    },
  }),
}));

import DirFechamentosList from "../../app/components/dir/DirFechamentosList.vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import DirList from "../../app/components/dir/DirList.vue";
import DirPage from "../../app/pages/dir.vue";
import { useAuth } from "../../app/composables/useAuth";
import { useDir } from "../../app/composables/useDir";

// ── infraestrutura ───────────────────────────────────────────────────────────────────────────────────
const montados: Array<{ app: App; el: HTMLElement }> = [];

function montar(render: () => ReturnType<typeof h>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ app, el });
  return el;
}

async function esperar(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string): T[] => Array.from(document.querySelectorAll<T>(sel));
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const conta = (role: AuthUser["role"], permissoes?: Permissoes): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome: "Fulano",
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

const VER: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "ver", patients: "nenhum" };
const EDITAR: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "editar", patients: "nenhum" };

// ── fetch simulado (página) ──────────────────────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
}
let chamadas: Chamada[] = [];
let registrosDoServidor: Dir[] = [];

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  const method = opts?.method ?? "GET";
  chamadas.push({ url, method });
  if (url === "/api/dir" && method === "GET") return resposta(200, registrosDoServidor);
  if (url === "/api/dir" && method === "POST") return resposta(200, novoDir(JSON.parse(String(opts?.body))));
  const unico = /^\/api\/dir\/([^/]+)$/.exec(url);
  if (unico && method === "PATCH") {
    const atual = registrosDoServidor.find((r) => r.id === unico[1]);
    return resposta(200, { ...atual, ...JSON.parse(String(opts?.body)) });
  }
  return resposta(200, {});
}
const escritas = () => chamadas.filter((c) => c.method !== "GET");

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", fetchFalso);
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.app.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  useAuth().user.value = null;
  useDir().registros.value = [];
  vi.unstubAllGlobals();
});

// ── DirFormModal ─────────────────────────────────────────────────────────────────────────────────────
interface EventosModal {
  submit: unknown[];
  update: unknown[][];
  patch: unknown[][];
  delete: unknown[];
  close: number;
}

function abrirModal(editingDir: Dir | null, readonly: boolean | undefined): EventosModal {
  const ev: EventosModal = { submit: [], update: [], patch: [], delete: [], close: 0 };
  montar(() =>
    h(DirFormModal, {
      editingDir,
      contagemPorPo: new Map<string, number>(),
      ...(readonly === undefined ? {} : { readonly }),
      onSubmit: (p: unknown) => ev.submit.push(p),
      onUpdate: (...a: unknown[]) => ev.update.push(a),
      onPatch: (...a: unknown[]) => ev.patch.push(a),
      onDelete: (id: unknown) => ev.delete.push(id),
      onClose: () => (ev.close += 1),
    }),
  );
  return ev;
}

// Controles do formulário que o usuário poderia usar para MUDAR algo.
function controlesDoFormulario(): HTMLElement[] {
  return $$<HTMLElement>("#dir-form input, #dir-form button, #dir-form select, #dir-form textarea");
}
function ehSomenteLeitura(el: HTMLElement): boolean {
  const campo = el as HTMLInputElement | HTMLButtonElement;
  if (el.tagName === "BUTTON") return campo.disabled;
  const tipo = (el as HTMLInputElement).type;
  if (tipo === "checkbox") return (el as HTMLInputElement).disabled;
  return (el as HTMLInputElement).readOnly || (el as HTMLInputElement).disabled;
}

describe("DirFormModal — modo somente consulta ('ver')", () => {
  it("todos os campos, selects, datas e toggles ficam desabilitados; sem Salvar nem Excluir", async () => {
    const dir = novoDir({ po: "PO26-10-0900", dactes: true, conferido: true });
    abrirModal(dir, true);
    await esperar();

    expect($("#dir-form-somente-leitura")).not.toBeNull();
    expect(texto($("h2"))).toBe("Consultar PO26-10-0900");
    expect($("#btn-save-dir")).toBeNull();
    expect($("#btn-excluir-dir")).toBeNull();

    const controles = controlesDoFormulario();
    expect(controles.length).toBeGreaterThan(30); // campos de texto, ~12 selects, 4 datas, 11 checkboxes
    const editaveis = controles.filter((el) => el.id !== "btn-cancel-dir" && !ehSomenteLeitura(el));
    expect(editaveis.map((el) => el.id || el.tagName)).toEqual([]);

    // O estado aparece (o que está gravado continua visível), só não dá para mudar.
    expect(($("#df-conferido") as HTMLInputElement).checked).toBe(true);
    expect(($("#dir-check-dactes") as HTMLInputElement).checked).toBe(true);
    expect(($("#df-po") as HTMLInputElement).value).toBe("PO26-10-0900");
  });

  it("o único botão do rodapé é 'Fechar' e fecha o modal; nenhum evento de gravação sai", async () => {
    const ev = abrirModal(novoDir(), true);
    await esperar();
    expect(texto($("#btn-cancel-dir"))).toBe("Fechar");
    $("#btn-cancel-dir")!.click();
    await esperar();
    expect(ev.close).toBe(1);
    expect([ev.submit, ev.update, ev.patch, ev.delete].map((l) => l.length)).toEqual([0, 0, 0, 0]);
  });

  it("mesmo forçando eventos (change nos toggles, submit do formulário) nada é emitido", async () => {
    const ev = abrirModal(novoDir(), true);
    await esperar();
    for (const id of ["df-conferido", "df-operacao-encerrada", "df-fechamento-restante", "dir-check-dactes", "dir-check-swift"]) {
      $(id.startsWith("#") ? id : `#${id}`)!.dispatchEvent(new Event("change", { bubbles: true }));
    }
    $("#dir-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await esperar();
    expect([ev.submit, ev.update, ev.patch, ev.delete].map((l) => l.length)).toEqual([0, 0, 0, 0]);
  });

  it("não mostra a nota 'gravam na hora' (que só vale para quem edita)", async () => {
    abrirModal(novoDir(), true);
    await esperar();
    expect(texto($("#dir-form"))).not.toContain("gravam na hora");
  });
});

describe("DirFormModal — modo editar (e sem a prop): idêntico ao de hoje", () => {
  it.each([false, undefined])("readonly=%s: campos editáveis, Salvar e Excluir presentes, sem aviso de consulta", async (readonly) => {
    abrirModal(novoDir({ po: "PO26-10-0901" }), readonly);
    await esperar();
    expect($("#dir-form-somente-leitura")).toBeNull();
    expect(texto($("h2"))).toBe("Editar PO26-10-0901");
    expect(texto($("#btn-save-dir"))).toBe("Salvar alterações");
    expect($("#btn-excluir-dir")).not.toBeNull();
    expect(texto($("#btn-cancel-dir"))).toBe("Cancelar");
    const travados = controlesDoFormulario().filter((el) => ehSomenteLeitura(el));
    expect(travados.map((el) => el.id)).toEqual([]);
    expect(texto($("#dir-form"))).toContain("gravam na hora");
  });

  it("toggle grava na hora (patch) e 'Salvar alterações' envia o update", async () => {
    const dir = novoDir();
    const ev = abrirModal(dir, false);
    await esperar();
    ($("#df-conferido") as HTMLInputElement).click();
    ($("#dir-check-dactes") as HTMLInputElement).click();
    await esperar();
    expect(ev.patch).toEqual([
      [dir.id, { conferido: true }],
      [dir.id, { dactes: true }],
    ]);
    $("#dir-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await esperar();
    expect(ev.update.length).toBe(1);
    expect(ev.update[0]![0]).toBe(dir.id);
  });

  it("Novo PO (sem registro): 'Adicionar PO' e nenhum aviso de consulta", async () => {
    abrirModal(null, false);
    await esperar();
    expect(texto($("h2"))).toBe("Novo PO");
    expect(texto($("#btn-save-dir"))).toBe("+ Adicionar PO");
    expect($("#btn-excluir-dir")).toBeNull();
  });
});

// ── DirList / DirRow ─────────────────────────────────────────────────────────────────────────────────
describe("DirList / DirRow", () => {
  function montarLista(readonly: boolean | undefined) {
    const dir = novoDir({ po: "PO26-10-1000" });
    const eventos = { edit: [] as Dir[], patch: [] as unknown[][] };
    montar(() =>
      h(DirList, {
        registros: [dir],
        contagemPorPo: new Map<string, number>(),
        ...(readonly === undefined ? {} : { readonly }),
        onEdit: (d: Dir) => eventos.edit.push(d),
        onPatch: (...a: unknown[]) => eventos.patch.push(a),
      }),
    );
    return { dir, eventos };
  }

  it("'ver': o Conferido (cartão e linha) fica desabilitado e nada grava; abrir o PO continua funcionando", async () => {
    const { dir, eventos } = montarLista(true);
    await esperar();
    for (const sel of [`#dir-conferido-${dir.id}`, `#dir-card-conferido-${dir.id}`]) {
      const caixa = $<HTMLInputElement>(sel)!;
      expect(caixa.disabled).toBe(true);
      caixa.dispatchEvent(new Event("change", { bubbles: true })); // força, para provar o guarda de código
    }
    expect(eventos.patch).toEqual([]);
    $(`#dir-row-${dir.id}`)!.click();
    $(`#dir-card-${dir.id}`)!.click();
    expect(eventos.edit.length).toBe(2);
  });

  it.each([false, undefined])("readonly=%s: Conferido habilitado e grava (patch), como hoje", async (readonly) => {
    const { dir, eventos } = montarLista(readonly);
    await esperar();
    const caixa = $<HTMLInputElement>(`#dir-conferido-${dir.id}`)!;
    expect(caixa.disabled).toBe(false);
    caixa.click();
    await esperar();
    expect(eventos.patch).toEqual([[dir.id, { conferido: true }]]);
  });
});

// ── DirFechamentosList ───────────────────────────────────────────────────────────────────────────────
describe("DirFechamentosList", () => {
  function montarFechamentos(readonly: boolean | undefined) {
    const dir = novoDir({ po: "PO26-10-2000", fechamentoRestante: true });
    const ev = { incluir: 0, remover: 0, acoes: 0, edit: 0 };
    montar(() =>
      h(DirFechamentosList, {
        grupos: agruparPorPaciente([dir]),
        contagensBanco: [],
        bancoAtivo: "",
        ...(readonly === undefined ? {} : { readonly }),
        onIncluir: () => (ev.incluir += 1),
        "onRemover-desktop": () => (ev.remover += 1),
        "onAcoes-mobile": () => (ev.acoes += 1),
        onEdit: () => (ev.edit += 1),
      }),
    );
    return { dir, ev };
  }

  it("'ver': sem 'Incluir paciente', sem 'Remover' e sem o menu '⋯'; a lista segue visível e o PO abre", async () => {
    const { dir, ev } = montarFechamentos(true);
    await esperar();
    expect($("#btn-dir-incluir-fechamento")).toBeNull();
    expect($(`#btn-dir-fech-remover-${dir.id}`)).toBeNull();
    expect($(`#btn-dir-fech-acoes-${dir.id}`)).toBeNull();
    expect($(`#dir-fech-row-${dir.id}`)).not.toBeNull();
    $(`#dir-fech-row-${dir.id}`)!.click();
    expect(ev.edit).toBe(1);
    expect(ev.incluir + ev.remover + ev.acoes).toBe(0);
  });

  it.each([false, undefined])("readonly=%s: 'Incluir', 'Remover' e '⋯' presentes e funcionando, como hoje", async (readonly) => {
    const { dir, ev } = montarFechamentos(readonly);
    await esperar();
    $("#btn-dir-incluir-fechamento")!.click();
    $(`#btn-dir-fech-remover-${dir.id}`)!.click();
    $(`#btn-dir-fech-acoes-${dir.id}`)!.click();
    expect([ev.incluir, ev.remover, ev.acoes]).toEqual([1, 1, 1]);
  });
});

// ── Página /dir ──────────────────────────────────────────────────────────────────────────────────────
async function abrirPagina(user: AuthUser): Promise<Dir[]> {
  registrosDoServidor = [
    novoDir({ po: "PO26-10-3001", paciente: "PACIENTE UM" }),
    novoDir({ po: "PO26-10-3002", paciente: "PACIENTE DOIS", fechamentoRestante: true }),
  ];
  useAuth().user.value = user;
  // Já carregados (a busca do onMounted pode ser pulada pela janela anti-repetição do useDir, que é de módulo).
  useDir().registros.value = registrosDoServidor;
  montar(() => h(DirPage));
  await esperar();
  return registrosDoServidor;
}

async function irParaFechamentos(): Promise<void> {
  $("#tab-dir-fechamentos")!.click();
  await esperar();
}

const CONTROLES_DE_CRIAR = ["#btn-novo-dir", "#fab-novo-dir"];

describe("página /dir — conta com 'ver'", () => {
  it.each(["operacional", "socio"] as const)("%s: abre para consulta — nenhum botão de criar, incluir, remover ou salvar", async (role) => {
    const regs = await abrirPagina(conta(role, VER));
    for (const sel of CONTROLES_DE_CRIAR) expect($(sel), sel).toBeNull();
    expect($(`#dir-row-${regs[0]!.id}`)).not.toBeNull(); // a lista aparece
    await irParaFechamentos();
    for (const sel of ["#fab-incluir-fechamento", "#btn-dir-incluir-fechamento", ...CONTROLES_DE_CRIAR]) {
      expect($(sel), sel).toBeNull();
    }
    expect($$("[id^='btn-dir-fech-remover-']")).toEqual([]);
    expect($$("[id^='btn-dir-fech-acoes-']")).toEqual([]);
  });

  it("os Conferido da lista ficam desabilitados e, mesmo forçando o evento, nenhum PATCH sai", async () => {
    const regs = await abrirPagina(conta("operacional", VER));
    for (const r of regs) {
      const caixa = $<HTMLInputElement>(`#dir-conferido-${r.id}`)!;
      expect(caixa.disabled).toBe(true);
      caixa.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await esperar();
    expect(escritas()).toEqual([]);
  });

  it("abrir um PO mostra o modal só de consulta (sem Salvar/Excluir, tudo travado) e nada é gravado", async () => {
    const regs = await abrirPagina(conta("operacional", VER));
    $(`#dir-row-${regs[0]!.id}`)!.click();
    await esperar();
    expect($("#dir-form-modal-overlay")).not.toBeNull();
    expect($("#dir-form-somente-leitura")).not.toBeNull();
    expect($("#btn-save-dir")).toBeNull();
    expect($("#btn-excluir-dir")).toBeNull();
    expect(controlesDoFormulario().filter((el) => el.id !== "btn-cancel-dir" && !ehSomenteLeitura(el))).toEqual([]);
    for (const id of ["df-conferido", "dir-check-dactes"]) {
      $(`#${id}`)!.dispatchEvent(new Event("change", { bubbles: true }));
    }
    $("#dir-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await esperar();
    expect(escritas()).toEqual([]);
    $("#btn-close-dir-form")!.click();
    await esperar();
    expect($("#dir-form-modal-overlay")).toBeNull();
  });

  it("sem nenhuma chamada de escrita ao navegar pelas três abas", async () => {
    await abrirPagina(conta("operacional", VER));
    await irParaFechamentos();
    $("#tab-dir-encerradas")!.click();
    $("#tab-dir-em-aberto")!.click();
    await esperar();
    expect(escritas()).toEqual([]);
  });
});

describe("página /dir — 'editar' e conta sem mapa: como hoje", () => {
  const casos: Array<[string, AuthUser]> = [
    ["operacional com 'editar'", conta("operacional", EDITAR)],
    ["socio com 'editar'", conta("socio", EDITAR)],
    ["operacional SEM mapa", conta("operacional")],
    ["administrador SEM mapa", conta("administrador")],
    ["administrador com mapa 'ver' gravado (ignorado)", conta("administrador", VER)],
  ];

  it.each(casos)("%s: botões de criar e de incluir presentes", async (_nome, user) => {
    await abrirPagina(user);
    expect($("#btn-novo-dir")).not.toBeNull();
    expect($("#fab-novo-dir")).not.toBeNull();
    await irParaFechamentos();
    expect($("#fab-incluir-fechamento")).not.toBeNull();
    expect($("#btn-dir-incluir-fechamento")).not.toBeNull();
    expect($("#btn-novo-dir")).not.toBeNull();
    expect($$("[id^='btn-dir-fech-remover-']").length).toBe(1);
  });

  it.each(casos)("%s: Conferido habilitado grava (PATCH /api/dir/:id) e o modal abre editável", async (_nome, user) => {
    const regs = await abrirPagina(user);
    const caixa = $<HTMLInputElement>(`#dir-conferido-${regs[0]!.id}`)!;
    expect(caixa.disabled).toBe(false);
    caixa.click();
    await esperar();
    expect(escritas()).toEqual([{ url: `/api/dir/${regs[0]!.id}`, method: "PATCH" }]);

    $(`#dir-row-${regs[1]!.id}`)!.click();
    await esperar();
    expect($("#btn-save-dir")).not.toBeNull();
    expect($("#btn-excluir-dir")).not.toBeNull();
    expect($("#dir-form-somente-leitura")).toBeNull();
  });

  it("'+ Novo PO' abre o formulário de criação", async () => {
    await abrirPagina(conta("operacional"));
    $("#btn-novo-dir")!.click();
    await esperar();
    expect(texto($("h2"))).toBe("Novo PO");
    expect($("#btn-save-dir")).not.toBeNull();
  });
});

describe("página /dir — conta sem mapa que não lê a DIR", () => {
  it("sócio e consultor sem mapa continuam sem acesso à DIR (a página nem abre pelo guarda de rotas)", () => {
    for (const role of ["socio", "consultor"] as const) {
      useAuth().user.value = conta(role);
      expect(useAuth().canRead("dir")).toBe(false);
      expect(useAuth().canWrite("dir")).toBe(false);
    }
  });

  it("operacional e administrador sem mapa leem e escrevem na DIR", () => {
    for (const role of ["operacional", "administrador"] as const) {
      useAuth().user.value = conta(role);
      expect(useAuth().canRead("dir")).toBe(true);
      expect(useAuth().canWrite("dir")).toBe(true);
    }
  });
});
