import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { linhaConsultor, TABELA_CONSULTORES as T } from "./helpers/consultoresFixtures";

// GET/POST/PATCH /api/cadastros/consultores (a 5ª lista). Handlers e store REAIS; só h3 (readBody/getRouterParam) e o cliente
// Supabase (em memória) são simulados. Mesmas regras das outras listas: GET para todos os cargos, POST/PATCH só do
// administrador; nome imutável; "Outro" reservado; nome repetido (pela chave, ativos e inativos) é 409; remover = desativar.
// Só itens "TESTE": nenhum nome de paciente.

const h = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string | undefined> }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_event: unknown, nome: string) => h.params[nome]),
  };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: listar } = await import("../../server/api/cadastros/[lista]/index.get");
const { default: criar } = await import("../../server/api/cadastros/[lista]/index.post");
const { default: alterar } = await import("../../server/api/cadastros/[lista]/[id].patch");

const LISTA = { lista: "consultores" };

const conta = (role: AuthUser["role"], nome?: string): AuthUser => ({
  id: `u_${role}`,
  email: `${role}@x.com`,
  role,
  nome,
  isAdmin: role === "administrador",
});
const admin = conta("administrador", "Cris Admin");
const NAO_ADMIN: AuthUser["role"][] = ["socio", "operacional", "consultor"];

async function chamar<R>(handler: (e: never) => Promise<R>, user: AuthUser | null, params: Record<string, string>, body?: unknown) {
  h.body = body;
  h.params = params;
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

function semear(): void {
  fake.tabelas[T] = [
    linhaConsultor("Consultor Teste", true, { id: "cons_a" }),
    linhaConsultor("Junior Teste", false, { id: "cons_b" }),
  ];
}

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chamadas.length = 0;
});

describe("GET /api/cadastros/consultores — todos os cargos", () => {
  it("devolve ativos e inativos (ativo primeiro, inativo no fim) para qualquer cargo", async () => {
    semear();
    for (const role of ["administrador", ...NAO_ADMIN] as const) {
      const r = await chamar(listar, conta(role), LISTA);
      expect(r.map((i) => [i.nome, i.ativo]), role).toEqual([
        ["Consultor Teste", true],
        ["Junior Teste", false],
      ]);
    }
  });

  it("a resposta tem só os campos da base (sem chavePix, para nenhum cargo)", async () => {
    semear();
    const r = await chamar(listar, admin, LISTA);
    expect(Object.keys(r[0]!).sort()).toEqual(["ativo", "atualizadoPor", "createdAt", "id", "nome", "updatedAt"]);
    expect(fake.selects.at(-1)).toEqual({ tabela: T, colunas: "*" });
  });
});

describe("POST /api/cadastros/consultores — só administrador", () => {
  it("administrador cria (200): nasce ativo, id cons_…, nome_chave sem acento/caixa, nome da conta em atualizadoPor", async () => {
    const r = await chamar(criar, admin, LISTA, { nome: "  André   Teste " });
    expect(r).toMatchObject({ nome: "André Teste", ativo: true, atualizadoPor: "Cris Admin" });
    expect(r.id).toMatch(/^cons_/);
    expect(fake.linhas(T)).toHaveLength(1);
    expect(fake.linhas(T)[0]).toMatchObject({ nome: "André Teste", nome_chave: "andre teste", ativo: true });
  });

  it("sócio, operacional, consultor e sem login levam 403 — nada é gravado", async () => {
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(criar, user, LISTA, { nome: "Consultor Teste" }))).status, user?.role ?? "sem login").toBe(403);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it('"Outro" é reservado (400, qualquer caixa), nome vazio e campo extra também são 400', async () => {
    const reservado = await erroDe(chamar(criar, admin, LISTA, { nome: "outro" }));
    expect(reservado.status).toBe(400);
    expect(reservado.msg).toMatch(/reservado/);
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "  " }))).status).toBe(400);
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "Consultor Teste", chavePix: "x" }))).status).toBe(400);
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("nome repetido de consultor ATIVO é 409 (pela chave: ignora caixa, acento e espaços); nada novo é gravado", async () => {
    semear();
    for (const nome of ["Consultor Teste", "consultor teste", "CONSULTOR   TESTE", "Cônsultor Téste"]) {
      const e = await erroDe(chamar(criar, admin, LISTA, { nome }));
      expect(e.status, nome).toBe(409);
      expect(e.msg).toBe("Já existe um item com esse nome.");
    }
    expect(fake.linhas(T)).toHaveLength(2);
  });

  it("nome repetido de consultor INATIVO também é 409, e a mensagem manda reativar (a tela oferece o botão Reativar)", async () => {
    semear();
    const e = await erroDe(chamar(criar, admin, LISTA, { nome: "junior teste" }));
    expect(e.status).toBe(409);
    expect(e.msg).toBe("Já existe um item inativo com esse nome. Reative-o em vez de criar outro.");
    expect(fake.linhas(T)).toHaveLength(2);
  });
});

