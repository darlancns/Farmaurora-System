import { describe, expect, it } from "vitest";
import { montarResumoCompra } from "../../shared/utils/compraResumo";
import { compraParaResumoEntrada } from "../../shared/utils/compraResumo";
import { compraVaziaDeTeste } from "./helpers/compraFixtures";
import {
  anoMesAtualBrasilia,
  anoMesDoInstante,
  anoMesValido,
  horaMinutoBrasilia,
  rotuloCurtoDaCompra,
  rotuloDoMes,
  somarMeses,
  tituloDaCompra,
} from "../../shared/utils/compraMes";

// O mês da Compra (Brasília) e os textos de título. Rodar com TZ=UTC, TZ=America/Sao_Paulo e TZ=Pacific/Honolulu dá o mesmo.

describe("mês corrente de BRASÍLIA (nunca o do navegador)", () => {
  it("a virada do mês: 01h30 UTC de 1º/12 ainda é novembro em Brasília; 03h00 UTC já é dezembro", () => {
    expect(anoMesAtualBrasilia(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11");
    expect(anoMesAtualBrasilia(new Date("2026-12-01T02:59:59.999Z"))).toBe("2026-11");
    expect(anoMesAtualBrasilia(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12");
  });
  it("a virada do ano", () => {
    expect(anoMesAtualBrasilia(new Date("2027-01-01T02:59:59Z"))).toBe("2026-12");
    expect(anoMesAtualBrasilia(new Date("2027-01-01T03:00:00Z"))).toBe("2027-01");
  });
  it("às 21h de Brasília (00h UTC do dia seguinte) o mês ainda é o de Brasília", () => {
    expect(anoMesAtualBrasilia(new Date("2026-11-30T23:59:00-03:00"))).toBe("2026-11");
    expect(anoMesDoInstante("2026-12-01T00:30:00-03:00")).toBe("2026-12");
    expect(anoMesDoInstante("lixo")).toBe("");
  });
  it("sem argumento devolve um mês válido", () => {
    expect(anoMesValido(anoMesAtualBrasilia())).toBe(true);
  });
});

describe("somarMeses e rotuloDoMes", () => {
  it("anterior, próximo e a virada do ano", () => {
    expect(somarMeses("2026-11", -1)).toBe("2026-10");
    expect(somarMeses("2026-11", 1)).toBe("2026-12");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2027-01", -1)).toBe("2026-12");
    expect(somarMeses("2026-01", -13)).toBe("2024-12");
    expect(somarMeses("2026-11", 0)).toBe("2026-11");
    expect(somarMeses("2026-11", 14)).toBe("2028-01");
  });
  it("mês inválido volta como veio", () => {
    expect(somarMeses("novembro", 1)).toBe("novembro");
    expect(somarMeses("2026-13", 1)).toBe("2026-13");
  });
  it("o mês por extenso, com inicial maiúscula (como o título do resumo)", () => {
    expect(rotuloDoMes("2026-11")).toBe("Novembro/2026");
    expect(rotuloDoMes("2027-03")).toBe("Março/2027");
    expect(rotuloDoMes("2026-01")).toBe("Janeiro/2026");
    expect(rotuloDoMes("2026-00")).toBe("");
    expect(rotuloDoMes("")).toBe("");
  });
  it("anoMesValido", () => {
    for (const bom of ["2026-11", "2026-01", "2026-12"]) expect(anoMesValido(bom), bom).toBe(true);
    for (const ruim of ["2026-13", "2026-00", "2026-1", "26-11", "novembro", "", null, undefined, 202611]) expect(anoMesValido(ruim), String(ruim)).toBe(false);
  });
});

describe("título da compra", () => {
  it("'Compra 13 - Novembro/2026' e o rótulo curto com 2 dígitos", () => {
    expect(tituloDaCompra("2026-11", 13)).toBe("Compra 13 - Novembro/2026");
    expect(tituloDaCompra("2026-11", 1)).toBe("Compra 01 - Novembro/2026");
    expect(tituloDaCompra("2026-11", 123)).toBe("Compra 123 - Novembro/2026");
    expect(rotuloCurtoDaCompra(5)).toBe("Compra 05");
  });

  it("é IGUAL à primeira linha do resumo (sem os asteriscos)", () => {
    for (const [anoMes, sequencia] of [["2026-11", 13], ["2027-01", 1], ["2026-03", 105]] as const) {
      const compra = compraVaziaDeTeste({ anoMes, sequencia });
      const primeiraLinha = montarResumoCompra(compraParaResumoEntrada(compra)).split("\n")[0]!;
      expect(primeiraLinha).toBe(`*${tituloDaCompra(anoMes, sequencia)}*`);
    }
  });
});

describe("hora e minuto de BRASÍLIA", () => {
  it("16:22 em Brasília, qualquer que seja o fuso da máquina", () => {
    expect(horaMinutoBrasilia("2026-11-19T19:22:10.000Z")).toBe("16:22");
    expect(horaMinutoBrasilia(new Date("2026-11-19T19:22:59Z"))).toBe("16:22");
    expect(horaMinutoBrasilia(Date.parse("2026-11-19T19:22:00Z"))).toBe("16:22");
  });
  it("meia-noite é 00:xx (nunca 24:xx) e preenche com zero", () => {
    expect(horaMinutoBrasilia("2026-11-20T03:05:00Z")).toBe("00:05");
    expect(horaMinutoBrasilia("2026-11-19T12:09:00Z")).toBe("09:09");
  });
  it("instante inválido: ''", () => {
    expect(horaMinutoBrasilia("lixo")).toBe("");
  });
});
