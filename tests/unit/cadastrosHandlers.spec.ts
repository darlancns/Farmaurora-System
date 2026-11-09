import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// GET/POST/PATCH /api/cadastros/:lista. Os handlers e o store são os REAIS; só h3 (readBody/getRouterParam) e o cliente
// Supabase (em memória) são simulados. O middleware não roda aqui (ver cadastrosRbac.spec.ts para a matriz por cargo):
// o que se prova é a SEGUNDA camada — o handler recusa quem não é administrador — e as respostas de erro.

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

const T = "cadastro_fornecedores";

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

const NOVO = { nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false };

function semear(extra: Record<string, unknown> = {}): void {
  fake.tabelas[T] = [
    {
      id: "forn_1",
      nome: "Poros",
      nome_chave: "poros",
      pais: null,
      prazo_alerta_dias: null,
      sem_alerta: true,
      ativo: true,
      atualizado_por: null,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
      ...extra,
    },
  ];
}

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chamadas.length = 0;
});

describe("GET /api/cadastros/:lista", () => {
  it("devolve a lista (ativos e inativos) para qualquer cargo — o handler não restringe leitura", async () => {
    semear();
    for (const role of ["administrador", ...NAO_ADMIN] as const) {
      const r = await chamar(listar, conta(role), { lista: "fornecedores" });
      expect(r, role).toHaveLength(1);
    }
  });

  it("lista desconhecida é 404", async () => {
    expect((await erroDe(chamar(listar, admin, { lista: "bancos" }))).status).toBe(404);
  });
});

describe("POST /api/cadastros/:lista — só administrador", () => {
  it("administrador cria (200) e o item nasce ativo, com o nome da conta em atualizadoPor", async () => {
    const r = await chamar(criar, admin, { lista: "fornecedores" }, NOVO);
    expect(r).toMatchObject({ nome: "Poros", ativo: true, atualizadoPor: "Cris Admin" });
  });

  it("sócio, operacional, consultor e sem login levam 403 — nada é gravado", async () => {
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(criar, user, { lista: "fornecedores" }, NOVO))).status, user?.role ?? "sem login").toBe(403);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("400 sem decidir o prazo, 422 nome reservado, 409 duplicado", async () => {
    expect((await erroDe(chamar(criar, admin, { lista: "fornecedores" }, { nome: "Matsun" }))).status).toBe(400);
    const reservado = await erroDe(chamar(criar, admin, { lista: "fornecedores" }, { ...NOVO, nome: "Outro" }));
    expect(reservado.status).toBe(400);
    expect(reservado.msg).toMatch(/reservado/);
    await chamar(criar, admin, { lista: "fornecedores" }, NOVO);
    expect((await erroDe(chamar(criar, admin, { lista: "fornecedores" }, { ...NOVO, nome: "poros" }))).status).toBe(409);
  });

  it("lista desconhecida é 404", async () => {
    expect((await erroDe(chamar(criar, admin, { lista: "x" }, NOVO))).status).toBe(404);
  });
});

describe("PATCH /api/cadastros/:lista/:id — só administrador, nome não muda", () => {
  it("administrador altera país e desativa", async () => {
    semear();
    const r = await chamar(alterar, admin, { lista: "fornecedores", id: "forn_1" }, { pais: "Turquia", ativo: false });
    expect(r).toMatchObject({ pais: "Turquia", ativo: false, atualizadoPor: "Cris Admin" });
  });

  it("sócio, operacional, consultor e sem login levam 403 — nada é alterado", async () => {
    semear();
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(alterar, user, { lista: "fornecedores", id: "forn_1" }, { ativo: false }))).status).toBe(403);
    }
    expect(fake.linhas(T)[0]).toMatchObject({ ativo: true });
  });

  it("tentar mudar o NOME é 422 com mensagem clara; o nome gravado não muda", async () => {
    semear();
    const e = await erroDe(chamar(alterar, admin, { lista: "fornecedores", id: "forn_1" }, { nome: "Poros Novo" }));
    expect(e.status).toBe(422);
    expect(e.msg).toMatch(/nome não pode ser alterado/i);
    expect(fake.linhas(T)[0]).toMatchObject({ nome: "Poros", nome_chave: "poros" });
  });

  it("404 para item inexistente; 400 para corpo inválido", async () => {
    semear();
    expect((await erroDe(chamar(alterar, admin, { lista: "fornecedores", id: "nao-existe" }, { ativo: false }))).status).toBe(404);
    expect((await erroDe(chamar(alterar, admin, { lista: "fornecedores", id: "forn_1" }, { ativo: "x" }))).status).toBe(400);
    expect((await erroDe(chamar(alterar, admin, { lista: "fornecedores", id: "forn_1" }, { semAlerta: true }))).status).toBe(400);
  });
});
