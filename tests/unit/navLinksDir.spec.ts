import { describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "../../shared/utils/rbac";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";

// useNavLinks importa useAuth (que depende do runtime do Nuxt, "#app"): aqui só usamos as listas
// exportadas (MAIN_LINKS e a função pura filtrarNavLinks), então o useAuth real não precisa carregar.
vi.mock("../../app/composables/useAuth", () => ({ useAuth: () => ({}) }));

const { MAIN_LINKS, filtrarNavLinks } = await import("../../app/composables/useNavLinks");

// A função REAL que useNavLinks() usa (sem mapa de permissões: a regra do cargo, como sempre foi).
function linksDoCargo(role: Role) {
  return filtrarNavLinks({ role }).allLinks;
}

const rotas = (role: Role) => linksDoCargo(role).map((l) => l.to);

describe("navegação — item DIR por cargo", () => {
  it("a DIR entra ANTES de Prestações e Compras entra por ÚLTIMO (a ordem das páginas de antes não muda)", () => {
    const ordem = MAIN_LINKS.map((l) => l.to);
    expect(ordem).toEqual(["/processos", "/recados", "/pagamentos", "/dir", "/prestacao", "/compras"]);
  });

  it("operacional e administrador veem a DIR; sócio e consultor NÃO", () => {
    expect(rotas("operacional")).toContain("/dir");
    expect(rotas("administrador")).toContain("/dir");
    expect(rotas("socio")).not.toContain("/dir");
    expect(rotas("consultor")).not.toContain("/dir");
  });

  it("o rótulo é 'DIR' e a seção é 'dir'", () => {
    const dir = MAIN_LINKS.find((l) => l.to === "/dir");
    expect(dir).toMatchObject({ label: "DIR", section: "dir" });
  });

  it("os links dos outros cargos não mudaram, exceto Configurações, que agora é de todos ('Minha conta')", () => {
    expect(rotas("consultor")).toEqual(["/processos", "/recados", "/configuracoes"]);
    expect(rotas("socio")).toEqual(["/processos", "/recados", "/pagamentos", "/prestacao", "/compras", "/configuracoes"]);
  });

  it("todo cargo vê Configurações, sempre por último", () => {
    for (const r of ROLES) expect(rotas(r).at(-1)).toBe("/configuracoes");
  });

  it("todo cargo continua tendo ao menos um item", () => {
    for (const r of ROLES) expect(rotas(r).length).toBeGreaterThan(0);
  });
});

describe("BottomNav — split com os links reais", () => {
  it("administrador (7 itens): fixos Follow-Up, Recados, Pagamentos e DIR; 'Mais' = Prestações + Compras + Configurações", () => {
    const links = linksDoCargo("administrador");
    expect(links).toHaveLength(7);
    const { primary, overflow } = splitBottomNavLinks(links);
    expect(primary.map((l) => l.to)).toEqual(["/processos", "/recados", "/pagamentos", "/dir"]);
    expect(overflow.map((l) => l.to)).toEqual(["/prestacao", "/compras", "/configuracoes"]);
  });

  it("operacional (6 itens): os 4 de antes ficam fixos; Compras e Configurações vão para o 'Mais' (antes eram 5 fixos)", () => {
    const { primary, overflow } = splitBottomNavLinks(linksDoCargo("operacional"));
    expect(primary.map((l) => l.to)).toEqual(["/processos", "/recados", "/pagamentos", "/dir"]);
    expect(overflow.map((l) => l.to)).toEqual(["/compras", "/configuracoes"]);
  });

  it("sócio (6 itens): Follow-Up, Recados, Pagamentos e Prestações fixos; Compras e Configurações no 'Mais'. Consultor (3 itens): sem 'Mais'", () => {
    const socio = splitBottomNavLinks(linksDoCargo("socio"));
    expect(socio.primary.map((l) => l.to)).toEqual(["/processos", "/recados", "/pagamentos", "/prestacao"]);
    expect(socio.overflow.map((l) => l.to)).toEqual(["/compras", "/configuracoes"]);
    expect(linksDoCargo("consultor")).toHaveLength(3);
    expect(splitBottomNavLinks(linksDoCargo("consultor")).overflow).toEqual([]);
  });
});
