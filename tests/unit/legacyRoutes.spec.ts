import { describe, it, expect } from "vitest";
import { redirectForRemovedPage, REMOVED_PAGE_ROUTES } from "../../shared/utils/legacyRoutes";
import { ROLES } from "../../shared/utils/rbac";
import { paginaInicial } from "../../shared/utils/permissoesPagina";

describe("redirectForRemovedPage", () => {
  it("/inicio vai para o destino padrão do login, em todos os cargos (sem mapa: /processos, como sempre)", () => {
    for (const role of ROLES) {
      expect(redirectForRemovedPage("/inicio", { role })).toBe(paginaInicial({ role }));
      expect(redirectForRemovedPage("/inicio", { role })).toBe("/processos");
    }
  });

  it("aceita barra final e query string", () => {
    expect(redirectForRemovedPage("/inicio/", { role: "socio" })).toBe("/processos");
    expect(redirectForRemovedPage("/inicio?x=1", { role: "consultor" })).toBe("/processos");
  });

  it("com mapa de permissões vai para a primeira página legível, ou /recados com tudo 'nenhum' (sem loop)", () => {
    expect(redirectForRemovedPage("/inicio", { role: "operacional", permissoes: { pagamentos: "ver" } })).toBe("/pagamentos");
    const tudoNenhum = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" } as const;
    expect(redirectForRemovedPage("/inicio", { role: "socio", permissoes: tudoNenhum })).toBe("/recados");
    // administrador ignora o mapa
    expect(redirectForRemovedPage("/inicio", { role: "administrador", permissoes: tudoNenhum })).toBe("/processos");
  });

  it("não afeta rotas vivas nem prefixos parecidos", () => {
    expect(redirectForRemovedPage("/processos", { role: "administrador" })).toBeNull();
    expect(redirectForRemovedPage("/", { role: "administrador" })).toBeNull();
    expect(redirectForRemovedPage("/inicios", { role: "administrador" })).toBeNull();
    expect(redirectForRemovedPage("/inicio/outra", { role: "administrador" })).toBeNull();
  });

  it("lista só /inicio", () => {
    expect(REMOVED_PAGE_ROUTES).toEqual(["/inicio"]);
  });
});
