// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "../../shared/utils/rbac";
import {
  NIVEIS_PERMISSAO,
  permissoesTudoNenhum,
  type Permissoes,
} from "../../shared/utils/permissoesPagina";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";
import NavIcon from "../../app/components/NavIcon.vue";

// O item "Compras" do menu (sidebar no desktop, BottomNav no celular) e a página placeholder.
// useNavLinks importa useAuth (runtime do Nuxt): só as listas e a função pura filtrarNavLinks são usadas aqui.
vi.mock("../../app/composables/useAuth", () => ({ useAuth: () => ({}) }));

const { MAIN_LINKS, CONFIG_LINK, filtrarNavLinks } = await import("../../app/composables/useNavLinks");

const links = (role: Role, permissoes?: Permissoes | null) =>
  filtrarNavLinks(permissoes === undefined ? { role } : { role, permissoes }).allLinks;
const rotas = (role: Role, permissoes?: Permissoes | null) => links(role, permissoes).map((l) => l.to);

describe("menu — o item Compras", () => {
  it("é o 3º dos itens principais (DIR, Follow-Up, Compras, Pagamentos, Prestações, Recados); Configurações vem depois, à parte", () => {
    expect(MAIN_LINKS[2]).toMatchObject({ label: "Compras", to: "/compras", section: "compras", icon: "cart" });
    expect(MAIN_LINKS.map((l) => l.to)).toEqual(["/dir", "/processos", "/compras", "/pagamentos", "/prestacao", "/recados"]);
    expect(CONFIG_LINK.to).toBe("/configuracoes");
  });

  it("sem mapa na conta: aparece para administrador, operacional e sócio; NÃO para o consultor", () => {
    expect(rotas("administrador")).toContain("/compras");
    expect(rotas("operacional")).toContain("/compras");
    expect(rotas("socio")).toContain("/compras");
    expect(rotas("consultor")).not.toContain("/compras");
    expect(rotas("consultor")).toEqual(["/processos", "/recados", "/configuracoes"]);
  });

  it("fica logo depois de Follow-Up (e da DIR, quando o cargo a tem), e Configurações continua por último", () => {
    for (const role of ["administrador", "operacional", "socio"] as const) {
      const r = rotas(role);
      expect(r.indexOf("/compras"), role).toBe(r.indexOf("/processos") + 1);
      expect(r.at(-1), role).toBe("/configuracoes");
    }
  });

  for (const role of ["socio", "operacional"] as const) {
    for (const nivel of NIVEIS_PERMISSAO) {
      it(`${role} com mapa e compras = "${nivel}": ${nivel === "nenhum" ? "o item some" : "o item aparece"} (ver e editar mostram o menu)`, () => {
        const r = rotas(role, { ...permissoesTudoNenhum(), compras: nivel });
        expect(r.includes("/compras")).toBe(nivel !== "nenhum");
        expect(r.includes("/processos")).toBe(false); // o nível de Compras não liga as outras páginas
        expect(r.at(-1)).toBe("/configuracoes");
        expect(r).toContain("/recados");
      });
    }

    it(`${role} com mapa gravado ANTES de Compras (sem a chave): o item não aparece`, () => {
      expect(rotas(role, { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar" })).not.toContain("/compras");
      expect(rotas(role, {})).toEqual(["/recados", "/configuracoes"]);
    });
  }

  it("administrador e consultor ignoram o mapa: o item segue o cargo", () => {
    expect(rotas("administrador", permissoesTudoNenhum())).toContain("/compras");
    expect(rotas("consultor", { ...permissoesTudoNenhum(), compras: "editar" })).not.toContain("/compras");
  });

  it("sem usuário: nenhum item", () => {
    expect(filtrarNavLinks(null).allLinks).toEqual([]);
  });

  it("todo mundo com Compras no menu também pode abrir a página (o item nunca leva a um redirecionamento)", () => {
    for (const role of ROLES) expect(rotas(role).includes("/compras"), role).toBe(role !== "consultor");
  });
});

describe("menu no celular (BottomNav, limite de 5 itens + 'Mais')", () => {
  const split = (role: Role, permissoes?: Permissoes | null) => splitBottomNavLinks(links(role, permissoes));

  it("operacional: 6 itens; DIR, Follow-Up, Compras e Pagamentos fixos, Recados e Configurações no 'Mais'", () => {
    const { primary, overflow } = split("operacional");
    expect(primary.map((l) => l.to)).toEqual(["/dir", "/processos", "/compras", "/pagamentos"]);
    expect(overflow.map((l) => l.to)).toEqual(["/recados", "/configuracoes"]);
  });

  it("sócio: 6 itens; Follow-Up, Compras, Pagamentos e Prestações fixos, Recados e Configurações no 'Mais'", () => {
    const { primary, overflow } = split("socio");
    expect(primary.map((l) => l.to)).toEqual(["/processos", "/compras", "/pagamentos", "/prestacao"]);
    expect(overflow.map((l) => l.to)).toEqual(["/recados", "/configuracoes"]);
  });

  it("administrador: 7 itens; DIR, Follow-Up, Compras e Pagamentos fixos, Prestações, Recados e Configurações no 'Mais'", () => {
    const { primary, overflow } = split("administrador");
    expect(primary.map((l) => l.to)).toEqual(["/dir", "/processos", "/compras", "/pagamentos"]);
    expect(overflow.map((l) => l.to)).toEqual(["/prestacao", "/recados", "/configuracoes"]);
  });

  it("consultor: 3 itens, sem 'Mais' e sem Compras", () => {
    expect(split("consultor").overflow).toEqual([]);
  });

  it("operacional com mapa que só dá Follow-Up e Compras: 4 itens, tudo fixo, sem 'Mais'", () => {
    const { primary, overflow } = split("operacional", { ...permissoesTudoNenhum(), processos: "ver", compras: "ver" });
    expect(primary.map((l) => l.to)).toEqual(["/processos", "/compras", "/recados", "/configuracoes"]);
    expect(overflow).toEqual([]);
  });
});

describe("ícone do item", () => {
  it("NavIcon desenha um carrinho próprio para 'cart' (não cai no ícone padrão de reserva)", () => {
    const desenhar = (name: string): string => {
      const el = document.createElement("div");
      createApp({ render: () => h(NavIcon, { name }) }).mount(el);
      return el.querySelector("path")?.getAttribute("d") ?? "";
    };
    const carrinho = desenhar("cart");
    expect(carrinho).toMatch(/^M2\.25 3h1\.386/);
    expect(carrinho).not.toBe(desenhar("desconhecido")); // o ícone de reserva é outro
    expect(carrinho).not.toBe(desenhar("cash"));
  });
});

describe("página placeholder (app/pages/compras.vue)", () => {
  const fonte = readFileSync(join(process.cwd(), "app", "pages", "compras.vue"), "utf-8");

  it("tem o título 'Compras' (no layout padrão, com o cabeçalho das outras páginas) e o aviso 'Em construção'", () => {
    expect(fonte).toContain('<GlobalHeader title="Compras"');
    expect(fonte).toContain("Em construção");
    expect(fonte).toContain('id="compras-page"');
  });

  it("não tem formulário, campo, botão nem chamada de API (é só um placeholder)", () => {
    const semComentarios = fonte.replace(/^\s*\/\/.*$/gm, ""); // o comentário explica o acesso e cita /api/compras: não conta
    expect(semComentarios).not.toMatch(/<form|<input|<button|<textarea|<select/);
    expect(semComentarios).not.toMatch(/fetch|apiFetch|useFetch|\/api\//);
  });
});
