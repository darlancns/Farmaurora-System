import { describe, expect, it } from "vitest";
import {
  ROLES,
  sectionForApiPath,
  sectionForPageRoute,
  type Role,
} from "../../shared/utils/rbac";
import { autorizarApi } from "../../shared/utils/permissoesPagina";

// RBAC dos Cadastros: /api/cadastros → seção "config" (todos leem, só o administrador escreve). A decisão é a da função
// real que o middleware (server/middleware/auth.ts) chama, autorizarApi — não mais uma cópia da expressão. A fiação do
// middleware em si é coberta por tests/unit/middlewareAuth.spec.ts.

function middlewarePermite(role: Role, metodo: string, path: string): boolean {
  return autorizarApi({ role }, path, metodo).permitido;
}

const CAMINHOS = [
  "/api/cadastros/fornecedores",
  "/api/cadastros/despachantes",
  "/api/cadastros/transportadoras",
  "/api/cadastros/cias-aereas",
  "/api/cadastros/fornecedores/forn_1",
  "/api/cadastros/transportadoras/transp_1",
  "/api/cadastros/cias-aereas/cia_1?x=1",
  "/api/cadastros/consultores",
  "/api/cadastros/consultores/cons_1",
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
    // Contas (/api/admin/**) é só do administrador, inclusive a leitura: o sócio leva 403 até no GET.
    expect(middlewarePermite("socio", "GET", "/api/admin/users")).toBe(false);
    expect(middlewarePermite("socio", "POST", "/api/admin/users")).toBe(false);
    expect(middlewarePermite("administrador", "GET", "/api/admin/users")).toBe(true);
    expect(middlewarePermite("consultor", "GET", "/api/dir")).toBe(false);
    expect(middlewarePermite("operacional", "GET", "/api/dir")).toBe(true);
  });
});

describe("consultores (5ª lista) — mesma regra das outras: todos leem, só o administrador escreve", () => {
  const LISTA = "/api/cadastros/consultores";
  const ITEM = "/api/cadastros/consultores/cons_1";

  it("mapeia para a seção config", () => {
    expect(sectionForApiPath(LISTA)).toBe("config");
    expect(sectionForApiPath(ITEM)).toBe("config");
  });

  it("todos os cargos leem; só o administrador escreve (POST/PATCH/PUT/DELETE)", () => {
    for (const role of ROLES) expect(middlewarePermite(role, "GET", LISTA), `${role} GET`).toBe(true);
    expect(ROLES.filter((r) => middlewarePermite(r, "POST", LISTA))).toEqual(["administrador"]);
    for (const metodo of ["PATCH", "PUT", "DELETE"]) {
      expect(ROLES.filter((r) => middlewarePermite(r, metodo, ITEM)), metodo).toEqual(["administrador"]);
    }
  });

  it("a DIR consegue ler a lista mesmo com permissão por página: quem só tem a DIR (ver ou editar) lê os consultores", () => {
    for (const nivel of ["ver", "editar"] as const) {
      for (const role of ["socio", "operacional"] as const) {
        const user = { role, permissoes: { dir: nivel } };
        expect(autorizarApi(user, LISTA, "GET").permitido, `${role} dir:${nivel} GET`).toBe(true);
        expect(autorizarApi(user, LISTA, "POST").permitido, `${role} dir:${nivel} POST`).toBe(false);
        expect(autorizarApi(user, ITEM, "PATCH").permitido, `${role} dir:${nivel} PATCH`).toBe(false);
      }
    }
  });
});
