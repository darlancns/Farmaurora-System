import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import {
  SECOES_COM_PERMISSAO,
  permissoesTudoNenhum,
  validarPermissoesEstrito,
  type Permissoes,
} from "../../shared/utils/permissoesPagina";
import { parseContaInput, parsePermissoesInput, roleAppMetadata, roleAppMetadataEdicao, toAdminUserSummary } from "../../server/utils/authUser";

// API de Contas com as permissões por página: POST /api/admin/users, PATCH /api/admin/users/:id e GET /api/admin/users
// com h3 (readBody/getRouterParam) e o Supabase Auth simulados — o fake guarda o app_metadata e faz o MERGE RASO do
// GoTrue (chave com null é removida), então o estado FINAL da conta é conferido, não só a chamada.
const h = vi.hoisted(() => ({
  body: {} as unknown,
  alvo: "alvo",
  contas: new Map<string, { email: string; app_metadata: Record<string, unknown> }>(),
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.alvo) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser: h.createUser, updateUserById: h.updateUserById, listUsers: h.listUsers } },
  }),
}));

import postHandler from "../../server/api/admin/users.post";
import patchHandler from "../../server/api/admin/users/[id].patch";
import getHandler from "../../server/api/admin/users.get";

const administrador: AuthUser = { id: "adm", email: "adm@x.com", role: "administrador", nome: "Adm", isAdmin: true };
const outro = (role: AuthUser["role"]): AuthUser => ({ id: "u9", email: "u9@x.com", role, nome: "Fulano", isAdmin: role === "administrador" });

async function chamar<T>(handler: (e: never) => Promise<T>, user: AuthUser | null, body: unknown): Promise<T> {
  h.body = body;
  return handler({ context: { user } } as never);
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

function semNulos(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined));
}

// Conta de partida no "banco" do fake.
function semear(id: string, app_metadata: Record<string, unknown>): void {
  h.contas.set(id, { email: `${id}@x.com`, app_metadata });
}
const metadataFinal = (id: string) => h.contas.get(id)!.app_metadata;

const NENHUM = permissoesTudoNenhum();
const MAPA: Permissoes = { processos: "ver", pagamentos: "editar", patients: "ver" };

beforeEach(() => {
  h.body = {};
  h.alvo = "alvo";
  h.contas.clear();
  h.createUser.mockReset().mockImplementation(async (attrs: { email: string; app_metadata: Record<string, unknown> }) => {
    h.contas.set("novo", { email: attrs.email, app_metadata: semNulos(attrs.app_metadata) });
    return { data: { user: { id: "novo", email: attrs.email } }, error: null };
  });
  h.updateUserById.mockReset().mockImplementation(async (id: string, attrs: { app_metadata: Record<string, unknown> }) => {
    const conta = h.contas.get(id);
    if (!conta) return { data: { user: null }, error: { status: 404, message: "not found" } };
    conta.app_metadata = semNulos({ ...conta.app_metadata, ...attrs.app_metadata }); // merge raso do GoTrue
    return { data: { user: { id, email: conta.email, app_metadata: conta.app_metadata, created_at: "" } }, error: null };
  });
  h.listUsers.mockReset().mockImplementation(async () => ({
    data: {
      users: [...h.contas.entries()].map(([id, c]) => ({ id, email: c.email, app_metadata: c.app_metadata, created_at: "" })),
      nextPage: null,
    },
    error: null,
  }));
  semear("adm", { role: "administrador", nome: "Adm" }); // evita o bloqueio do "único administrador"
});

const NOVA = { email: "nova@x.com", password: "senha-forte-123", nome: "Nova Pessoa" };

// ── validação estrita ────────────────────────────────────────────────────────────────────────────────
const INVALIDOS: Array<[string, unknown]> = [
  ["texto", "editar"],
  ["número", 1],
  ["booleano", true],
  ["lista", ["processos"]],
  ["seção desconhecida (compras)", { compras: "ver" }],
  ["seção de outra área (admin)", { admin: "editar" }],
  ["seção de outra área (recados)", { recados: "ver" }],
  ["seção de outra área (config)", { config: "ver" }],
  ["chave __proto__", JSON.parse('{"__proto__":"ver"}')],
  ["valor em maiúsculas", { processos: "EDITAR" }],
  ["valor vazio", { processos: "" }],
  ["valor numérico", { processos: 1 }],
  ["valor nulo", { processos: null }],
  ["valor booleano", { processos: true }],
  ["valor objeto", { processos: {} }],
  ["valor desconhecido", { processos: "total" }],
  ["uma boa e uma ruim", { processos: "ver", pagamentos: "tudo" }],
  ["uma boa e uma desconhecida", { processos: "ver", outra: "ver" }],
];

