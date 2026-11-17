import { describe, expect, it } from "vitest";
import { ehDiaUtil, feriadosNacionais, pascoa, primeiroDiaUtilApos } from "../../shared/utils/diaUtil";
import { diaDaSemana } from "../../shared/utils/dataBrasilia";

// Dia útil (Brasil): segunda a sexta, fora dos feriados nacionais (9 fixos + Sexta-feira Santa). Carnaval e Corpus
// Christi CONTAM como úteis (decisão da Cris). Calendário puro: roda igual com TZ padrão, UTC e Pacific/Honolulu.

describe("pascoa (Meeus/Jones/Butcher)", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
    [2038, "2038-04-25"], // a mais tardia possível
    [2285, "2285-03-22"], // a mais cedo possível
  ])("%i -> %s", (ano, esperado) => {
    expect(pascoa(ano)).toBe(esperado);
    expect(diaDaSemana(esperado)).toBe(0); // sempre domingo
  });
});

describe("feriadosNacionais", () => {
  it("2026: 9 fixos + Sexta-feira Santa (03/04), em ordem", () => {
    expect(feriadosNacionais(2026)).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("2027: Sexta-feira Santa em 26/03", () => {
    expect(feriadosNacionais(2027)).toEqual([
      "2027-01-01",
      "2027-03-26",
      "2027-04-21",
      "2027-05-01",
      "2027-09-07",
      "2027-10-12",
      "2027-11-02",
      "2027-11-15",
      "2027-11-20",
      "2027-12-25",
    ]);
  });

  it("Carnaval e Corpus Christi NÃO são feriados aqui (contam como dia útil)", () => {
    expect(feriadosNacionais(2026)).not.toContain("2026-02-16"); // segunda de Carnaval
    expect(feriadosNacionais(2026)).not.toContain("2026-02-17"); // terça de Carnaval
    expect(feriadosNacionais(2026)).not.toContain("2026-06-04"); // Corpus Christi
    expect(ehDiaUtil("2026-02-17")).toBe(true);
    expect(ehDiaUtil("2026-06-04")).toBe(true);
  });
});

describe("ehDiaUtil", () => {
  it("fim de semana e feriado não; dia comum sim; data inválida não", () => {
    expect(ehDiaUtil("2026-11-21")).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-22")).toBe(false); // domingo
    expect(ehDiaUtil("2026-11-20")).toBe(false); // Consciência Negra (sexta)
    expect(ehDiaUtil("2026-11-23")).toBe(true); // segunda
    expect(ehDiaUtil("2026-02-30")).toBe(false);
    expect(ehDiaUtil("")).toBe(false);
  });
});

describe("primeiroDiaUtilApos (estritamente depois do prazo)", () => {
  it.each([
    ["2026-11-19", "2026-11-23", "qui; 20/11 feriado (sex) e fim de semana"],
    ["2026-11-21", "2026-11-23", "sáb"],
    ["2026-11-27", "2026-11-30", "sex"],
    ["2026-12-23", "2026-12-24", "qua"],
    ["2026-12-31", "2027-01-04", "qui; 01/01 feriado (sex) e fim de semana"],
    ["2026-04-02", "2026-04-06", "qui; Sexta-feira Santa 03/04"],
    ["2026-04-20", "2026-04-22", "seg; Tiradentes 21/04 (ter)"],
    ["2027-03-25", "2027-03-29", "qui; Sexta-feira Santa 26/03"],
    ["2027-02-05", "2027-02-08", "sex; Carnaval 08 e 09/02 contam como úteis"],
    ["2026-11-24", "2026-11-25", "ter -> qua (dia comum)"],
    ["2026-12-24", "2026-12-28", "qui; Natal (sex) e fim de semana"],
  ])("%s -> %s (%s)", (prazo, esperado) => {
    expect(primeiroDiaUtilApos(prazo)).toBe(esperado);
  });

  it("data inválida devolve vazio", () => {
    expect(primeiroDiaUtilApos("2026-02-30")).toBe("");
    expect(primeiroDiaUtilApos("25/11/2026")).toBe("");
  });
});
