import { describe, expect, it } from "vitest";
import { previsaoParaCard } from "../../app/utils/processoPrevisaoCard";

const HOJE = "2026-11-19";

describe("previsaoParaCard (data curta do card do Kanban)", () => {
  it("DD/MM/AAAA → só DD/MM; o completo guarda o ano", () => {
    expect(previsaoParaCard("25/11/2026", HOJE)).toEqual({ curto: "25/11", completo: "25/11/2026" });
  });

  it("DD/MM (formato antigo) fica como está", () => {
    expect(previsaoParaCard("25/11", HOJE)).toEqual({ curto: "25/11", completo: "25/11" });
  });

  it("DD/MM/AAAA com dia/mês de um dígito sai com dois dígitos", () => {
    expect(previsaoParaCard("5/1/2027", HOJE)).toEqual({ curto: "05/01", completo: "5/1/2027" });
  });

  it("ano diferente do atual continua mostrando só DD/MM, com o ano no completo", () => {
    expect(previsaoParaCard("03/02/2030", HOJE)).toEqual({ curto: "03/02", completo: "03/02/2030" });
    expect(previsaoParaCard("03/02/2024", HOJE)).toEqual({ curto: "03/02", completo: "03/02/2024" });
  });

  it("texto anotado fica como está (curto e completo iguais)", () => {
    expect(previsaoParaCard("20/11 (aguardando voo)", HOJE)).toEqual({
      curto: "20/11 (aguardando voo)",
      completo: "20/11 (aguardando voo)",
    });
    expect(previsaoParaCard("25/11/2026 (confirmar)", HOJE)).toEqual({
      curto: "25/11/2026 (confirmar)",
      completo: "25/11/2026 (confirmar)",
    });
    expect(previsaoParaCard("já tem", HOJE)).toEqual({ curto: "já tem", completo: "já tem" });
  });

  it("data impossível não é cortada: vira texto como está", () => {
    expect(previsaoParaCard("31/02/2026", HOJE)).toEqual({ curto: "31/02/2026", completo: "31/02/2026" });
  });

  it("espaços nas pontas saem do curto e do completo", () => {
    expect(previsaoParaCard("  25/11/2026  ", HOJE)).toEqual({ curto: "25/11", completo: "25/11/2026" });
  });

  it("vazio, só espaços, null e undefined → nulo", () => {
    expect(previsaoParaCard("", HOJE)).toBeNull();
    expect(previsaoParaCard("   ", HOJE)).toBeNull();
    expect(previsaoParaCard(null, HOJE)).toBeNull();
    expect(previsaoParaCard(undefined, HOJE)).toBeNull();
  });
});