describe("validação estrita de permissoes (400, nada é gravado)", () => {
  it.each(INVALIDOS)("POST socio com %s → 400", async (_nome, permissoes) => {
    const e = await erroDe(chamar(postHandler, administrador, { ...NOVA, role: "socio", permissoes }));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/Permissões inválidas/);
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it.each(INVALIDOS)("PATCH operacional com %s → 400 e a conta fica intacta", async (_nome, permissoes) => {
    semear("alvo", { role: "operacional", nome: "Bruno", permissoes: MAPA });
    const antes = JSON.stringify(metadataFinal("alvo"));
    const e = await erroDe(chamar(patchHandler, administrador, { role: "operacional", permissoes }));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/Permissões inválidas/);
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(JSON.stringify(metadataFinal("alvo"))).toBe(antes);
  });

  it("a mensagem diz o que está errado: a seção desconhecida e o valor inválido", async () => {
    const secao = await erroDe(chamar(postHandler, administrador, { ...NOVA, role: "socio", permissoes: { compras: "ver" } }));
    expect(secao.msg).toContain('"compras"');
    expect(secao.msg).toContain("processos, pagamentos, patients");
    const valor = await erroDe(chamar(postHandler, administrador, { ...NOVA, role: "socio", permissoes: { patients: "x" } }));
    expect(valor.msg).toContain('"patients"');
    expect(valor.msg).toContain('"nenhum", "ver" ou "editar"');
  });

  it("validarPermissoesEstrito: mapa vazio é válido e vira tudo 'nenhum'; seção ausente = 'nenhum'", () => {
    expect(validarPermissoesEstrito({})).toEqual({ ok: true, permissoes: NENHUM });
    expect(validarPermissoesEstrito({ processos: "editar" })).toEqual({
      ok: true,
      permissoes: { processos: "editar", pagamentos: "nenhum", patients: "nenhum" },
    });
    expect(validarPermissoesEstrito(MAPA)).toEqual({ ok: true, permissoes: MAPA });
  });

  it("os 3 valores e as 4 seções são aceitos, sem exceção", () => {
    for (const secao of SECOES_COM_PERMISSAO) {
      for (const nivel of ["nenhum", "ver", "editar"]) {
        const r = validarPermissoesEstrito({ [secao]: nivel });
        expect(r.ok, `${secao}=${nivel}`).toBe(true);
      }
    }
  });
});

