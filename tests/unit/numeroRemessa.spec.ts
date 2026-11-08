import { describe, expect, it } from "vitest";
import {
  NUMERO_REMESSA_ERRO,
  NUMERO_REMESSA_MAXIMO,
  mascararNumeroRemessa,
  normalizarNumeroRemessa,
  numeroRemessaValido,
} from "../../shared/utils/numeroRemessa";

// Nº Remessa: inteiro >= 1, sempre com valor. A mesma função vale no cliente e no servidor.

describe("normalizarNumeroRemessa", () => {
  it.each([
    [1, 1],
    ["1", 1],
    [" 12 ", 12],
    ["007", 7],
    [5, 5],
    [2147483647, 2147483647],
    ["2147483647", 2147483647],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizarNumeroRemessa(entrada)).toBe(esperado);
  });

  it.each([[0], ["0"], ["000"], [""], ["   "], [null], [undefined]])("%j (vazio ou zero) vira 1", (entrada) => {
    expect(normalizarNumeroRemessa(entrada)).toBe(1);
  });

  it.each([
    ["abc"],
    ["1.5"],
    ["1,5"],
    [1.5],
    [-3],
    ["-3"],
    ["+3"],
    ["1e3"],
    ["12abc"],
    [2147483648],
    ["2147483648"],
    ["99999999999999999999"],
    [NaN],
    [Infinity],
    [true],
    [{}],
    [[1]],
  ])("%j é inválido (undefined)", (entrada) => {
    expect(normalizarNumeroRemessa(entrada)).toBeUndefined();
  });

  it("o resultado é sempre um inteiro entre 1 e o máximo do integer do Postgres", () => {
    for (const v of [0, 1, 2, 99, 2147483647, "5", "", null, undefined]) {
      const n = normalizarNumeroRemessa(v);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(NUMERO_REMESSA_MAXIMO);
    }
  });

  it("é idempotente", () => {
    for (const v of [" 12 ", "007", 0, "", null]) {
      const uma = normalizarNumeroRemessa(v);
      expect(normalizarNumeroRemessa(uma)).toBe(uma);
    }
  });
});

describe("numeroRemessaValido", () => {
  it("vazio e zero valem (viram 1); texto, decimal, negativo e acima do máximo não", () => {
    expect(numeroRemessaValido("")).toBe(true);
    expect(numeroRemessaValido(null)).toBe(true);
    expect(numeroRemessaValido(0)).toBe(true);
    expect(numeroRemessaValido(2147483647)).toBe(true);
    expect(numeroRemessaValido("abc")).toBe(false);
    expect(numeroRemessaValido("1.5")).toBe(false);
    expect(numeroRemessaValido(-3)).toBe(false);
    expect(numeroRemessaValido(2147483648)).toBe(false);
  });

  it("a mensagem de erro é a combinada", () => {
    expect(NUMERO_REMESSA_ERRO).toBe("Nº Remessa inválido. Use um número inteiro maior ou igual a 1.");
  });
});

describe("mascararNumeroRemessa (campo do formulário)", () => {
  it("só dígitos: letras, 'e', '+', '-' e '.' são descartados", () => {
    expect(mascararNumeroRemessa("12abc").valor).toBe("12");
    expect(mascararNumeroRemessa("1e3").valor).toBe("13");
    expect(mascararNumeroRemessa("+5").valor).toBe("5");
    expect(mascararNumeroRemessa("-5").valor).toBe("5");
    expect(mascararNumeroRemessa("1.5").valor).toBe("15");
    expect(mascararNumeroRemessa("1 2").valor).toBe("12");
  });

  it("sem zeros à esquerda (e '0' sozinho some, o salvamento vale 1)", () => {
    expect(mascararNumeroRemessa("007").valor).toBe("7");
    expect(mascararNumeroRemessa("0").valor).toBe("");
    expect(mascararNumeroRemessa("0000").valor).toBe("");
    expect(mascararNumeroRemessa("100").valor).toBe("100"); // zeros do meio/fim ficam
  });

  it("no máximo 10 dígitos (cabe o 2147483647); passar do máximo é caso da validação", () => {
    expect(mascararNumeroRemessa("2147483647").valor).toBe("2147483647");
    expect(mascararNumeroRemessa("123456789012").valor).toBe("1234567890");
  });

  it("vazio continua vazio", () => {
    expect(mascararNumeroRemessa("")).toEqual({ valor: "", cursor: 0 });
  });

  it("o cursor acompanha o que saiu antes dele", () => {
    // "1a|" (cursor depois do 'a'): o 'a' sai, o cursor fica depois do "1".
    expect(mascararNumeroRemessa("1a", 2)).toEqual({ valor: "1", cursor: 1 });
    // "0|7": o zero à esquerda sai e o cursor (depois do 0) vai para o começo.
    expect(mascararNumeroRemessa("07", 1)).toEqual({ valor: "7", cursor: 0 });
    // sem cursor informado, vai para o fim.
    expect(mascararNumeroRemessa("12x").cursor).toBe(2);
  });
});
