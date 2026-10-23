import { describe, expect, it } from "vitest";
import {
  dataBrasiliaDe,
  diferencaEmDias,
  ehDataFutura,
  formatarDataBR,
  formatarDataLongaBR,
  hojeBrasilia,
  parseDataISO,
  somarDiasISO,
} from "../../shared/utils/dataBrasilia";

// Rodar com TZ=UTC, TZ=America/Sao_Paulo e TZ=Pacific/Honolulu: o resultado é o mesmo, porque
// tudo parte de instantes (ISO com offset) e do Intl com timeZone fixo.

// Instante a partir de um horário de parede de Brasília (UTC-3).
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe("hojeBrasilia — virada do dia em Brasília", () => {
  it("20:59 BRT ainda é o mesmo dia (UTC já em 23:59)", () => {
    expect(hojeBrasilia(brt("2026-10-21T20:59:00"))).toBe("2026-10-21");
  });

  it("21:00 BRT continua o mesmo dia (era aqui que o UTC virava para o dia seguinte)", () => {
    expect(hojeBrasilia(brt("2026-10-21T21:00:00"))).toBe("2026-10-21");
    expect(new Date(brt("2026-10-21T21:00:00")).toISOString().slice(0, 10)).toBe("2026-10-22"); // o bug antigo
  });

  it("23:59 BRT ainda é o mesmo dia e 00:00 BRT já é o seguinte", () => {
    expect(hojeBrasilia(brt("2026-10-21T23:59:59"))).toBe("2026-10-21");
    expect(hojeBrasilia(brt("2026-10-22T00:00:00"))).toBe("2026-10-22");
  });

  it("virada de mês: 31/10 23:59 → 01/11 00:00", () => {
    expect(hojeBrasilia(brt("2026-10-31T23:59:59"))).toBe("2026-10-31");
    expect(hojeBrasilia(brt("2026-11-01T00:00:00"))).toBe("2026-11-01");
    expect(hojeBrasilia(brt("2026-10-31T22:30:00"))).toBe("2026-10-31");
  });

  it("virada de ano: 31/12 23:59 → 01/01 00:00", () => {
    expect(hojeBrasilia(brt("2026-12-31T23:59:59"))).toBe("2026-12-31");
    expect(hojeBrasilia(brt("2027-01-01T00:00:00"))).toBe("2027-01-01");
  });

  it("ano bissexto: 28/02 e 29/02 de 2028", () => {
    expect(hojeBrasilia(brt("2028-02-29T22:00:00"))).toBe("2028-02-29");
    expect(hojeBrasilia(brt("2028-03-01T00:00:00"))).toBe("2028-03-01");
  });

  it("usa o fuso de Brasília também no passado (sem depender de offset fixo)", () => {
    // 2018 ainda tinha horário de verão (UTC-2): 23:30 BRST de 15/01 = 01:30Z de 16/01.
    expect(hojeBrasilia(new Date("2018-01-16T01:30:00Z"))).toBe("2018-01-15");
  });
});

describe("dataBrasiliaDe", () => {
  it("aceita Date, string ISO e número, e devolve o dia de Brasília", () => {
    expect(dataBrasiliaDe("2026-10-22T01:00:00.000Z")).toBe("2026-10-21");
    expect(dataBrasiliaDe(new Date("2026-10-22T03:00:00.000Z"))).toBe("2026-10-22");
    expect(dataBrasiliaDe(Date.parse("2026-10-22T02:59:59.999Z"))).toBe("2026-10-21");
  });

  it("o pagoEm de uma correção (meio-dia UTC) cai no mesmo dia em Brasília", () => {
    expect(dataBrasiliaDe("2026-03-10T12:00:00.000Z")).toBe("2026-03-10");
  });

  it("instante inválido devolve string vazia", () => {
    expect(dataBrasiliaDe("lixo")).toBe("");
  });
});