describe("cargos que não usam mapa (consultor e administrador): permissoes de verdade é RECUSADA (400)", () => {
  it.each([
    ["consultor", { role: "consultor", consultorNome: "André Vitório" }],
    ["administrador", { role: "administrador" }],
  ])("%s: POST e PATCH com objeto → 400; com null ou ausente → aceito e sem mapa", async (_cargo, base) => {
    const post = await erroDe(chamar(postHandler, administrador, { ...NOVA, ...base, permissoes: MAPA }));
    expect(post.status).toBe(400);
    expect(post.msg).toMatch(/não usa permissões por página/);
    expect(h.createUser).not.toHaveBeenCalled();

    semear("alvo", { role: "socio", nome: "X", permissoes: MAPA });
    const patch = await erroDe(chamar(patchHandler, administrador, { ...base, permissoes: MAPA }));
    expect(patch.status).toBe(400);
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(metadataFinal("alvo").permissoes).toEqual(MAPA); // nada foi gravado

    for (const permissoes of [null, undefined]) {
      h.createUser.mockClear();
      await chamar(postHandler, administrador, { ...NOVA, email: `a${String(permissoes)}@x.com`, ...base, permissoes });
      const meta = h.createUser.mock.calls[0]![0].app_metadata as Record<string, unknown>;
      expect(meta).not.toHaveProperty("permissoes");
    }
  });

  it("valor inválido enviado para esses cargos também é 400 (não é ignorado)", async () => {
    for (const permissoes of ["x", 0, [], false]) {
      expect((await erroDe(chamar(postHandler, administrador, { ...NOVA, role: "administrador", permissoes }))).status).toBe(400);
    }
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────────────────────────────
describe("POST /api/admin/users", () => {
  it.each(["socio", "operacional"] as const)("%s SEM permissoes nasce com TODAS as seções 'nenhum'", async (role) => {
    const r = await chamar(postHandler, administrador, { ...NOVA, role });
    const meta = h.createUser.mock.calls[0]![0].app_metadata as Record<string, unknown>;
    expect(meta.permissoes).toEqual(NENHUM);
    expect(meta.role).toBe(role);
    expect(r.permissoes).toEqual(NENHUM);
  });

  it.each(["socio", "operacional"] as const)("%s com permissoes null: também nasce com tudo 'nenhum'", async (role) => {
    await chamar(postHandler, administrador, { ...NOVA, role, permissoes: null });
    expect((h.createUser.mock.calls[0]![0].app_metadata as Record<string, unknown>).permissoes).toEqual(NENHUM);
  });

  it.each(["socio", "operacional"] as const)("%s com mapa: grava o mapa COMPLETO (seção ausente = 'nenhum')", async (role) => {
    const r = await chamar(postHandler, administrador, { ...NOVA, role, permissoes: { processos: "editar", patients: "ver" } });
    const esperado = { processos: "editar", pagamentos: "nenhum", patients: "ver" };
    expect((h.createUser.mock.calls[0]![0].app_metadata as Record<string, unknown>).permissoes).toEqual(esperado);
    expect(r.permissoes).toEqual(esperado);
  });

  it("consultor e administrador nunca recebem mapa (a chave nem existe) e a resposta traz permissoes: null", async () => {
    const consultor = await chamar(postHandler, administrador, { ...NOVA, role: "consultor", consultorNome: "André Vitório" });
    expect(h.createUser.mock.calls[0]![0].app_metadata).not.toHaveProperty("permissoes");
    expect(consultor.permissoes).toBeNull();
    const adm = await chamar(postHandler, administrador, { ...NOVA, email: "b@x.com", role: "administrador" });
    expect(h.createUser.mock.calls[1]![0].app_metadata).not.toHaveProperty("permissoes");
    expect(adm.permissoes).toBeNull();
  });

  it("a conta criada, lida pelo servidor, tem o mapa gravado e o resumo o devolve", async () => {
    await chamar(postHandler, administrador, { ...NOVA, role: "operacional", permissoes: MAPA });
    const resumo = toAdminUserSummary({ id: "novo", email: "nova@x.com", app_metadata: metadataFinal("novo") } as never);
    expect(resumo.permissoes).toEqual(MAPA);
  });
});

// ── PATCH ────────────────────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/admin/users/:id — semântica do campo permissoes", () => {
  it("AUSENTE preserva o mapa gravado (abrir 'Editar' e salvar não muda ninguém)", async () => {
    semear("alvo", { role: "operacional", nome: "Bruno", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "operacional", nome: "Bruno" });
    expect(h.updateUserById.mock.calls[0]![1].app_metadata).not.toHaveProperty("permissoes");
    expect(metadataFinal("alvo").permissoes).toEqual(MAPA);
  });

  it("AUSENTE em conta SEM mapa (o Bruno de hoje) continua sem mapa — nada é gravado nem convertido", async () => {
    semear("alvo", { role: "operacional", nome: "Bruno Alves" });
    await chamar(patchHandler, administrador, { role: "operacional", nome: "Bruno Alves" });
    expect(h.updateUserById.mock.calls[0]![1].app_metadata).not.toHaveProperty("permissoes");
    expect(metadataFinal("alvo")).not.toHaveProperty("permissoes");
    const resumo = toAdminUserSummary({ id: "alvo", email: "a@x.com", app_metadata: metadataFinal("alvo") } as never);
    expect(resumo.permissoes).toBeNull();
  });

  it("AUSENTE com o campo `nome` omitido também preserva o nome (comportamento de antes)", async () => {
    semear("alvo", { role: "socio", nome: "Nome Editado", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "socio" });
    expect(metadataFinal("alvo")).toMatchObject({ nome: "Nome Editado", permissoes: MAPA });
  });

  it("null APAGA o mapa (volta ao padrão do cargo)", async () => {
    semear("alvo", { role: "operacional", nome: "Bruno", permissoes: MAPA });
    const r = await chamar(patchHandler, administrador, { role: "operacional", permissoes: null });
    expect(h.updateUserById.mock.calls[0]![1].app_metadata).toMatchObject({ permissoes: null });
    expect(metadataFinal("alvo")).not.toHaveProperty("permissoes");
    expect(r.permissoes).toBeNull();
  });

  it("objeto GRAVA o mapa completo (seção ausente = 'nenhum'), mesmo sobre uma conta sem mapa", async () => {
    semear("alvo", { role: "socio", nome: "Sócio" });
    const r = await chamar(patchHandler, administrador, { role: "socio", permissoes: { patients: "editar" } });
    const esperado = { processos: "nenhum", pagamentos: "nenhum", patients: "editar" };
    expect(metadataFinal("alvo").permissoes).toEqual(esperado);
    expect(r.permissoes).toEqual(esperado);
  });

  it("objeto substitui o mapa anterior por inteiro (não faz merge por seção)", async () => {
    semear("alvo", { role: "operacional", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "operacional", permissoes: { patients: "editar" } });
    expect(metadataFinal("alvo").permissoes).toEqual({ processos: "nenhum", pagamentos: "nenhum", patients: "editar" });
  });

  it("trocar para consultor ou administrador GRAVA permissoes null (limpa o mapa do cargo anterior)", async () => {
    semear("alvo", { role: "operacional", nome: "X", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "consultor", consultorNome: "André Vitório" });
    expect(h.updateUserById.mock.calls[0]![1].app_metadata).toMatchObject({ permissoes: null });
    expect(metadataFinal("alvo")).not.toHaveProperty("permissoes");

    semear("alvo", { role: "socio", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "administrador" });
    expect(metadataFinal("alvo")).not.toHaveProperty("permissoes");
  });

  it("trocar entre socio e operacional MANTÉM o mapa, a menos que venha outro", async () => {
    semear("alvo", { role: "socio", nome: "X", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "operacional" });
    expect(metadataFinal("alvo")).toMatchObject({ role: "operacional", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "socio" });
    expect(metadataFinal("alvo")).toMatchObject({ role: "socio", permissoes: MAPA });
    await chamar(patchHandler, administrador, { role: "operacional", permissoes: { processos: "editar" } });
    expect(metadataFinal("alvo").permissoes).toEqual({ processos: "editar", pagamentos: "nenhum", patients: "nenhum" });
  });

  it("trocar de administrador para operacional sem mapa NÃO inventa um mapa (conta sem mapa = padrão do cargo)", async () => {
    semear("alvo", { role: "administrador", nome: "X" });
    semear("outro-adm", { role: "administrador" });
    await chamar(patchHandler, administrador, { role: "operacional" });
    expect(metadataFinal("alvo")).not.toHaveProperty("permissoes");
  });
});

// ── só o administrador ───────────────────────────────────────────────────────────────────────────────
describe("só o administrador altera contas e permissões", () => {
  it.each(["socio", "operacional", "consultor"] as const)("%s: POST e PATCH com permissoes válidas → 403 e nada é gravado", async (role) => {
    semear("alvo", { role: "operacional", nome: "Bruno" });
    const antes = JSON.stringify(metadataFinal("alvo"));
    expect((await erroDe(chamar(postHandler, outro(role), { ...NOVA, role: "socio", permissoes: MAPA }))).status).toBe(403);
    expect((await erroDe(chamar(patchHandler, outro(role), { role: "operacional", permissoes: MAPA }))).status).toBe(403);
    expect((await erroDe(chamar(patchHandler, outro(role), { role: "operacional", permissoes: INVALIDOS[0]![1] }))).status).toBe(403);
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(JSON.stringify(metadataFinal("alvo"))).toBe(antes);
  });

  it("sem sessão → 403 (o middleware devolve 401 antes; o handler também recusa)", async () => {
    expect((await erroDe(chamar(postHandler, null, { ...NOVA, role: "socio" }))).status).toBe(403);
    expect((await erroDe(chamar(patchHandler, null, { role: "socio" }))).status).toBe(403);
  });
});

// ── GET ──────────────────────────────────────────────────────────────────────────────────────────────
describe("GET /api/admin/users — Contas só do administrador", () => {
  it.each(["socio", "operacional", "consultor"] as const)("%s → 403 (o sócio deixou de ler a lista)", async (role) => {
    const e = await erroDe(chamar(getHandler, outro(role), {}));
    expect(e.status).toBe(403);
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it("sem sessão → 403", async () => {
    expect((await erroDe(chamar(getHandler, null, {}))).status).toBe(403);
  });

  it("administrador lê, e o resumo traz permissoes (mapa completo ou null)", async () => {
    semear("bruno", { role: "operacional", nome: "Bruno" }); // sem mapa
    semear("rebeca", { role: "operacional", nome: "Rebeca", permissoes: { processos: "ver" } });
    semear("socio1", { role: "socio", nome: "Sócio", permissoes: MAPA });
    semear("cons", { role: "consultor", consultorNome: "André Vitório", permissoes: MAPA }); // chave ignorada
    const lista = await chamar(getHandler, administrador, {});
    const por = Object.fromEntries(lista.map((c) => [c.id, c.permissoes]));
    expect(por.bruno).toBeNull();
    expect(por.rebeca).toEqual({ processos: "ver", pagamentos: "nenhum", patients: "nenhum" });
    expect(por.socio1).toEqual(MAPA);
    expect(por.cons).toBeNull();
    expect(por.adm).toBeNull();
    expect(lista.every((c) => "permissoes" in c)).toBe(true);
  });
});

// ── funções puras ────────────────────────────────────────────────────────────────────────────────────
describe("roleAppMetadata, roleAppMetadataEdicao, parsePermissoesInput e toAdminUserSummary", () => {
  it("roleAppMetadata: sem o 4º parâmetro a chave não existe (contrato de antes); com ele, entra", () => {
    expect(roleAppMetadata("operacional")).toEqual({ role: "operacional", consultorNome: null, nome: null });
    expect(roleAppMetadata("socio", undefined, "Ana", MAPA)).toEqual({ role: "socio", consultorNome: null, nome: "Ana", permissoes: MAPA });
  });

  it("roleAppMetadataEdicao: undefined omite, null apaga, objeto grava", () => {
    expect(roleAppMetadataEdicao("socio")).not.toHaveProperty("permissoes");
    expect(roleAppMetadataEdicao("socio", undefined, undefined, undefined)).not.toHaveProperty("permissoes");
    expect(roleAppMetadataEdicao("socio", undefined, undefined, null)).toMatchObject({ permissoes: null });
    expect(roleAppMetadataEdicao("socio", undefined, undefined, MAPA)).toMatchObject({ permissoes: MAPA });
  });

  it("parsePermissoesInput devolve a ação certa em cada modo e cargo", () => {
    expect(parsePermissoesInput({}, "operacional", "criacao")).toEqual({ acao: "gravar", permissoes: NENHUM });
    expect(parsePermissoesInput({}, "operacional", "edicao")).toEqual({ acao: "manter" });
    expect(parsePermissoesInput({ permissoes: null }, "socio", "edicao")).toEqual({ acao: "apagar" });
    expect(parsePermissoesInput({}, "consultor", "criacao")).toEqual({ acao: "manter" });
    expect(parsePermissoesInput({}, "consultor", "edicao")).toEqual({ acao: "apagar" });
    expect(parsePermissoesInput({ permissoes: { patients: "ver" } }, "socio", "edicao")).toMatchObject({ acao: "gravar" });
  });

  it("parseContaInput: o cargo é validado ANTES (cargo inválido = 400 do cargo)", () => {
    expect(() => parseContaInput({ role: "chefe", permissoes: MAPA }, "edicao")).toThrow(/Cargo inválido/);
    expect(parseContaInput({ role: "operacional" }, "edicao")).toEqual({ role: "operacional", consultorNome: undefined, permissoes: { acao: "manter" } });
  });

  it("toAdminUserSummary: socio/operacional com mapa → mapa completo sanitizado; sem mapa e outros cargos → null", () => {
    const resumo = (app_metadata: Record<string, unknown>) =>
      toAdminUserSummary({ id: "x", email: "x@x.com", app_metadata } as never).permissoes;
    expect(resumo({ role: "socio", permissoes: { processos: "EDITAR", patients: "ver" } })).toEqual({
      processos: "nenhum",
      pagamentos: "nenhum",
      patients: "ver",
    });
    expect(resumo({ role: "operacional" })).toBeNull();
    expect(resumo({ role: "administrador", permissoes: MAPA })).toBeNull();
    expect(resumo({ role: "consultor", consultorNome: "André Vitório", permissoes: MAPA })).toBeNull();
    expect(resumo({ role: "operacional", permissoes: "lixo" })).toEqual(NENHUM);
  });
});
