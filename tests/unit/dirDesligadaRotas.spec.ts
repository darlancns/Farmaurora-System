import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import { createEvent } from "h3";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import type { AuthUser } from "#shared/types/auth";
import { ROLES, type Role } from "#shared/utils/rbac";
import type { Permissoes } from "#shared/utils/permissoesPagina";
import { definirSecoesDesligadas, religarTodasAsSecoes } from "#shared/utils/secoesDesligadas";

// Com a DIR desligada (padrão do app sem NUXT_PUBLIC_DIR_HABILITADA=true): (1) o guarda de rotas REAL (authz.global.ts) manda quem abre
// /dir para a página inicial da pessoa; (2) o middleware REAL de API (server/middleware/auth.ts) responde 404 em /api/dir* ANTES de consultar
// a sessão. Os dois com o runtime do Nuxt e o Supabase simulados, como authzGlobal.spec.ts e middlewareAuth.spec.ts.

const h = vi.hoisted(() => ({
  estados: new Map<string, unknown>(),
  user: { current: null as unknown },
  getUser: vi.fn(),
}));

vi.mock("#app", () => ({
  defineNuxtRouteMiddleware: <T>(fn: T): T => fn,
  navigateTo: (to: string, opcoes?: unknown) => ({ redireciona: to, opcoes }),
  useRequestEvent: () => undefined,
  useState: <T>(chave: string, init?: () => T): Ref<T> => {
    if (!h.estados.has(chave)) h.estados.set(chave, ref(init ? init() : undefined));
    return h.estados.get(chave) as Ref<T>;
  },
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

import guarda from "../../app/middleware/authz.global";
import middleware from "../../server/middleware/auth";

// ── guarda de rotas ─────────────────────────────────────────────────────────────────────────────────────
type Resultado = { redireciona: string; opcoes?: unknown } | undefined;

function estado<T>(chave: string, inicial: T): Ref<T> {
  if (!h.estados.has(chave)) h.estados.set(chave, ref(inicial));
  return h.estados.get(chave) as Ref<T>;
}

function entrar(role: Role, permissoes?: Permissoes): void {
  const user: AuthUser = { id: "u1", email: "u@x.com", role, isAdmin: role === "administrador", ...(permissoes ? { permissoes } : {}) };
  estado<AuthUser | null>("auth-user", null).value = user;
}

async function ir(path: string): Promise<Resultado> {
  return (await (guarda as unknown as (to: { path: string }) => Promise<Resultado>)({ path })) as Resultado;
}

beforeEach(() => {
  h.estados.clear();
  estado<AuthUser | null>("auth-user", null);
  estado<boolean>("auth-user-loaded", true);
  h.user.current = null;
  h.getUser.mockClear();
});

afterEach(() => {
  religarTodasAsSecoes();
});

describe("guarda de rotas com a DIR desligada", () => {
  it("LIGADA (padrão): operacional e administrador abrem /dir (sanidade)", async () => {
    entrar("operacional");
    expect(await ir("/dir")).toBeUndefined();
    entrar("administrador");
    expect(await ir("/dir/qualquer")).toBeUndefined();
  });

  it.each(ROLES)("%s: /dir e /dir/** redirecionam para a página inicial (/processos), nunca para a própria /dir", async (role) => {
    definirSecoesDesligadas(["dir"]);
    entrar(role);
    for (const rota of ["/dir", "/dir/x", "/dir/x/y"]) {
      expect(await ir(rota), `${role} ${rota}`).toMatchObject({ redireciona: "/processos" });
    }
  });

  it("conta com mapa que só dá a DIR: vai para /recados (aberto a todos), sem loop", async () => {
    definirSecoesDesligadas(["dir"]);
    entrar("operacional", { processos: "nenhum", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "nenhum" });
    expect(await ir("/dir")).toMatchObject({ redireciona: "/recados" });
    expect(await ir("/recados")).toBeUndefined();
  });

  it("conta com mapa que dá DIR e Compras: /dir vai para /compras, e /compras abre", async () => {
    definirSecoesDesligadas(["dir"]);
    entrar("operacional", { processos: "nenhum", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "ver" });
    expect(await ir("/dir")).toMatchObject({ redireciona: "/compras" });
    expect(await ir("/compras")).toBeUndefined();
  });

  it("as outras páginas seguem como antes (administrador abre todas; '/' vai para a inicial)", async () => {
    definirSecoesDesligadas(["dir"]);
    entrar("administrador");
    for (const rota of ["/processos", "/pagamentos", "/prestacao", "/compras", "/recados", "/configuracoes"]) {
      expect(await ir(rota), rota).toBeUndefined();
    }
    expect(await ir("/")).toMatchObject({ redireciona: "/processos" });
  });
});

// ── middleware de API ───────────────────────────────────────────────────────────────────────────────────
let contador = 0;

function evento(path: string, metodo: string, cookie = `sb-test-auth-token=sessao-${++contador}`) {
  const req = { method: metodo, url: path, headers: { cookie } } as unknown as IncomingMessage;
  return createEvent(req, {} as unknown as ServerResponse);
}

function conta(role: Role): User {
  return { id: "u1", email: "u@x.com", app_metadata: { role } } as unknown as User;
}

async function chamar(path: string, metodo: string, user: User | null) {
  h.user.current = user;
  const event = evento(path, metodo);
  try {
    await middleware(event);
    return { ok: true as const, event };
  } catch (e) {
    const erro = e as { statusCode: number; statusMessage: string };
    return { ok: false as const, event, status: erro.statusCode, mensagem: erro.statusMessage };
  }
}

describe("middleware de API com a DIR desligada: /api/dir* responde 404", () => {
  const rotas = ["/api/dir", "/api/dir/abc", "/api/dir/opcoes", "/api/dir?mes=2026-11"];
  const metodos = ["GET", "POST", "PATCH", "DELETE"];

  it("LIGADA (padrão): administrador passa em /api/dir e quem não tem sessão leva 401 (sanidade)", async () => {
    expect((await chamar("/api/dir", "GET", conta("administrador"))).ok).toBe(true);
    expect(await chamar("/api/dir", "GET", null)).toMatchObject({ ok: false, status: 401 });
  });

  it("404 'Não encontrado.' para administrador, operacional e SEM sessão, em todo método, e a sessão nem é consultada", async () => {
    definirSecoesDesligadas(["dir"]);
    for (const user of [conta("administrador"), conta("operacional"), conta("consultor"), null]) {
      for (const metodo of metodos) {
        for (const rota of rotas) {
          const r = await chamar(rota, metodo, user);
          expect(r, `${metodo} ${rota}`).toMatchObject({ ok: false, status: 404, mensagem: "Não encontrado." });
        }
      }
    }
    expect(h.getUser).not.toHaveBeenCalled(); // 404 ANTES da autorização: sem ida ao Supabase
  });

  it("o resto da API não muda: /api/processos e /api/compras seguem o 401/403/permitido de sempre", async () => {
    definirSecoesDesligadas(["dir"]);
    expect(await chamar("/api/processos", "GET", null)).toMatchObject({ ok: false, status: 401, mensagem: "Não autenticado." });
    expect((await chamar("/api/compras/opcoes", "GET", conta("operacional"))).ok).toBe(true);
    expect(await chamar("/api/compras", "GET", conta("consultor"))).toMatchObject({ ok: false, status: 403 });
    expect((await chamar("/api/auth/me", "GET", conta("administrador"))).ok).toBe(true);
  });

  it("páginas (fora de /api/) não são tocadas, nem /dir: quem redireciona é o guarda de rotas", async () => {
    definirSecoesDesligadas(["dir"]);
    expect((await chamar("/dir", "GET", conta("administrador"))).ok).toBe(true);
    expect((await chamar("/dir", "GET", null)).ok).toBe(true);
  });
});
