import { describe, expect, it } from "vitest";
import { previsaoParaCard } from "../../app/utils/processoPrevisaoCard";

// O card mostra SEMPRE só "DD/MM" (dois dígitos); o texto original inteiro vai em `completo` (title).
describe("previsaoParaCard (data do card do Kanban: sempre DD/MM)", () => {
  it("DD/MM/AAAA → DD/MM; o completo guarda o ano", () => {
    expect(previsaoParaCard("25/11/2026")).toEqual({ curto: "25/11", completo: "25/11/2026" });
  });

  it("DD/MM fica DD/MM", () => {
    expect(previsaoParaCard("25/11")).toEqual({ curto: "25/11", completo: "25/11" });
  });

  it("um dígito ganha zero à esquerda, com ou sem ano", () => {
    expect(previsaoParaCard("5/1")).toEqual({ curto: "05/01", completo: "5/1" });
    expect(previsaoParaCard("5/1/2027")).toEqual({ curto: "05/01", completo: "5/1/2027" });
  });

  it("qualquer ano continua mostrando só DD/MM", () => {
    expect(previsaoParaCard("03/02/2030")?.curto).toBe("03/02");
    expect(previsaoParaCard("03/02/24")?.curto).toBe("03/02");
  });

  it("texto anotado: pega a primeira data e o completo é o texto original", () => {
    expect(previsaoParaCard("20/11 (aguardando voo)")).toEqual({ curto: "20/11", completo: "20/11 (aguardando voo)" });
    expect(previsaoParaCard("chega 20/11")).toEqual({ curto: "20/11", completo: "chega 20/11" });
    expect(previsaoParaCard("chega 20/11/2026")).toEqual({ curto: "20/11", completo: "chega 20/11/2026" });
    expect(previsaoParaCard("Entre 28/08 e 02/09")?.curto).toBe("28/08");
  });

  it("com várias datas vale a PRIMEIRA válida (uma inválida antes é ignorada)", () => {
    expect(previsaoParaCard("13/10; deferido 14/10")?.curto).toBe("13/10");
    expect(previsaoParaCard("32/13 ou 20/11")?.curto).toBe("20/11");
  });

  it("dia 1-31 e mês 1-12: fora disso é 'sem data'", () => {
    expect(previsaoParaCard("32/13")).toBeNull();
    expect(previsaoParaCard("00/05")).toBeNull();
    expect(previsaoParaCard("10/00")).toBeNull();
    expect(previsaoParaCard("10/13")).toBeNull();
    expect(previsaoParaCard("32/01")).toBeNull();
    expect(previsaoParaCard("31/12")?.curto).toBe("31/12");
    expect(previsaoParaCard("01/01")?.curto).toBe("01/01");
  });

  it("não pesca data no meio de número maior", () => {
    expect(previsaoParaCard("123/45")).toBeNull();
    expect(previsaoParaCard("pedido 1234/5678")).toBeNull();
  });

  it("texto sem data reconhecível → nulo", () => {
    expect(previsaoParaCard("aguardando confirmação")).toBeNull();
    expect(previsaoParaCard("já tem")).toBeNull();
    expect(previsaoParaCard("2026-11-25")).toBeNull();
  });

  it("vazio, só espaços, null e undefined → nulo", () => {
    expect(previsaoParaCard("")).toBeNull();
    expect(previsaoParaCard("   ")).toBeNull();
    expect(previsaoParaCard(null)).toBeNull();
    expect(previsaoParaCard(undefined)).toBeNull();
  });

  it("espaços nas pontas saem do completo", () => {
    expect(previsaoParaCard("  25/11/2026  ")).toEqual({ curto: "25/11", completo: "25/11/2026" });
  });
});
