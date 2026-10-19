import { describe, it, expect } from "vitest";
import { redirectForRemovedPage, REMOVED_PAGE_ROUTES } from "../../shared/utils/legacyRoutes";
import { ROLES, defaultRouteForRole } from "../../shared/utils/rbac";

describe("redirectForRemovedPage", () => {
  it("/inicio vai para o destino padrão do login, em todos os cargos", () => {
    for (const role of ROLES) {
      expect(redirectForRemovedPage("/inicio", role)).toBe(defaultRouteForRole(role));
    }
  });

  it("aceita barra final e query string", () => {
    expect(redirectForRemovedPage("/inicio/", "socio")).toBe(defaultRouteForRole("socio"));
    expect(redirectForRemovedPage("/inicio?x=1", "consultor")).toBe(defaultRouteForRole("consultor"));
  });

  it("não afeta rotas vivas nem prefixos parecidos", () => {
    expect(redirectForRemovedPage("/processos", "administrador")).toBeNull();
    expect(redirectForRemovedPage("/", "administrador")).toBeNull();
    expect(redirectForRemovedPage("/inicios", "administrador")).toBeNull();
    expect(redirectForRemovedPage("/inicio/outra", "administrador")).toBeNull();
  });

  it("lista só /inicio", () => {
    expect(REMOVED_PAGE_ROUTES).toEqual(["/inicio"]);
  });
});