describe("parseDataISO — sem erro de um dia", () => {
  it("lê os componentes exatamente como escritos", () => {
    expect(parseDataISO("2026-10-21")).toEqual({ ano: 2026, mes: 10, dia: 21 });
    expect(parseDataISO("2026-01-01")).toEqual({ ano: 2026, mes: 1, dia: 1 });
    expect(parseDataISO("2026-12-31")).toEqual({ ano: 2026, mes: 12, dia: 31 });
  });

  it("rejeita datas que não existem e formatos errados", () => {
    expect(parseDataISO("2026-02-30")).toBeNull();
    expect(parseDataISO("2027-02-29")).toBeNull();
    expect(parseDataISO("2028-02-29")).toEqual({ ano: 2028, mes: 2, dia: 29 });
    expect(parseDataISO("2026-13-01")).toBeNull();
    expect(parseDataISO("2026-00-10")).toBeNull();
    expect(parseDataISO("21/10/2026")).toBeNull();
    expect(parseDataISO("2026-10-21T10:00:00Z")).toBeNull();
    expect(parseDataISO("")).toBeNull();
  });
});

describe("formatarDataBR / formatarDataLongaBR (só texto)", () => {
  it("dd/mm/aaaa e data longa", () => {
    expect(formatarDataBR("2026-01-05")).toBe("05/01/2026");
    expect(formatarDataBR("2026-12-31")).toBe("31/12/2026");
    expect(formatarDataLongaBR("2026-10-20")).toBe("20 de outubro de 2026");
    expect(formatarDataLongaBR("2026-03-05")).toBe("05 de março de 2026");
  });

  it("inválida devolve string vazia", () => {
    expect(formatarDataBR("2026-02-31")).toBe("");
    expect(formatarDataLongaBR("lixo")).toBe("");
  });
});

describe("ehDataFutura — a mesma regra do cliente e do servidor", () => {
  const as22h = brt("2026-10-21T22:00:00");

  it("aceita hoje às 22:00 BRT (UTC já é amanhã)", () => {
    expect(ehDataFutura("2026-10-21", as22h)).toBe(false);
  });

  it("rejeita amanhã de Brasília, mesmo às 22:00 BRT", () => {
    expect(ehDataFutura("2026-10-22", as22h)).toBe(true);
  });

  it("aceita datas passadas e rejeita texto que não é data", () => {
    expect(ehDataFutura("2020-03-10", as22h)).toBe(false);
    expect(ehDataFutura("depois", as22h)).toBe(false);
  });

  it("depois da meia-noite BRT, o dia seguinte passa a ser hoje", () => {
    expect(ehDataFutura("2026-10-22", brt("2026-10-22T00:00:00"))).toBe(false);
    expect(ehDataFutura("2026-10-23", brt("2026-10-22T00:00:00"))).toBe(true);
  });
});

describe("somarDiasISO / diferencaEmDias — calendário civil", () => {
  it("soma atravessando mês e ano", () => {
    expect(somarDiasISO("2026-10-30", 3)).toBe("2026-11-02");
    expect(somarDiasISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDiasISO("2028-02-27", 3)).toBe("2028-03-01");
    expect(somarDiasISO("2026-01-02", -3)).toBe("2025-12-30");
    expect(somarDiasISO("2026-10-21", 0)).toBe("2026-10-21");
  });

  it("diferença em dias corridos", () => {
    expect(diferencaEmDias("2026-09-08", "2026-09-04")).toBe(4);
    expect(diferencaEmDias("2027-01-01", "2026-12-31")).toBe(1);
    expect(diferencaEmDias("2026-09-04", "2026-09-08")).toBe(-4);
    expect(Number.isNaN(diferencaEmDias("x", "2026-09-08"))).toBe(true);
  });

  it("data inválida devolve string vazia", () => {
    expect(somarDiasISO("2026-02-31", 1)).toBe("");
  });
});
