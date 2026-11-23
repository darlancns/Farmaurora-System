// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from "node:fs";
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
    expect(MAIN_LINKS[2]).toMatchObject({ label: "Compras", to: "/compras", section: "compras", icon: "capsule" });
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

describe("ícone do item: uma cápsula de remédio (o carrinho saiu)", () => {
  const raizDe = (name: string): SVGElement => {
    const el = document.createElement("div");
    createApp({ render: () => h(NavIcon, { name }) }).mount(el);
    return el.querySelector("svg") as SVGElement;
  };
  const desenhar = (name: string): string => raizDe(name).querySelector("path")?.getAttribute("d") ?? "";
  const RESERVA = desenhar("nome-que-nao-existe"); // o ícone de reserva do NavIcon

  it("o link Compras usa o ícone 'capsule'", () => {
    expect(MAIN_LINKS.find((l) => l.to === "/compras")!.icon).toBe("capsule");
  });

  it("NavIcon desenha uma cápsula própria para 'capsule' (não cai no ícone de reserva nem repete o de outro item)", () => {
    const capsula = desenhar("capsule");
    expect(capsula).not.toBe("");
    expect(capsula).not.toBe(RESERVA);
    for (const outro of ["home", "clipboard", "list", "cog", "cash", "chat", "document-check"]) expect(capsula, outro).not.toBe(desenhar(outro));
  });

  it("segue a convenção dos ícones vizinhos: viewBox 24, só contorno (fill none), stroke currentColor, traço 1,5, pontas e junções redondas, sem cor fixa", () => {
    const capsula = raizDe("capsule");
    for (const vizinho of ["list", "cash", "clipboard", "chat", "cog"]) {
      const v = raizDe(vizinho);
      for (const atributo of ["xmlns", "viewBox", "fill", "stroke", "stroke-width"]) {
        expect(capsula.getAttribute(atributo), `${atributo} (como ${vizinho})`).toBe(v.getAttribute(atributo));
      }
    }
    expect(capsula.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(capsula.getAttribute("fill")).toBe("none");
    expect(capsula.getAttribute("stroke")).toBe("currentColor");
    expect(capsula.getAttribute("stroke-width")).toBe("1.5");
    const caminhos = [...capsula.querySelectorAll("path")];
    expect(caminhos).toHaveLength(1);
    expect(caminhos[0]!.getAttribute("stroke-linecap")).toBe("round");
    expect(caminhos[0]!.getAttribute("stroke-linejoin")).toBe("round");
    // Nenhuma cor nem preenchimento fixos em lugar nenhum do desenho (a cor vem do item: ativo, inativo, tema).
    const html = capsula.outerHTML;
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(html).not.toMatch(/fill="(?!none)/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(capsula.querySelector("image, foreignObject, text")).toBeNull(); // nada de imagem nem emoji: só SVG
  });

  it("o desenho: contorno de cápsula inclinada com duas pontas semicirculares (raio 4,5) e UMA linha divisória no meio, centrado em (12, 12)", () => {
    const d = desenhar("capsule");
    expect(d.match(/a4\.5 4\.5 0 0 1/g)).toHaveLength(2); // as duas pontas arredondadas
    expect(d.match(/Z/g)).toHaveLength(1); // contorno fechado
    const [contorno, divisoria] = d.split("Z");
    expect(divisoria).toMatch(/^M[\d.]+ [\d.]+l[\d.]+ [\d.]+$/); // a linha do meio (um só traço)

    const n = (re: RegExpMatchArray | null, i: number): number => Number(re![i]);
    const m = /^M([\d.]+) ([\d.]+)a4\.5 4\.5 0 0 1 (-?[\d.]+) (-?[\d.]+)L([\d.]+) ([\d.]+)a4\.5 4\.5 0 0 1(-?[\d.]+)(-[\d.]+)L/.exec(contorno!); // o 2º arco vem sem espaço: "1-6.364-6.364"
    expect(m).not.toBeNull();
    // Os quatro pontos onde as pontas encontram o corpo.
    const p1 = [n(m, 1), n(m, 2)] as const;
    const p2 = [p1[0] + n(m, 3), p1[1] + n(m, 4)] as const;
    const p3 = [n(m, 5), n(m, 6)] as const;
    const p4 = [p3[0] + n(m, 7), p3[1] + n(m, 8)] as const;
    // Centrado no meio do viewBox (a média dos 4 pontos é (12, 12)).
    expect((p1[0] + p2[0] + p3[0] + p4[0]) / 4).toBeCloseTo(12, 2);
    expect((p1[1] + p2[1] + p3[1] + p4[1]) / 4).toBeCloseTo(12, 2);
    // Cada ponta é um semicírculo: a corda entre os dois pontos vale o diâmetro (9).
    expect(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])).toBeCloseTo(9, 2);
    expect(Math.hypot(p4[0] - p3[0], p4[1] - p3[1])).toBeCloseTo(9, 2);
    // Inclinada a 45°: o eixo (de uma ponta à outra) anda a mesma distância em x e em y.
    const eixoX = (p1[0] + p2[0]) / 2 - (p3[0] + p4[0]) / 2;
    const eixoY = (p1[1] + p2[1]) / 2 - (p3[1] + p4[1]) / 2;
    expect(Math.abs(eixoX)).toBeCloseTo(Math.abs(eixoY), 2);
    expect(eixoX * eixoY).toBeLessThan(0); // ponta de cima à direita, ponta de baixo à esquerda
    // A divisória passa pelo centro e atravessa o corpo (do tamanho do diâmetro: 9).
    const meio = /^M([\d.]+) ([\d.]+)l([\d.]+) ([\d.]+)$/.exec(divisoria!);
    expect(n(meio, 1) + n(meio, 3) / 2).toBeCloseTo(12, 2);
    expect(n(meio, 2) + n(meio, 4) / 2).toBeCloseTo(12, 2);
    expect(Math.hypot(n(meio, 3), n(meio, 4))).toBeCloseTo(9, 2);
  });

  it("todo item do menu (inclusive Configurações) tem desenho próprio: nenhum cai no ícone de reserva", () => {
    for (const link of [...MAIN_LINKS, CONFIG_LINK]) {
      expect(desenhar(link.icon), `${link.label} (${link.icon})`).not.toBe(RESERVA);
    }
  });

  it("o carrinho de compras NÃO é mais usado em lugar nenhum: nem o nome 'cart' nem o desenho antigo", () => {
    expect(desenhar("cart")).toBe(RESERVA); // o nome antigo não existe mais (cai na reserva)
    const raiz = join(__dirname, "..", "..");
    const arquivos: string[] = [];
    const andar = (dir: string): void => {
      for (const nome of readdirSync(join(raiz, dir))) {
        const rel = `${dir}/${nome}`;
        if (statSync(join(raiz, rel)).isDirectory()) andar(rel);
        else if (/\.(vue|ts)$/.test(nome)) arquivos.push(rel);
      }
    };
    for (const dir of ["app", "shared"]) andar(dir);
    expect(arquivos.length).toBeGreaterThan(100);
    for (const arquivo of arquivos) {
      const texto = readFileSync(join(raiz, arquivo), "utf-8");
      expect(/name === ['"]cart['"]|icon: ['"]cart['"]|['"]cart['"]/.test(texto), `${arquivo}: nome 'cart'`).toBe(false);
      expect(texto.includes("M2.25 3h1.386"), `${arquivo}: desenho do carrinho`).toBe(false);
    }
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

  it("sem compra aberta, a coluna da direita mostra a nota 'O resumo aparece aqui quando você abrir uma compra.'", () => {
    expect(fonte).toContain('id="compras-direita-vazia"');
    expect(fonte).toContain("O resumo aparece aqui quando você abrir uma compra.");
  });

  it("o diálogo de cancelar é o ConfirmDialog reforçado, em tom de perigo", () => {
    expect(fonte).toMatch(/<ConfirmDialog[\s\S]*danger[\s\S]*reforcado/);
  });
});