describe("PATCH /api/cadastros/consultores/:id — só administrador; nome não muda; remover = desativar", () => {
  it("administrador desativa e reativa (PATCH ativo), com o nome da conta em atualizadoPor", async () => {
    semear();
    const off = await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { ativo: false });
    expect(off).toMatchObject({ nome: "Consultor Teste", ativo: false, atualizadoPor: "Cris Admin" });
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ ativo: false });
    const on = await chamar(alterar, admin, { ...LISTA, id: "cons_b" }, { ativo: true });
    expect(on).toMatchObject({ nome: "Junior Teste", ativo: true });
    expect(fake.linhas(T).find((l) => l.id === "cons_b")).toMatchObject({ ativo: true });
  });

  it("Reativar o item inativo que bloqueou a criação: depois da reativação o nome volta ao Cadastro como ativo", async () => {
    semear();
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "Junior Teste" }))).status).toBe(409);
    const r = await chamar(alterar, admin, { ...LISTA, id: "cons_b" }, { ativo: true });
    expect(r.ativo).toBe(true);
    expect((await chamar(listar, admin, LISTA)).filter((i) => i.ativo).map((i) => i.nome)).toEqual(["Consultor Teste", "Junior Teste"]);
  });

  it("sócio, operacional, consultor e sem login levam 403 — nada é alterado", async () => {
    semear();
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(alterar, user, { ...LISTA, id: "cons_a" }, { ativo: false }))).status).toBe(403);
    }
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ ativo: true });
  });

  it("tentar mudar o NOME é 422 com mensagem clara; o nome e a chave gravados não mudam", async () => {
    semear();
    const e = await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Consultor Novo" }));
    expect(e.status).toBe(422);
    expect(e.msg).toMatch(/nome não pode ser alterado/i);
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ nome: "Consultor Teste", nome_chave: "consultor teste" });
  });

  it("o MESMO nome no corpo é aceito (idempotente) e só o ativo muda", async () => {
    semear();
    const r = await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Consultor Teste", ativo: false });
    expect(r).toMatchObject({ nome: "Consultor Teste", ativo: false });
  });

  it("404 para item inexistente; 400 para corpo inválido ou campo de outra lista", async () => {
    semear();
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "nao-existe" }, { ativo: false }))).status).toBe(404);
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { ativo: "x" }))).status).toBe(400);
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, {}))).status).toBe(400);
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { chavePix: "x" }))).status).toBe(400);
  });
});

describe("sem exclusão", () => {
  it("nenhuma operação do fluxo completo (criar, desativar, reativar) chama delete no banco", async () => {
    await chamar(criar, admin, LISTA, { nome: "Consultor Teste" });
    const id = String(fake.linhas(T)[0]!.id);
    await chamar(alterar, admin, { ...LISTA, id }, { ativo: false });
    await chamar(alterar, admin, { ...LISTA, id }, { ativo: true });
    expect(fake.chamadas.some((c) => c.op === "delete")).toBe(false);
  });

  it("não existe rota DELETE em /api/cadastros", () => {
    const pasta = join(process.cwd(), "server", "api", "cadastros", "[lista]");
    expect(existsSync(pasta)).toBe(true);
    expect(readdirSync(pasta).filter((f) => /delete/i.test(f))).toEqual([]);
  });
});
