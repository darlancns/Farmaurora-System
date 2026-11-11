import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent } from "h3";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { ROLES, type Role } from "#shared/utils/rbac";
import type { Permissoes } from "#shared/utils/permissoesPagina";

// O middleware REAL (server/middleware/auth.ts) com o Supabase e o runtime do Nuxt simulados: a decisão de
// autorização é a de autorizarApi, e o que se confere aqui é a fiação — respostas (401/403, mensagem), o
// usuário em event.context.user e o cache de sessão de 8 s.
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

let contador = 0;

// Cada chamada usa um cookie de sessão diferente, para o cache de 8 s não misturar os casos.
function evento(path: string, metodo: string, cookie = `sb-test-auth-token=sessao-${++contador}`) {
  const req = { method: metodo, url: path, headers: { cookie } } as unknown as IncomingMessage;
  return createEvent(req, {} as unknown as ServerResponse);
}

function conta(role: Role | undefined, appMetadata: Record<string, unknown> = {}): User {
  return { id: "u1", email: "u@x.com", app_metadata: role ? { role, ...appMetadata } : appMetadata } as unknown as User;
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

beforeEach(() => {
  h.user.current = null;
  h.getUser.mockClear();
});

describe("middleware de autenticação — respostas idênticas às de antes", () => {
  it("sem sessão em /api/**: 401 'Não autenticado.' (inclusive /api/auth/me)", async () => {
    for (const path of ["/api/processos", "/api/auth/me", "/api/health"]) {
      const r = await chamar(path, "GET", null);
      expect(r).toMatchObject({ ok: false, status: 401, mensagem: "Não autenticado." });
    }
  });

  it("fora de /api/ não bloqueia, com ou sem sessão (a navegação é do middleware de rota)", async () => {
    expect((await chamar("/processos", "GET", null)).ok).toBe(true);
    expect((await chamar("/login", "GET", conta("consultor"))).ok).toBe(true);
  });

  it("/api/auth/** com sessão: qualquer cargo, qualquer método", async () => {
    for (const role of ROLES) {
      expect((await chamar("/api/auth/me", "GET", conta(role))).ok).toBe(true);
      expect((await chamar("/api/auth/conta/nome", "PATCH", conta(role))).ok).toBe(true);
    }
  });

  it("rota /api sem seção: 403 'Rota não autorizada.'", async () => {
    const r = await chamar("/api/health", "GET", conta("administrador"));
    expect(r).toMatchObject({ ok: false, status: 403, mensagem: "Rota não autorizada." });
  });

  it("sem permissão: 403 'Sem permissão para esta operação.' (consultor escrevendo em Processos)", async () => {
    const r = await chamar("/api/processos/abc", "PATCH", conta("consultor", { consultorNome: "Dani" }));
    expect(r).toMatchObject({ ok: false, status: 403, mensagem: "Sem permissão para esta operação." });
  });

  it("anexa o usuário resolvido (com cargo) em event.context.user", async () => {
    const r = await chamar("/api/processos", "GET", conta("operacional", { nome: "Bruno Alves" }));
    expect(r.ok).toBe(true);
    expect(r.event.context.user).toMatchObject({ role: "operacional", nome: "Bruno Alves", isAdmin: false });
  });
});

describe("middleware — cache de sessão de 8 s preservado", () => {
  it("mesmos cookies, duas requisições: getUser() uma vez só; cookie diferente: de novo", async () => {
    h.user.current = conta("socio");
    const cookie = "sb-test-auth-token=cache-1";
    await middleware(evento("/api/processos", "GET", cookie));
    await middleware(evento("/api/processos", "GET", cookie));
    expect(h.getUser).toHaveBeenCalledTimes(1);
    await middleware(evento("/api/processos", "GET", "sb-test-auth-token=cache-2"));
    expect(h.getUser).toHaveBeenCalledTimes(2);
  });

  it("o usuário em cache carrega o mapa de permissões (a decisão da 2ª requisição usa o mesmo mapa)", async () => {
    h.user.current = conta("operacional", { permissoes: { processos: "ver" } });
    const cookie = "sb-test-auth-token=cache-3";
    await middleware(evento("/api/processos", "GET", cookie));
    await expect(middleware(evento("/api/processos", "PATCH", cookie))).rejects.toMatchObject({ statusCode: 403 });
    expect(h.getUser).toHaveBeenCalledTimes(1);
  });
});

const COM_MAPA: Role[] = ["socio", "operacional"];

describe("middleware — com permissoes gravadas (socio e operacional)", () => {
  const ver: Permissoes = { processos: "ver", pagamentos: "nenhum", patients: "editar" };

  it.each(COM_MAPA)("%s com 'ver' em Processos: GET passa; POST/PUT/PATCH/DELETE levam 403 — inclusive /chegada e o PATCH de Mandado", async (role) => {
    const user = conta(role, { nome: "Bruno Alves", permissoes: ver });
    for (const path of ["/api/processos", "/api/processos/abc"]) {
      expect((await chamar(path, "GET", user)).ok, `GET ${path}`).toBe(true);
    }
    const escritas: [string, string][] = [
      ["POST", "/api/processos"],
      ["PATCH", "/api/processos/abc"],
      ["PUT", "/api/processos/abc"],
      ["DELETE", "/api/processos/abc"],
      ["POST", "/api/processos/abc/chegada"], // "chegou?" do sino: sem exceção
      ["PATCH", "/api/processos/abc"], // PATCH { alertaMandadoResolvido: true }: sem exceção
    ];
    for (const [metodo, path] of escritas) {
      const r = await chamar(path, metodo, user);
      expect(r, `${metodo} ${path}`).toMatchObject({ ok: false, status: 403, mensagem: "Sem permissão para esta operação." });
    }
  });

  it.each(COM_MAPA)("%s com 'nenhum' em Pagamentos: nem o GET passa", async (role) => {
    const user = conta(role, { permissoes: ver });
    for (const metodo of ["GET", "POST", "PATCH", "DELETE"]) {
      const r = await chamar("/api/pagamentos/banco", metodo, user);
      expect(r, metodo).toMatchObject({ ok: false, status: 403 });
    }
  });

  it.each(COM_MAPA)("%s com 'editar' em Prestação: lê e escreve", async (role) => {
    const user = conta(role, { permissoes: ver });
    for (const metodo of ["GET", "POST", "PUT", "DELETE"]) {
      expect((await chamar("/api/patients/abc", metodo, user)).ok, metodo).toBe(true);
    }
  });

  it.each(COM_MAPA)("%s com mapa ilegível: nega tudo nas seções do mapa", async (role) => {
    const user = conta(role, { permissoes: "editar" });
    for (const path of ["/api/processos", "/api/pagamentos/banco", "/api/patients"]) {
      expect((await chamar(path, "GET", user)).ok, path).toBe(false);
    }
  });

  it.each(COM_MAPA)("%s com tudo 'nenhum': Recados e /api/auth continuam abertos", async (role) => {
    const user = conta(role, { permissoes: { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" } });
    expect((await chamar("/api/recados", "POST", user)).ok).toBe(true);
    expect((await chamar("/api/notificacoes", "GET", user)).ok).toBe(true);
    expect((await chamar("/api/auth/me", "GET", user)).ok).toBe(true);
  });

  it("consultor e administrador NÃO são afetados por app_metadata.permissoes", async () => {
    const tudoNenhum = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };
    const consultor = conta("consultor", { consultorNome: "Dani", permissoes: tudoNenhum });
    expect((await chamar("/api/processos", "GET", consultor)).ok).toBe(true);
    expect((await chamar("/api/processos/abc", "PATCH", consultor)).ok).toBe(false); // consultor segue sem escrita
    expect((await chamar("/api/pagamentos/banco", "GET", consultor)).ok).toBe(false); // e sem Pagamentos
    const adm = conta("administrador", { permissoes: tudoNenhum });
    for (const [metodo, path] of [
      ["GET", "/api/processos"],
      ["POST", "/api/processos/abc/chegada"],
      ["POST", "/api/pagamentos/banco"],
      ["DELETE", "/api/patients/abc"],
      ["POST", "/api/admin/users"],
    ] as const) {
      expect((await chamar(path, metodo, adm)).ok, `${metodo} ${path}`).toBe(true);
    }
  });
});

describe("middleware — conta SEM mapa: mesma matriz de antes (cargo × path × método)", () => {
  // Esperado escrito à mão (a regra de WRITE_ACCESS/READ_ACCESS de antes desta mudança), não derivado do código.
  const matriz: Record<string, { ler: Role[]; escrever: Role[] }> = {
    "/api/processos": { ler: ["consultor", "socio", "operacional", "administrador"], escrever: ["socio", "operacional", "administrador"] },
    "/api/processos/abc/chegada": { ler: ["consultor", "socio", "operacional", "administrador"], escrever: ["socio", "operacional", "administrador"] },
    "/api/pagamentos/banco": { ler: ["socio", "operacional", "administrador"], escrever: ["socio", "operacional", "administrador"] },
    "/api/patients": { ler: ["socio", "administrador"], escrever: ["socio", "administrador"] },
    "/api/attachments/signed-urls": { ler: ["socio", "administrador"], escrever: ["socio", "administrador"] },
    // Contas: só o administrador, inclusive a leitura (antes o sócio também lia).
    "/api/admin/users": { ler: ["administrador"], escrever: ["administrador"] },
    "/api/recados": { ler: ["consultor", "socio", "operacional", "administrador"], escrever: ["consultor", "socio", "operacional", "administrador"] },
    "/api/contas": { ler: ["consultor", "socio", "operacional", "administrador"], escrever: ["consultor", "socio", "operacional", "administrador"] },
    "/api/lembretes": { ler: ["consultor", "socio", "operacional", "administrador"], escrever: ["consultor", "socio", "operacional", "administrador"] },
  };

  it("cada cargo × path × método dá exatamente o resultado esperado", async () => {
    for (const [path, { ler, escrever }] of Object.entries(matriz)) {
      for (const role of ROLES) {
        const user = conta(role, role === "consultor" ? { consultorNome: "Dani" } : {});
        for (const metodo of ["GET", "HEAD"]) {
          expect((await chamar(path, metodo, user)).ok, `${role} ${metodo} ${path}`).toBe(ler.includes(role));
        }
        for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
          expect((await chamar(path, metodo, user)).ok, `${role} ${metodo} ${path}`).toBe(escrever.includes(role));
        }
      }
    }
  });
});
