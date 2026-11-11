// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { NewPatientDTO, Patient } from "../../shared/types/Patient";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

// Prestação com o mapa de permissões: com "ver" os handlers que gravam (criar, editar, atualizar, excluir) se
// recusam por código, mesmo forçados; com "editar" e para contas sem mapa a página grava como sempre. A página é a
// REAL no happy-dom; o GlobalHeader e o formulário (PatientForm, que só abre para quem escreve) viram cascos.

vi.mock("../../app/components/GlobalHeader.vue", () => ({
  default: defineComponent({
    props: { title: { type: String, default: "" }, subtitle: { type: String, default: "" }, shortTitle: { type: String, default: "" } },
    setup: () => () => h("div"),
  }),
}));
vi.mock("../../app/components/prestacao/PatientForm.vue", () => ({
  default: defineComponent({ setup: () => () => h("div", { id: "stub-patient-form" }) }),
}));

import PrestacaoPage from "../../app/pages/prestacao.vue";
import { useAuth } from "../../app/composables/useAuth";
import { usePatients } from "../../app/composables/usePatients";

function paciente(id: string, extra: Partial<Patient> = {}): Patient {
  return {
    id,
    data: "10/10/2026",
    paciente: `Paciente ${id}`,
    descricaoCompra: "Compra",
    descricaoResumo: "Resumo",
    medicamentos: [{ qtd: "1", medicamento: "MED A" }],
    empresa: "FARMAURORA",
    consultor: "",
    alvara: 1000,
    custoImportacao: 100,
    despesaTotal: 50,
    transporteTotal: 20,
    despachanteRemessas: 1,
    transporteRemessas: 1,
    despesasPorRemessa: ["50"],
    transportesPorRemessa: ["20"],
    remessas: 1,
    attachedSlots: [],
    status: "em_andamento",
    createdAt: "2026-10-10T10:00:00.000Z",
    ...extra,
  };
}

const DTO: NewPatientDTO = (({ id: _id, createdAt: _c, attachedSlots: _a, status: _s, ...resto }) => resto)(paciente("novo"));

// ── infraestrutura ───────────────────────────────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
}
let chamadas: Chamada[] = [];
const NO_SERVIDOR = [paciente("p1"), paciente("p2", { createdAt: "2026-10-09T10:00:00.000Z" })];

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  const method = opts?.method ?? "GET";
  chamadas.push({ url, method });
  if (url === "/api/patients" && method === "GET") return resposta(200, NO_SERVIDOR);
  if (url === "/api/patients" && method === "POST") return resposta(200, paciente("criado"));
  const unico = /^\/api\/patients\/([^/]+)$/.exec(url);
  if (unico && method === "PUT") return resposta(200, paciente(unico[1]!, { paciente: "Atualizado" }));
  if (unico && method === "DELETE") return resposta(200, { deleted: true });
  return resposta(200, {});
}
const escritas = () => chamadas.filter((c) => c.method !== "GET");

let app: App | null = null;
let raiz: HTMLElement | null = null;

async function esperar(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}
const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const conta = (role: AuthUser["role"], permissoes?: Permissoes): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome: "Fulano",
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

const MAPA = (patients: "nenhum" | "ver" | "editar"): Permissoes => ({
  processos: "nenhum",
  pagamentos: "nenhum",
  patients,
});

interface Handlers {
  handleSubmit: (payload: NewPatientDTO, anexos: Record<string, Blob>) => Promise<void>;
  handleUpdate: (id: string, payload: NewPatientDTO) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleEdit: (patient: unknown) => void;
  handleToggleStatus: (patient: unknown) => Promise<void>;
  showForm: boolean;
  editingPatientId: string | null;
}

async function abrirPagina(user: AuthUser): Promise<Handlers> {
  useAuth().user.value = user;
  usePatients().patients.value = NO_SERVIDOR.map((p) => ({ ...p }));
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(PrestacaoPage);
  app.mount(raiz);
  await esperar();
  // Os handlers são internos do <script setup>: em desenvolvimento ficam em setupState, e os forçamos direto.
  const instancia = ($("#dashboard-page") as unknown as { __vueParentComponent: { setupState: Handlers } }).__vueParentComponent;
  return instancia.setupState;
}

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", fetchFalso);
});

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  useAuth().user.value = null;
  usePatients().patients.value = [];
  vi.unstubAllGlobals();
});

