import { describe, expect, it } from "vitest";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";

// Hoje nenhum cargo tem mais de 5 itens de navegação (ver useNavLinks.ts +
// rbac.ts: o máximo é 5, para socio/administrador), então o caminho de
// overflow abaixo não é exercitado em produção ainda — mas o mecanismo
// precisa existir e estar coberto pra quando um novo item de menu aparecer.
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
