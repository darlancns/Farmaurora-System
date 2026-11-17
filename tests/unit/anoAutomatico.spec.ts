import { describe, expect, it } from "vitest";
import {
  completarAno,
  interpretarDataDigitada,
  mascararDataDigitada,
} from "../../shared/utils/anoAutomatico";
import { hojeBrasilia } from "../../shared/utils/dataBrasilia";

// Ano automático (AppDatePicker com `anoAutomatico`). Função pura: "hoje" entra como texto, então o resultado não
// depende do fuso da máquina — esta suíte roda igual com TZ padrão, TZ=UTC e TZ=Pacific/Honolulu.

const HOJE = "2026-11-17";

describe("completarAno — sentido 'futuro' (prazos: próxima ocorrência, hoje conta)", () => {
  it.each([
    [22, 10, "2027-10-22"],
    [22, 1, "2027-01-22"],
    [17, 11, "2026-11-17"], // hoje conta
    [16, 11, "2027-11-16"], // ontem já passou
    [18, 11, "2026-11-18"],
    [31, 12, "2026-12-31"],
  ])("%i/%i -> %s", (dia, mes, esperado) => {
    expect(completarAno(dia, mes, HOJE, "futuro")).toBe(esperado);
  });
});

describe("completarAno — sentido 'proximo' (fatos: o ano mais perto de hoje)", () => {
  it.each([
    [13, 10, "2026-10-13"],
    [22, 1, "2027-01-22"],
    [22, 10, "2026-10-22"],
    [17, 11, "2026-11-17"],
    [20, 5, "2026-05-20"], // 181 dias atrás x 184 à frente
    [19, 5, "2026-05-19"],
  ])("%i/%i -> %s", (dia, mes, esperado) => {
    expect(completarAno(dia, mes, HOJE, "proximo")).toBe(esperado);
  });
});

describe("29/02 só em ano bissexto", () => {
  it("futuro: o próximo 29/02 que existe", () => {
    expect(completarAno(29, 2, HOJE, "futuro")).toBe("2028-02-29");
    expect(completarAno(29, 2, "2028-02-29", "futuro")).toBe("2028-02-29");
    expect(completarAno(29, 2, "2028-03-01", "futuro")).toBe("2032-02-29");
  });

  it("proximo: o 29/02 válido mais perto de hoje", () => {
    expect(completarAno(29, 2, HOJE, "proximo")).toBe("2028-02-29"); // 469 dias x 992 para 2024
    expect(completarAno(29, 2, "2025-06-01", "proximo")).toBe("2024-02-29");
    expect(completarAno(29, 2, "2024-02-20", "proximo")).toBe("2024-02-29");
  });

  it("salto secular: 2100 não é bissexto", () => {
    expect(completarAno(29, 2, "2097-03-01", "futuro")).toBe("2104-02-29");
  });
});

describe("datas que não existem não completam", () => {
  it.each([
    [31, 4],
    [31, 6],
    [30, 2],
    [32, 1],
    [0, 5],
    [10, 0],
    [10, 13],
  ])("%i/%i -> null", (dia, mes) => {
    expect(completarAno(dia, mes, HOJE, "futuro")).toBeNull();
    expect(completarAno(dia, mes, HOJE, "proximo")).toBeNull();
  });

  it("hoje inválido -> null", () => {
    expect(completarAno(10, 10, "", "futuro")).toBeNull();
  });
});

describe("virada de ano", () => {
  it("hoje = 31/12 (último dia do ano)", () => {
    const h = "2026-12-31";
    expect(completarAno(31, 12, h, "futuro")).toBe("2026-12-31");
    expect(completarAno(30, 12, h, "futuro")).toBe("2027-12-30");
    expect(completarAno(1, 1, h, "futuro")).toBe("2027-01-01");
    expect(completarAno(1, 1, h, "proximo")).toBe("2027-01-01");
    expect(completarAno(30, 12, h, "proximo")).toBe("2026-12-30");
  });

  it("hoje = 01/01", () => {
    const h = "2027-01-01";
    expect(completarAno(31, 12, h, "proximo")).toBe("2026-12-31");
    expect(completarAno(31, 12, h, "futuro")).toBe("2027-12-31");
    expect(completarAno(1, 1, h, "futuro")).toBe("2027-01-01");
    expect(completarAno(2, 1, h, "proximo")).toBe("2027-01-02");
  });
});

