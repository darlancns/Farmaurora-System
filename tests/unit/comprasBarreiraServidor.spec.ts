import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent } from "h3";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import {
  MENSAGEM_API_NAO_AUTENTICADO,
  MENSAGEM_API_SEM_PERMISSAO,
  NIVEIS_PERMISSAO,
  autorizarApi,
  permissoesTudoNenhum,
  type Permissoes,
} from "#shared/utils/permissoesPagina";
import { ROLES, isWriteMethod, sectionForApiPath, type Role } from "#shared/utils/rbac";

// A barreira de servidor de /api/compras/**: a regra (sectionForApiPath + autorizarApi) e o middleware REAL com o Supabase simulado.
// As rotas /api/compras ainda NÃO existem; o middleware roda antes de qualquer rota, então a regra já vale e o que se prova aqui é
// ela: leitura (GET) exige ler a seção, escrita (POST, PUT, PATCH, DELETE) exige escrever; consultor e quem não tem permissão levam 403.

const h = vi.hoisted(() => ({
  user: { current: null as unknown },
  getUser: vi.fn(),
}));

vi.mock("#imports", () => ({
  useRuntimeConfig: () => ({ public: { supabaseUrl: "http://supabase.test", supabaseAnonKey: "anon" }, adminEmails: "" }),
}));

vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => {
        h.getUser();
        return { data: { user: h.user.current } };
      },
    },
  }),
}));

import middleware from "../../server/middleware/auth";

const CAMINHOS = ["/api/compras", "/api/compras/", "/api/compras/12", "/api/compras/12/encaminhar", "/api/compras/12?x=1", "/api/compras?mes=11"];
const LEITURA = ["GET", "HEAD"] as const;
const ESCRITA = ["POST", "PUT", "PATCH", "DELETE"] as const;

describe("sectionForApiPath — /api/compras", () => {
  it("o prefixo e as subrotas (com ou sem query) mapeiam para a seção compras", () => {
    for (const p of CAMINHOS) expect(sectionForApiPath(p), p).toBe("compras");
  });

  it("prefixos parecidos continuam NEGADOS por padrão (seção nula = 403)", () => {
    for (const p of ["/api/compra", "/api/comprasx", "/api/compras-extra/a", "/api/x/compras"]) expect(sectionForApiPath(p), p).toBeNull();
  });

  it("as outras rotas não mudaram", () => {
    expect(sectionForApiPath("/api/dir/1")).toBe("dir");
    expect(sectionForApiPath("/api/pagamentos")).toBe("pagamentos");
    expect(sectionForApiPath("/api/cadastros/medicamentos")).toBe("config");
  });

  it("os métodos de escrita são os de sempre (POST, PUT, PATCH, DELETE)", () => {
    for (const m of ESCRITA) expect(isWriteMethod(m), m).toBe(true);
    for (const m of LEITURA) expect(isWriteMethod(m), m).toBe(false);
  });
});

// [lê, escreve] por cargo (conta sem mapa).
const REGRA: Record<Role, [boolean, boolean]> = {
  administrador: [true, true],
  operacional: [true, true],
  socio: [true, false],
  consultor: [false, false],
};

describe("autorizarApi — /api/compras/** sem mapa na conta (regra do cargo)", () => {
  for (const role of ROLES) {
    const [le, escreve] = REGRA[role];
    it(`${role}: leitura ${le ? "permitida" : "403"}, escrita ${escreve ? "permitida" : "403"}`, () => {
      for (const p of CAMINHOS) {
        for (const m of LEITURA) {
          expect(autorizarApi({ role }, p, m).permitido, `${role} ${m} ${p}`).toBe(le);
        }
        for (const m of ESCRITA) {
          expect(autorizarApi({ role }, p, m).permitido, `${role} ${m} ${p}`).toBe(escreve);
        }
      }
    });
  }

  it("o consultor leva 403 com a mensagem de sempre, em qualquer método", () => {
    for (const m of [...LEITURA, ...ESCRITA]) {
      expect(autorizarApi({ role: "consultor" }, "/api/compras/1", m)).toEqual({
        permitido: false,
        status: 403,
        mensagem: MENSAGEM_API_SEM_PERMISSAO,
      });
    }
  });

  it("o sócio lê, mas toda escrita é 403", () => {
    expect(autorizarApi({ role: "socio" }, "/api/compras", "GET")).toEqual({ permitido: true });
    for (const m of ESCRITA) expect(autorizarApi({ role: "socio" }, "/api/compras", m), m).toMatchObject({ permitido: false, status: 403 });
  });

  it("sem sessão é 401, não 403", () => {
    for (const m of [...LEITURA, ...ESCRITA]) {
      expect(autorizarApi(null, "/api/compras", m)).toEqual({ permitido: false, status: 401, mensagem: MENSAGEM_API_NAO_AUTENTICADO });
      expect(autorizarApi(undefined, "/api/compras/1", m)).toMatchObject({ status: 401 });
    }
  });
});

