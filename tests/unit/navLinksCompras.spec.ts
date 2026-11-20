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

describe("página (app/pages/compras.vue)", () => {
  const fonte = readFileSync(join(process.cwd(), "app", "pages", "compras.vue"), "utf-8");
  const semComentarios = fonte.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

  it("tem o título 'Compras' (no layout padrão, com o cabeçalho das outras páginas), a largura FLUIDA e as três colunas", () => {
    expect(fonte).toContain('<GlobalHeader title="Compras"');
    expect(fonte).toContain('id="compras-page"');
    expect(fonte).toContain("max-w-fluida");
    expect(fonte).toContain("lg:grid-cols-[320px_minmax(0,1fr)_460px]");
    expect(fonte).not.toContain("Em construção");
    // As três colunas, na ordem do DOM (que é a da pilha abaixo de lg): lista, formulário, resumo.
    const ordem = ["compras-coluna-esquerda", "compras-coluna-central", "compras-coluna-direita"].map((id) => fonte.indexOf(`id="${id}"`));
    expect(ordem.every((i) => i > -1)).toBe(true);
    expect(ordem).toEqual([...ordem].sort((x, y) => x - y));
  });

  it("cada coluna rola sozinha no desktop e a página não rola por inteiro (h-full + lg:-mb-10, como Prestações)", () => {
    expect(fonte).toContain("lg:flex lg:h-full lg:flex-col");
    expect(fonte).toContain("lg:-mb-10");
    expect((fonte.match(/lg:overflow-y-auto/g) ?? []).length).toBe(3);
  });

  it("a permissão vem de canWrite('compras') (a mesma função do servidor): nenhuma regra de cargo copiada na página", () => {
    expect(semComentarios).toContain('canWrite("compras")');
    expect(semComentarios).not.toMatch(/\.role\b|isAdmin|"administrador"|"operacional"|"socio"|"consultor"/);
  });

  it("a página não fala com a API: tudo passa pelos composables (useComprasPagina, useCompraOpcoes)", () => {
    expect(semComentarios).not.toMatch(/fetch\(|apiFetch|useFetch|\/api\//);
    expect(semComentarios).toContain("useComprasPagina");
    expect(semComentarios).toContain("useCompraOpcoes");
  });

  it("descarrega o salvamento ao sair (onBeforeRouteLeave) e avisa ao fechar a aba (beforeunload), só para quem edita", () => {
    expect(fonte).toContain("onBeforeRouteLeave");
    expect(fonte).toContain('"beforeunload"');
    expect(fonte).toMatch(/if \(!podeEditar\.value \|\| !editor\.temPendencia\.value\) return;/);
  });

  it("o diálogo de cancelar é o ConfirmDialog reforçado, em tom de perigo", () => {
    expect(fonte).toMatch(/<ConfirmDialog[\s\S]*danger[\s\S]*reforcado/);
  });
});