describe("hoje vem de Brasília, não do fuso da máquina", () => {
  it("23h de 31/12 em Brasília (02h UTC de 01/01) ainda é 31/12", () => {
    const agora = new Date("2027-01-01T02:00:00Z");
    const hoje = hojeBrasilia(agora);
    expect(hoje).toBe("2026-12-31");
    expect(completarAno(1, 1, hoje, "futuro")).toBe("2027-01-01");
    expect(completarAno(31, 12, hoje, "futuro")).toBe("2026-12-31");
  });
});

describe("mascararDataDigitada", () => {
  it.each([
    ["", ""],
    ["2", "2"],
    ["22", "22"],
    ["221", "22/1"],
    ["2210", "22/10"],
    ["22102", "22/10/2"],
    ["22102027", "22/10/2027"],
    ["221020279", "22/10/2027"], // dígito a mais é descartado
    ["22/", "22/"], // barra digitada fica (apagar com Backspace volta a "22")
    ["2/", "02/"],
    ["2/3", "02/3"],
    ["22/10/2027", "22/10/2027"],
    ["22/10/", "22/10/"],
    ["ab22c10", "22/10"],
    ["13/10 - agd. distribuição", "13/10"],
    ["/", ""],
  ])("%j -> %j", (bruto, esperado) => {
    expect(mascararDataDigitada(bruto)).toBe(esperado);
  });
});

describe("interpretarDataDigitada", () => {
  it("só dia e mês: completa o ano pelo sentido", () => {
    expect(interpretarDataDigitada("22/10", HOJE, "futuro")).toEqual({ tipo: "data", iso: "2027-10-22" });
    expect(interpretarDataDigitada("2210", HOJE, "proximo")).toEqual({ tipo: "data", iso: "2026-10-22" });
    expect(interpretarDataDigitada("22/1", HOJE, "proximo")).toEqual({ tipo: "data", iso: "2027-01-22" });
    expect(interpretarDataDigitada("22/10/", HOJE, "proximo")).toEqual({ tipo: "data", iso: "2026-10-22" });
  });

  it("ano digitado é respeitado", () => {
    expect(interpretarDataDigitada("22/10/2027", HOJE, "proximo")).toEqual({ tipo: "data", iso: "2027-10-22" });
    expect(interpretarDataDigitada("22/10/2020", HOJE, "futuro")).toEqual({ tipo: "data", iso: "2020-10-22" });
    expect(interpretarDataDigitada("22102027", HOJE, "futuro")).toEqual({ tipo: "data", iso: "2027-10-22" });
    expect(interpretarDataDigitada("2027-10-22", HOJE, "futuro")).toEqual({ tipo: "data", iso: "2027-10-22" });
  });

  it("vazio", () => {
    expect(interpretarDataDigitada("  ", HOJE, "futuro")).toEqual({ tipo: "vazio" });
  });

  it("incompleta ou inexistente", () => {
    expect(interpretarDataDigitada("22", HOJE, "futuro")).toEqual({ tipo: "invalido", motivo: "incompleta" });
    expect(interpretarDataDigitada("22/10/20", HOJE, "futuro")).toEqual({ tipo: "invalido", motivo: "incompleta" });
    expect(interpretarDataDigitada("31/04", HOJE, "futuro")).toEqual({ tipo: "invalido", motivo: "inexistente" });
    expect(interpretarDataDigitada("29/02/2027", HOJE, "futuro")).toEqual({ tipo: "invalido", motivo: "inexistente" });
    expect(interpretarDataDigitada("2027-02-30", HOJE, "futuro")).toEqual({ tipo: "invalido", motivo: "inexistente" });
  });

  it("29/02 sem ano completa para um ano bissexto", () => {
    expect(interpretarDataDigitada("29/02", HOJE, "futuro")).toEqual({ tipo: "data", iso: "2028-02-29" });
  });
});