describe("autorizarApi — /api/compras/** com mapa na conta (sócio e operacional)", () => {
  for (const role of ["socio", "operacional"] as const) {
    for (const nivel of NIVEIS_PERMISSAO) {
      it(`${role} com compras = "${nivel}"`, () => {
        const permissoes: Permissoes = { ...permissoesTudoNenhum(), compras: nivel };
        for (const m of LEITURA) expect(autorizarApi({ role, permissoes }, "/api/compras/1", m).permitido, m).toBe(nivel !== "nenhum");
        for (const m of ESCRITA) expect(autorizarApi({ role, permissoes }, "/api/compras/1", m).permitido, m).toBe(nivel === "editar");
      });
    }

    it(`${role} com mapa SEM a chave compras: 403 em tudo (mesmo se tudo o mais fosse 'editar')`, () => {
      const permissoes: Permissoes = { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar" };
      for (const m of [...LEITURA, ...ESCRITA]) expect(autorizarApi({ role, permissoes }, "/api/compras", m), m).toMatchObject({ permitido: false, status: 403 });
    });
  }

  it("o consultor continua sem acesso mesmo com um mapa que diria 'editar' (o mapa não vale para ele)", () => {
    const permissoes: Permissoes = { ...permissoesTudoNenhum(), compras: "editar" };
    expect(autorizarApi({ role: "consultor", permissoes }, "/api/compras", "GET")).toMatchObject({ permitido: false, status: 403 });
    expect(autorizarApi({ role: "consultor", permissoes }, "/api/compras", "POST")).toMatchObject({ permitido: false, status: 403 });
  });

  it("o nível de compras não abre nem fecha as outras APIs", () => {
    const permissoes: Permissoes = { ...permissoesTudoNenhum(), compras: "editar" };
    expect(autorizarApi({ role: "operacional", permissoes }, "/api/processos", "GET")).toMatchObject({ permitido: false, status: 403 });
    expect(autorizarApi({ role: "operacional", permissoes }, "/api/dir", "GET")).toMatchObject({ permitido: false, status: 403 });
  });
});

// ── O middleware real ─────────────────────────────────────────────────────────────────────────────────────────

let contador = 0;

// Cada chamada usa um cookie de sessão diferente, para o cache de 8 s do middleware não misturar os casos.
function evento(path: string, metodo: string) {
  const req = { method: metodo, url: path, headers: { cookie: `sb-test-auth-token=sessao-${++contador}` } } as unknown as IncomingMessage;
  return createEvent(req, {} as unknown as ServerResponse);
}

function conta(role: Role, appMetadata: Record<string, unknown> = {}): User {
  return { id: "u1", email: "u@x.com", app_metadata: { role, ...appMetadata } } as unknown as User;
}

async function chamar(path: string, metodo: string, user: User | null) {
  h.user.current = user;
  try {
    await middleware(evento(path, metodo));
    return { ok: true as const };
  } catch (e) {
    const erro = e as { statusCode: number; statusMessage: string };
    return { ok: false as const, status: erro.statusCode, mensagem: erro.statusMessage };
  }
}

beforeEach(() => {
  h.user.current = null;
  h.getUser.mockClear();
});

describe("o middleware REAL em /api/compras/**", () => {
  it("administrador e operacional (sem mapa): leem e escrevem", async () => {
    for (const role of ["administrador", "operacional"] as const) {
      for (const m of ["GET", "POST", "PATCH", "DELETE"]) {
        expect((await chamar("/api/compras/1", m, conta(role))).ok, `${role} ${m}`).toBe(true);
      }
    }
  });

  it("sócio (sem mapa): GET passa; POST, PUT, PATCH e DELETE levam 403", async () => {
    expect((await chamar("/api/compras", "GET", conta("socio"))).ok).toBe(true);
    for (const m of ESCRITA) {
      const r = await chamar("/api/compras/1", m, conta("socio"));
      expect(r, m).toMatchObject({ ok: false, status: 403, mensagem: MENSAGEM_API_SEM_PERMISSAO });
    }
  });

  it("consultor: 403 em leitura e em escrita", async () => {
    for (const m of ["GET", "POST"]) {
      expect(await chamar("/api/compras", m, conta("consultor", { consultorNome: "Consultor Teste" })), m).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("sem sessão: 401", async () => {
    expect(await chamar("/api/compras", "GET", null)).toMatchObject({ ok: false, status: 401, mensagem: MENSAGEM_API_NAO_AUTENTICADO });
  });

  it("conta COM mapa lido do app_metadata: 'nenhum' e mapa sem a chave bloqueiam; 'ver' só lê; 'editar' escreve", async () => {
    const com = (compras: unknown) => conta("operacional", { permissoes: { processos: "editar", ...(compras === undefined ? {} : { compras }) } });
    expect(await chamar("/api/compras", "GET", com(undefined))).toMatchObject({ ok: false, status: 403 }); // gravado antes de Compras
    expect(await chamar("/api/compras", "GET", com("nenhum"))).toMatchObject({ ok: false, status: 403 });
    expect((await chamar("/api/compras", "GET", com("ver"))).ok).toBe(true);
    expect(await chamar("/api/compras", "POST", com("ver"))).toMatchObject({ ok: false, status: 403 });
    expect((await chamar("/api/compras", "POST", com("editar"))).ok).toBe(true);
    expect(await chamar("/api/compras", "GET", com("lixo"))).toMatchObject({ ok: false, status: 403 });
  });

  it("sócio com mapa compras='editar' escreve (o mapa vale no lugar do cargo)", async () => {
    const socio = conta("socio", { permissoes: { compras: "editar" } });
    expect((await chamar("/api/compras", "POST", socio)).ok).toBe(true);
  });

  it("uma rota parecida (/api/comprasx) continua negada por padrão para todos os cargos", async () => {
    for (const role of ROLES) expect(await chamar("/api/comprasx", "GET", conta(role)), role).toMatchObject({ ok: false, status: 403 });
  });
});
