import { describe, expect, it } from "vitest";
import {
  podeResolverAlertaMandado,
  podeVerAlertaMandado,
  primeiroNomeNormalizado,
} from "../../shared/utils/mandadoPermissao";

// Regra única (tela + servidor) de quem vê e quem resolve o alerta de Mandado de Segurança.

describe("primeiroNomeNormalizado", () => {
  it("ignora maiúsculas, acentos e sobrenome", () => {
    expect(primeiroNomeNormalizado("Bruno Alves")).toBe("bruno");
    expect(primeiroNomeNormalizado("Rebeca Alcântara")).toBe("rebeca");
    expect(primeiroNomeNormalizado("  ÁLVARO  Souza")).toBe("alvaro");
    expect(primeiroNomeNormalizado("Bruno")).toBe("bruno");
    expect(primeiroNomeNormalizado(undefined)).toBe("");
    expect(primeiroNomeNormalizado("   ")).toBe("");
  });
});

describe("podeVerAlertaMandado / podeResolverAlertaMandado", () => {
  const bruno = { role: "operacional" as const, nome: "Bruno Alves" };
  const rebeca = { role: "operacional" as const, nome: "Rebeca Alcântara" };

  it("resolver é exatamente a mesma regra de ver (uma função só)", () => {
    expect(podeResolverAlertaMandado).toBe(podeVerAlertaMandado);
  });

  it("administrador: sempre, de qualquer responsável (inclusive sem responsável e sem nome)", () => {
    expect(podeVerAlertaMandado({ role: "administrador", nome: "Qualquer Um" }, "Bruno")).toBe(true);
    expect(podeVerAlertaMandado({ role: "administrador", nome: "Qualquer Um" }, "Rebeca")).toBe(true);
    expect(podeVerAlertaMandado({ role: "administrador" }, undefined)).toBe(true);
  });

  it("operacional responsável: sim (primeiro nome, sem maiúsculas/acentos)", () => {
    expect(podeVerAlertaMandado(bruno, "Bruno")).toBe(true);
    expect(podeVerAlertaMandado(rebeca, "Rebeca")).toBe(true);
    expect(podeVerAlertaMandado({ role: "operacional", nome: "BRUNO alves" }, "bruno")).toBe(true);
    expect(podeVerAlertaMandado({ role: "operacional", nome: "Rébeca" }, "REBECA")).toBe(true);
  });

  it("operacional de outro responsável: não", () => {
    expect(podeVerAlertaMandado(bruno, "Rebeca")).toBe(false);
    expect(podeVerAlertaMandado(rebeca, "Bruno")).toBe(false);
  });

  it("consultor: não (mesmo com nome igual ao do responsável)", () => {
    expect(podeVerAlertaMandado({ role: "consultor", nome: "Bruno" }, "Bruno")).toBe(false);
  });

  it("sócio: não (mesmo com nome igual ao do responsável)", () => {
    expect(podeVerAlertaMandado({ role: "socio", nome: "Bruno" }, "Bruno")).toBe(false);
  });

  it("sem login (role nula/indefinida): não", () => {
    expect(podeVerAlertaMandado({ role: null, nome: "Bruno" }, "Bruno")).toBe(false);
    expect(podeVerAlertaMandado({ role: undefined }, "Bruno")).toBe(false);
  });

  it("operacional sem nome na conta: não", () => {
    expect(podeVerAlertaMandado({ role: "operacional" }, "Bruno")).toBe(false);
    expect(podeVerAlertaMandado({ role: "operacional", nome: "" }, "Bruno")).toBe(false);
    expect(podeVerAlertaMandado({ role: "operacional", nome: null }, "Bruno")).toBe(false);
  });

  it("processo sem responsável: operacional não, administrador sim", () => {
    expect(podeVerAlertaMandado(bruno, undefined)).toBe(false);
    expect(podeVerAlertaMandado(bruno, null)).toBe(false);
    expect(podeVerAlertaMandado(bruno, "")).toBe(false);
    expect(podeVerAlertaMandado({ role: "administrador" }, "")).toBe(true);
  });
});