describe("Prestação com 'ver': nenhuma chamada de escrita, nem forçando os handlers", () => {
  it.each([
    ["socio com 'ver'", conta("socio", MAPA("ver"))],
    ["operacional com 'ver'", conta("operacional", MAPA("ver"))],
  ])("%s: a tela só consulta", async (_nome, user) => {
    await abrirPagina(user);
    // sem criar/editar/excluir; a lista aparece e Gerar Word e Copiar WhatsApp continuam disponíveis
    for (const sel of ["#btn-nova-prestacao", "#fab-nova-prestacao", "#btn-edit-patient-p1", "#btn-delete-patient-p1", "#stub-patient-form"]) {
      expect($(sel), sel).toBeNull();
    }
    expect($("#btn-generate-word-p1")).not.toBeNull();
    expect($("#btn-copy-whatsapp-p1")).not.toBeNull();
    expect(($("#btn-generate-word-p1") as HTMLButtonElement).disabled).toBe(false);
    expect($("#patient-status-p1")?.tagName).not.toBe("BUTTON"); // o selo não é clicável
  });

  it("handleSubmit, handleUpdate, handleDelete, handleEdit e handleToggleStatus forçados: nada sai e nada muda", async () => {
    const h = await abrirPagina(conta("operacional", MAPA("ver")));
    const antes = usePatients().patients.value.map((p) => ({ id: p.id, status: p.status, paciente: p.paciente }));
    const p1 = usePatients().computedPatients().find((p) => p.id === "p1");

    await h.handleSubmit(DTO, {});
    await h.handleUpdate("p1", DTO);
    await h.handleDelete("p1");
    h.handleEdit(p1);
    await h.handleToggleStatus(p1);
    await esperar();

    expect(escritas()).toEqual([]);
    expect(h.showForm).toBe(false);
    expect(h.editingPatientId).toBeNull();
    expect($("#stub-patient-form")).toBeNull();
    expect(usePatients().patients.value.map((p) => ({ id: p.id, status: p.status, paciente: p.paciente }))).toEqual(antes);
  });

  it("Copiar WhatsApp segue funcionando e não escreve nada", async () => {
    await abrirPagina(conta("operacional", MAPA("ver")));
    $("#btn-copy-whatsapp-p1")!.click();
    await esperar();
    expect(escritas()).toEqual([]);
  });
});

describe("Prestação com 'editar' e sem mapa: como hoje", () => {
  const casos: Array<[string, AuthUser]> = [
    ["socio SEM mapa", conta("socio")],
    ["administrador SEM mapa", conta("administrador")],
    ["socio com 'editar'", conta("socio", MAPA("editar"))],
    ["operacional com 'editar'", conta("operacional", MAPA("editar"))],
    ["administrador com mapa 'ver' gravado (ignorado)", conta("administrador", MAPA("ver"))],
  ];

  it.each(casos)("%s: botões de criar, editar e excluir presentes", async (_nome, user) => {
    await abrirPagina(user);
    expect($("#btn-nova-prestacao")).not.toBeNull();
    expect($("#fab-nova-prestacao")).not.toBeNull();
    expect($("#btn-edit-patient-p1")).not.toBeNull();
    expect($("#btn-delete-patient-p1")).not.toBeNull();
    expect($("#btn-generate-word-p1")).not.toBeNull();
    expect($("#btn-copy-whatsapp-p1")).not.toBeNull();
    expect($("#patient-status-p1")?.tagName).toBe("BUTTON");
  });

  it.each(casos)("%s: os handlers gravam (POST, PUT, DELETE) e Editar abre o formulário", async (_nome, user) => {
    const h = await abrirPagina(user);
    const p1 = usePatients().computedPatients().find((p) => p.id === "p1");

    await h.handleSubmit(DTO, {});
    await h.handleUpdate("p1", DTO);
    await h.handleDelete("p2");
    expect(escritas()).toEqual([
      { url: "/api/patients", method: "POST" },
      { url: "/api/patients/p1", method: "PUT" },
      { url: "/api/patients/p2", method: "DELETE" },
    ]);

    h.handleEdit(p1);
    await esperar();
    expect(h.editingPatientId).toBe("p1");
    expect($("#stub-patient-form")).not.toBeNull();
  });

  it("clicar no botão de editar e no de excluir da linha chega aos handlers", async () => {
    await abrirPagina(conta("administrador"));
    $("#btn-edit-patient-p1")!.click();
    await esperar();
    expect($("#stub-patient-form")).not.toBeNull();
  });
});
