import { describe, it, expect } from "vitest";
import {
  AUTHENTICATED_ANY_API_PREFIXES,
  canReadSection,
  canWriteSection,
  defaultRouteForRole,
  isAuthenticatedAnyApiPath,
  isRole,
  isRowScopedToOwnConsultor,
  isWriteMethod,
  landsOnProcessos,
  sectionForApiPath,
  sectionForPageRoute,
  type Role,
} from "#shared/utils/rbac";
import {
  resolveAuthUser,
  parseRoleInput,
  roleAppMetadata,
  countAdmins,
} from "../../server/utils/authUser";

const ALL: Role[] = ["consultor", "socio", "operacional", "administrador"];

describe("rbac — leitura por seção", () => {
  it("patients: só socio e administrador leem", () => {
    expect(ALL.filter((r) => canReadSection(r, "patients"))).toEqual(["socio", "administrador"]);
  });
  it("processos: todos os cargos leem", () => {
    expect(ALL.filter((r) => canReadSection(r, "processos"))).toEqual(ALL);
  });
  it("pagamentos: socio, operacional e administrador leem", () => {
    expect(ALL.filter((r) => canReadSection(r, "pagamentos"))).toEqual([
      "socio",
      "operacional",
      "administrador",
    ]);
  });
  it("config: só administrador lê", () => {
    expect(ALL.filter((r) => canReadSection(r, "config"))).toEqual(["administrador"]);
  });
  it("admin: só administrador lê", () => {
    expect(ALL.filter((r) => canReadSection(r, "admin"))).toEqual(["administrador"]);
  });
});

describe("rbac — escrita por seção", () => {
  it("patients: só administrador escreve", () => {
    expect(ALL.filter((r) => canWriteSection(r, "patients"))).toEqual(["administrador"]);
  });
  it("processos: operacional e administrador escrevem", () => {
    expect(ALL.filter((r) => canWriteSection(r, "processos"))).toEqual(["operacional", "administrador"]);
  });
  it("pagamentos: operacional e administrador escrevem", () => {
    expect(ALL.filter((r) => canWriteSection(r, "pagamentos"))).toEqual(["operacional", "administrador"]);
  });
  it("admin: só administrador", () => {
    expect(ALL.filter((r) => canWriteSection(r, "admin"))).toEqual(["administrador"]);
  });
});

describe("rbac — helpers", () => {
  it("isRole valida as 4 strings exatas", () => {
    for (const r of ["consultor", "socio", "operacional", "administrador"]) expect(isRole(r)).toBe(true);
    for (const r of ["Consultor", "admin", "", "sócio", null, 3]) expect(isRole(r)).toBe(false);
  });
  it("row-scoping só para consultor", () => {
    expect(ALL.filter(isRowScopedToOwnConsultor)).toEqual(["consultor"]);
  });
  it("rota de entrada por cargo", () => {
    expect(defaultRouteForRole("consultor")).toBe("/processos");
    expect(defaultRouteForRole("operacional")).toBe("/processos");
    expect(defaultRouteForRole("socio")).toBe("/inicio");
    expect(defaultRouteForRole("administrador")).toBe("/inicio");
  });
  it("landsOnProcessos — regra única usada por authz.global.ts e SidebarNav.vue", () => {
    expect(ALL.filter(landsOnProcessos)).toEqual(["consultor", "operacional"]);
  });
  it("isWriteMethod", () => {
    for (const m of ["POST", "put", "Patch", "DELETE"]) expect(isWriteMethod(m)).toBe(true);
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(isWriteMethod(m)).toBe(false);
  });
});

describe("rbac — mapeamento de rotas", () => {
  it("sectionForApiPath", () => {
    expect(sectionForApiPath("/api/patients")).toBe("patients");
    expect(sectionForApiPath("/api/patients/abc")).toBe("patients");
    expect(sectionForApiPath("/api/attachments")).toBe("patients");
    expect(sectionForApiPath("/api/processos/xyz?foo=1")).toBe("processos");
    expect(sectionForApiPath("/api/pagamentos/banco")).toBe("pagamentos");
    expect(sectionForApiPath("/api/admin/users")).toBe("admin");
    expect(sectionForApiPath("/api/admin/users/abc/reset-password")).toBe("admin");
    expect(sectionForApiPath("/api/auth/me")).toBeNull();
  });
  it("sectionForPageRoute", () => {
    expect(sectionForPageRoute("/prestacao")).toBe("patients");
    expect(sectionForPageRoute("/processos")).toBe("processos");
    expect(sectionForPageRoute("/pagamentos")).toBe("pagamentos");
    expect(sectionForPageRoute("/configuracoes")).toBe("config");
    expect(sectionForPageRoute("/inicio")).toBeNull();
  });

  it("isAuthenticatedAnyApiPath — só o prefixo /api/auth/ passa como 'qualquer sessão'", () => {
    expect(isAuthenticatedAnyApiPath("/api/auth/me")).toBe(true);
    expect(isAuthenticatedAnyApiPath("/api/auth/qualquer-coisa?x=1")).toBe(true);
    expect(isAuthenticatedAnyApiPath("/api/patients")).toBe(false);
    expect(isAuthenticatedAnyApiPath("/api/health")).toBe(false);
    expect(isAuthenticatedAnyApiPath("/api/authorized")).toBe(false); // não é o prefixo "/api/auth/"
    expect(AUTHENTICATED_ANY_API_PREFIXES).toEqual(["/api/auth/"]);
  });

  it("rota /api não mapeada deve negar por padrão (sem seção E fora da allowlist)", () => {
    // O middleware (server/middleware/auth.ts) trata este par — section null +
    // não-allowlisted — como 403. Aqui garantimos as duas condições que o
    // disparam, pra qualquer rota nova cair no "nega por padrão".
    for (const p of ["/api/health", "/api/webhook/stripe", "/api/debug", "/api/", "/api/qualquer"]) {
      expect(sectionForApiPath(p), p).toBeNull();
      expect(isAuthenticatedAnyApiPath(p), p).toBe(false);
    }
  });
});

