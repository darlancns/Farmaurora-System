import { describe, expect, it } from "vitest";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";

// Com a DIR (ver useNavLinks.ts + rbac.ts) o administrador passa a ter 6 itens de
// navegação, então o "Mais" já é exercitado em produção para esse cargo; os links
// reais por cargo ficam em tests/unit/navLinksDir.spec.ts. Aqui o mecanismo
// genérico, com itens quaisquer.
describe("splitBottomNavLinks", () => {
  it("com 5 itens ou menos, mostra todos como fixos e não gera overflow", () => {
    const links = ["a", "b", "c", "d", "e"];
    expect(splitBottomNavLinks(links)).toEqual({ primary: links, overflow: [] });
  });

  it("com poucos itens (menos que o limite), também não gera overflow", () => {
    const links = ["a", "b"];
    expect(splitBottomNavLinks(links)).toEqual({ primary: links, overflow: [] });
  });

  it("com lista vazia, devolve os dois lados vazios", () => {
    expect(splitBottomNavLinks([])).toEqual({ primary: [], overflow: [] });
  });

  it("acima de 5 itens, fixa os 4 primeiros (ordem de prioridade) e manda o resto pro 'Mais'", () => {
    const links = ["a", "b", "c", "d", "e", "f"];
    expect(splitBottomNavLinks(links)).toEqual({ primary: ["a", "b", "c", "d"], overflow: ["e", "f"] });
  });

  it("não muta o array recebido", () => {
    const links = ["a", "b", "c", "d", "e", "f", "g"];
    const original = [...links];
    splitBottomNavLinks(links);
    expect(links).toEqual(original);
  });
});
