import { describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "../../shared/utils/rbac";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

vi.mock("../../app/composables/useAuth", () => ({ useAuth: () => ({}) }));

const { filtrarNavLinks } = await import("../../app/composables/useNavLinks");

const rotas = (role: Role, permissoes?: Permissoes | null) =>
  filtrarNavLinks(permissoes === undefined ? { role } : { role, permissoes }).allLinks.map((l) => l.to);

const TUDO_NENHUM: Permissoes = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };

describe("menu (filtrarNavLinks) — conta SEM mapa: igual a antes, nos 4 cargos", () => {
  it("links por cargo, na mesma ordem de antes", () => {
    expect(rotas("consultor")).toEqual(["/processos", "/recados", "/configuracoes"]);
    expect(rotas("socio")).toEqual(["/processos", "/recados", "/pagamentos", "/prestacao", "/configuracoes"]);
    expect(rotas("operacional")).toEqual(["/processos", "/recados", "/pagamentos", "/configuracoes"]);
    expect(rotas("administrador")).toEqual(["/processos", "/recados", "/pagamentos", "/prestacao", "/configuracoes"]);
  });

  it("permissoes null = sem mapa", () => {
    for (const role of ROLES) expect(rotas(role, null)).toEqual(rotas(role));
  });

  it("sem usuário: nenhum item", () => {
    expect(filtrarNavLinks(null)).toEqual({ links: [], showConfigLink: false, allLinks: [] });
    expect(filtrarNavLinks(undefined).allLinks).toEqual([]);
  });

  it("Configurações fica fora de `links` e em `allLinks`, sempre por último", () => {
    for (const role of ROLES) {
      const v = filtrarNavLinks({ role });
      expect(v.showConfigLink).toBe(true);
      expect(v.links.map((l) => l.to)).not.toContain("/configuracoes");
      expect(v.allLinks.at(-1)?.to).toBe("/configuracoes");
    }
  });
});

describe("menu — com mapa gravado mostra só as seções legíveis", () => {
  it.each(["socio", "operacional"] as const)("%s: 'ver' e 'editar' aparecem, 'nenhum' some; Recados e Configurações ficam", (role) => {
    expect(rotas(role, { processos: "ver", pagamentos: "nenhum", patients: "editar" })).toEqual([
      "/processos",
      "/recados",
      "/prestacao",
      "/configuracoes",
    ]);
  });

  it.each(["socio", "operacional"] as const)("%s com tudo 'nenhum': só Recados e Configurações", (role) => {
    expect(rotas(role, TUDO_NENHUM)).toEqual(["/recados", "/configuracoes"]);
    expect(rotas(role, {})).toEqual(["/recados", "/configuracoes"]);
  });

  it("seção que o cargo nunca teve aparece quando o mapa dá acesso (operacional em Prestações)", () => {
    expect(rotas("operacional")).not.toContain("/prestacao");
    expect(rotas("operacional", { processos: "ver", patients: "ver" })).toContain("/prestacao");
  });

  it("mapa ilegível: some tudo que o mapa controla", () => {
    expect(rotas("operacional", "editar" as unknown as Permissoes)).toEqual(["/recados", "/configuracoes"]);
  });

  it("consultor e administrador ignoram o mapa", () => {
    expect(rotas("administrador", TUDO_NENHUM)).toEqual(rotas("administrador"));
    expect(rotas("consultor", TUDO_NENHUM)).toEqual(rotas("consultor"));
  });

  it("BottomNav: com o mapa liberando tudo são 5 itens (sem 'Mais'); com poucos, também não", () => {
    const todos: Permissoes = { processos: "ver", pagamentos: "ver", patients: "ver" };
    const cheio = splitBottomNavLinks(filtrarNavLinks({ role: "socio", permissoes: todos }).allLinks);
    expect(cheio.primary.map((l) => l.to)).toEqual(["/processos", "/recados", "/pagamentos", "/prestacao", "/configuracoes"]);
    expect(cheio.overflow).toEqual([]);
    const poucos = splitBottomNavLinks(filtrarNavLinks({ role: "operacional", permissoes: { processos: "ver" } }).allLinks);
    expect(poucos.overflow).toEqual([]);
  });
});