describe("resolveAuthUser — cargo a partir de app_metadata", () => {
  const base = { id: "u1", email: "x@farmaurora.com.br" };

  it("lê role e consultorNome do app_metadata", () => {
    const u = resolveAuthUser(
      { ...base, app_metadata: { role: "consultor", consultorNome: "André Vitório" } } as never,
      [],
    );
    expect(u.role).toBe("consultor");
    expect(u.consultorNome).toBe("André Vitório");
    expect(u.isAdmin).toBe(false);
  });

  it("ignora consultorNome quando o cargo não é consultor", () => {
    const u = resolveAuthUser(
      { ...base, app_metadata: { role: "socio", consultorNome: "André Vitório" } } as never,
      [],
    );
    expect(u.role).toBe("socio");
    expect(u.consultorNome).toBeUndefined();
  });

  it("consultorNome fora da lista dos 7 é descartado", () => {
    const u = resolveAuthUser(
      { ...base, app_metadata: { role: "consultor", consultorNome: "Fulano" } } as never,
      [],
    );
    expect(u.role).toBe("consultor");
    expect(u.consultorNome).toBeUndefined();
  });

  it("fallback: sem role no metadata + e-mail admin → administrador", () => {
    const u = resolveAuthUser({ ...base, app_metadata: {} } as never, ["x@farmaurora.com.br"]);
    expect(u.role).toBe("administrador");
    expect(u.isAdmin).toBe(true);
  });

  it("sem role e sem e-mail admin → cargo mínimo (consultor sem nome)", () => {
    const u = resolveAuthUser({ ...base, app_metadata: {} } as never, ["outro@x.com"]);
    expect(u.role).toBe("consultor");
    expect(u.consultorNome).toBeUndefined();
  });

  it("role inválido no metadata cai no fallback", () => {
    const u = resolveAuthUser(
      { ...base, app_metadata: { role: "superadmin" } } as never,
      ["x@farmaurora.com.br"],
    );
    expect(u.role).toBe("administrador");
  });
});

describe("parseRoleInput — validação compartilhada POST/PATCH de contas", () => {
  it("rejeita cargo inválido (400)", () => {
    expect(() => parseRoleInput({ role: "chefe" })).toThrowError();
    expect(() => parseRoleInput({ role: undefined })).toThrowError();
  });

  it("consultor sem consultorNome → 400", () => {
    expect(() => parseRoleInput({ role: "consultor" })).toThrowError();
  });

  it("consultor com nome fora dos 7 → 400", () => {
    expect(() => parseRoleInput({ role: "consultor", consultorNome: "Fulano" })).toThrowError();
  });

  it("consultor com nome válido → ok", () => {
    expect(parseRoleInput({ role: "consultor", consultorNome: "Paulo Braga" })).toEqual({
      role: "consultor",
      consultorNome: "Paulo Braga",
    });
  });

  it("cargo não-consultor ignora consultorNome enviado", () => {
    expect(parseRoleInput({ role: "socio", consultorNome: "Paulo Braga" })).toEqual({ role: "socio" });
  });
});

describe("roleAppMetadata — limpa consultorNome órfão", () => {
  it("consultor grava o nome", () => {
    expect(roleAppMetadata("consultor", "Paulo Braga")).toEqual({
      role: "consultor",
      consultorNome: "Paulo Braga",
    });
  });
  it("não-consultor envia consultorNome: null (apaga chave no GoTrue)", () => {
    expect(roleAppMetadata("operacional")).toEqual({ role: "operacional", consultorNome: null });
    expect(roleAppMetadata("administrador")).toEqual({ role: "administrador", consultorNome: null });
  });
});

describe("countAdmins — conta contas com app_metadata.role administrador, paginando", () => {
  function fakeAdmin(pages: Array<{ app_metadata?: Record<string, unknown> }[]>) {
    let call = 0;
    return {
      auth: {
        admin: {
          listUsers: async () => {
            const users = pages[call] ?? [];
            call += 1;
            const nextPage = call < pages.length ? call + 1 : null;
            return { data: { users, nextPage }, error: null };
          },
        },
      },
    } as never;
  }

  it("conta só os administradores", async () => {
    const admin = fakeAdmin([
      [
        { app_metadata: { role: "administrador" } },
        { app_metadata: { role: "socio" } },
        { app_metadata: { role: "consultor", consultorNome: "Paulo Braga" } },
        { app_metadata: {} },
      ],
    ]);
    expect(await countAdmins(admin)).toBe(1);
  });

  it("soma administradores across páginas (fallback por tamanho de página)", async () => {
    const full = Array.from({ length: 1000 }, () => ({ app_metadata: { role: "socio" } }));
    full[0] = { app_metadata: { role: "administrador" } };
    const admin = fakeAdmin([full, [{ app_metadata: { role: "administrador" } }]]);
    expect(await countAdmins(admin)).toBe(2);
  });
});
