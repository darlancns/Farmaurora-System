import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  NIVEIS_PERMISSAO,
  SECOES_COM_PERMISSAO,
  paginaInicial,
  podeLer,
  type Permissoes,
  type UsuarioRbac,
} from "../../shared/utils/permissoesPagina";
import { ROLES, type Role, type Section } from "../../shared/utils/rbac";

// A ORDEM do menu (MAIN_LINKS) não decide a página inicial de ninguém. A página de entrada de cada conta vem de
// SECOES_COM_PERMISSAO + ROTA_INICIAL_POR_SECAO (shared/utils/permissoesPagina.ts), que não leem a lista do menu. Mudar a ordem da
// navegação (DIR passou para o primeiro lugar) NÃO pode mudar para onde cada conta vai ao entrar nem para onde o guarda de rotas a
// manda. O que se compara aqui é uma implementação de REFERÊNCIA, escrita à mão com a ordem e as rotas de antes da mudança.

vi.mock("../../app/composables/useAuth", () => ({ useAuth: () => ({}) }));
const { MAIN_LINKS, filtrarNavLinks } = await import("../../app/composables/useNavLinks");

// A ordem em que a página inicial procura, e a rota de cada seção, como eram quando o menu tinha outra ordem.
const ORDEM_ANTIGA: ReadonlyArray<[Section, string]> = [
  ["processos", "/processos"],
  ["pagamentos", "/pagamentos"],
  ["dir", "/dir"],
  ["patients", "/prestacao"],
  ["compras", "/compras"],
];

function referencia(user: UsuarioRbac): string {
  for (const [secao, rota] of ORDEM_ANTIGA) if (podeLer(user, secao)) return rota;
  return "/recados";
}

describe("a ordem do menu não decide a página inicial", () => {
  it("as seções e as rotas da página inicial seguem a ordem de antes (e não a do menu)", () => {
    expect([...SECOES_COM_PERMISSAO]).toEqual(ORDEM_ANTIGA.map(([secao]) => secao));
    expect(MAIN_LINKS.map((l) => l.section)).not.toEqual([...SECOES_COM_PERMISSAO]);
  });

  it("sem mapa: todos os cargos entram por /processos, mesmo com a DIR no primeiro lugar do menu do operacional e do administrador", () => {
    for (const role of ROLES) {
      expect(paginaInicial({ role }), role).toBe("/processos");
      expect(paginaInicial({ role }), role).toBe(referencia({ role }));
    }
    expect(filtrarNavLinks({ role: "operacional" }).allLinks[0]!.to).toBe("/dir");
    expect(filtrarNavLinks({ role: "administrador" }).allLinks[0]!.to).toBe("/dir");
    expect(paginaInicial({ role: "operacional" })).not.toBe(filtrarNavLinks({ role: "operacional" }).allLinks[0]!.to);
  });

  it("com mapa: TODAS as combinações de níveis (3^5) × sócio e operacional dão a página que a ordem de antes daria", () => {
    const niveis = NIVEIS_PERMISSAO;
    let combinacoes = 0;
    for (const a of niveis)
      for (const b of niveis)
        for (const c of niveis)
          for (const d of niveis)
            for (const e of niveis) {
              const mapa: Permissoes = { processos: a, pagamentos: b, dir: c, patients: d, compras: e };
              for (const role of ["socio", "operacional"] as const) {
                const user: UsuarioRbac = { role, permissoes: mapa };
                expect(paginaInicial(user), `${role} ${JSON.stringify(mapa)}`).toBe(referencia(user));
                combinacoes += 1;
              }
            }
    expect(combinacoes).toBe(486);
  });

  it("mapa sem nenhuma leitura cai em /recados; só Compras liberada entra por /compras; DIR e Follow-Up liberados entram por Follow-Up", () => {
    const base: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: "nenhum" };
    expect(paginaInicial({ role: "operacional", permissoes: base })).toBe("/recados");
    expect(paginaInicial({ role: "operacional", permissoes: { ...base, compras: "ver" } })).toBe("/compras");
    expect(paginaInicial({ role: "operacional", permissoes: { ...base, dir: "editar", processos: "ver" } })).toBe("/processos");
    expect(paginaInicial({ role: "operacional", permissoes: { ...base, dir: "editar" } })).toBe("/dir");
  });

  it("administrador e consultor ignoram o mapa e entram por /processos", () => {
    const mapa: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: "nenhum" };
    for (const role of ["administrador", "consultor"] as Role[]) {
      expect(paginaInicial({ role, permissoes: mapa })).toBe("/processos");
    }
  });

  it("o código da página inicial e do guarda de rotas não lê a lista do menu", () => {
    const raiz = process.cwd();
    for (const arquivo of ["shared/utils/permissoesPagina.ts", "shared/utils/rbac.ts", "app/middleware/authz.global.ts", "app/middleware/auth.global.ts"]) {
      let texto = "";
      try {
        texto = readFileSync(join(raiz, arquivo), "utf-8");
      } catch {
        continue; // um arquivo que não existe mais não lê nada
      }
      // Só o código conta (os comentários podem citar o menu).
      const codigo = texto.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
      expect(codigo, arquivo).not.toMatch(/MAIN_LINKS|useNavLinks|allLinks|filtrarNavLinks/);
    }
  });
});
