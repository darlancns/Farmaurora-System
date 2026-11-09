import { describe, expect, it } from "vitest";
import {
  ROLES,
  canReadSection,
  canWriteSection,
  isWriteMethod,
  sectionForApiPath,
  sectionForPageRoute,
  type Role,
} from "../../shared/utils/rbac";

// RBAC dos Cadastros: /api/cadastros → seção "config" (todos leem, só o administrador escreve). A decisão do middleware
// (server/middleware/auth.ts) é: método de escrita → canWriteSection, GET → canReadSection; aqui se reproduz exatamente
// essa regra, cargo por cargo, porque o middleware em si depende do runtime do Nuxt.

function middlewarePermite(role: Role, metodo: string, path: string): boolean {
  const secao = sectionForApiPath(path);
  if (!secao) return false;
  return isWriteMethod(metodo) ? canWriteSection(role, secao) : canReadSection(role, secao);
}

const CAMINHOS = [
  "/api/cadastros/fornecedores",
  "/api/cadastros/despachantes",
  "/api/cadastros/cias-aereas",
  "/api/cadastros/fornecedores/forn_1",
  "/api/cadastros/cias-aereas/cia_1?x=1",
];

describe("sectionForApiPath — /api/cadastros", () => {
  it("mapeia o prefixo e as subrotas (com ou sem query) para a seção config", () => {
    expect(sectionForApiPath("/api/cadastros")).toBe("config");
    for (const p of CAMINHOS) expect(sectionForApiPath(p), p).toBe("config");
  });

  it("prefixos parecidos continuam NEGADOS por padrão (/api/cadastro, /api/cadastrosx)", () => {
    for (const p of ["/api/cadastro", "/api/cadastrosx", "/api/cadastros-extra/a"]) expect(sectionForApiPath(p), p).toBeNull();
  });

  it("a rota da página continua sendo config", () => {
    expect(sectionForPageRoute("/configuracoes")).toBe("config");
  });
});

describe("matriz por cargo (regra do middleware)", () => {
  it("todos os cargos leem (GET)", () => {
    for (const role of ROLES) {
      for (const p of CAMINHOS) expect(middlewarePermite(role, "GET", p), `${role} GET ${p}`).toBe(true);
    }
  });

  it("só o administrador escreve (POST, PATCH, PUT, DELETE)", () => {
    for (const metodo of ["POST", "PATCH", "PUT", "DELETE"]) {
      for (const p of CAMINHOS) {
        expect(
          ROLES.filter((role) => middlewarePermite(role, metodo, p)),
          `${metodo} ${p}`,
        ).toEqual(["administrador"]);
      }
    }
  });

  it("sócio, operacional e consultor leem e levam 403 ao escrever", () => {
    for (const role of ["socio", "operacional", "consultor"] as const) {
      expect(middlewarePermite(role, "GET", "/api/cadastros/fornecedores"), `${role} lê`).toBe(true);
      expect(middlewarePermite(role, "POST", "/api/cadastros/fornecedores"), `${role} POST`).toBe(false);
      expect(middlewarePermite(role, "PATCH", "/api/cadastros/fornecedores/forn_1"), `${role} PATCH`).toBe(false);
    }
  });

  it("as outras seções não mudaram de acesso", () => {
    expect(middlewarePermite("socio", "GET", "/api/admin/users")).toBe(true);
    expect(middlewarePermite("socio", "POST", "/api/admin/users")).toBe(false);
    expect(middlewarePermite("consultor", "GET", "/api/dir")).toBe(false);
    expect(middlewarePermite("operacional", "GET", "/api/dir")).toBe(true);
  });
});
