import { describe, expect, it } from "vitest";
import {
  aumentarNumeroRemessa,
  diminuirNumeroRemessa,
  finalizarNumeroRemessa,
  podeAumentarNumeroRemessa,
  podeDiminuirNumeroRemessa,
  NUMERO_REMESSA_ERRO,
  NUMERO_REMESSA_MAXIMO,
  mascararNumeroRemessa,
  normalizarNumeroRemessa,
  numeroRemessaValido,
} from "../../shared/utils/numeroRemessa";

// Nº Ordem: inteiro >= 1, sempre com valor. A mesma função vale no cliente e no servidor.

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
    expect(NUMERO_REMESSA_ERRO).toBe("Nº Ordem inválido. Use um número inteiro maior ou igual a 1.");
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

describe("stepper — aumentar e diminuir", () => {
  it("aumentar soma 1 (texto ou número; vazio e 0 valem 1)", () => {
    expect(aumentarNumeroRemessa("1")).toBe("2");
    expect(aumentarNumeroRemessa("9")).toBe("10");
    expect(aumentarNumeroRemessa(" 12 ")).toBe("13");
    expect(aumentarNumeroRemessa("")).toBe("2");
    expect(aumentarNumeroRemessa("0")).toBe("2");
  });

  it("aumentar para no máximo (2147483647) e não passa dele", () => {
    expect(aumentarNumeroRemessa("2147483646")).toBe("2147483647");
    expect(aumentarNumeroRemessa("2147483647")).toBe("2147483647");
    expect(aumentarNumeroRemessa("9999999999")).toBe("2147483647"); // acima do máximo conta como o máximo
  });

  it("diminuir subtrai 1 e PARA em 1", () => {
    expect(diminuirNumeroRemessa("5")).toBe("4");
    expect(diminuirNumeroRemessa("2")).toBe("1");
    expect(diminuirNumeroRemessa("1")).toBe("1");
    expect(diminuirNumeroRemessa("")).toBe("1");
    expect(diminuirNumeroRemessa("0")).toBe("1");
    expect(diminuirNumeroRemessa("2147483647")).toBe("2147483646");
  });

  it("o resultado nunca sai de 1..2147483647, qualquer que seja a entrada", () => {
    for (const v of ["", "0", "1", "2", "abc", "2147483647", "99999999999", "-3"]) {
      for (const r of [aumentarNumeroRemessa(v), diminuirNumeroRemessa(v)]) {
        const n = Number(r);
        expect(Number.isInteger(n), `${v} → ${r}`).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2147483647);
      }
    }
  });
});

describe("stepper — botões habilitados", () => {
  it("'−' fica desabilitado em 1, no campo vazio e em 0 (todos valem 1)", () => {
    for (const v of ["1", "", "0", " "]) expect(podeDiminuirNumeroRemessa(v), JSON.stringify(v)).toBe(false);
    expect(podeDiminuirNumeroRemessa("2")).toBe(true);
    expect(podeDiminuirNumeroRemessa("2147483647")).toBe(true);
  });

  it("'+' fica desabilitado no máximo e acima dele", () => {
    expect(podeAumentarNumeroRemessa("2147483646")).toBe(true);
    expect(podeAumentarNumeroRemessa("1")).toBe(true);
    expect(podeAumentarNumeroRemessa("")).toBe(true);
    expect(podeAumentarNumeroRemessa("2147483647")).toBe(false);
    expect(podeAumentarNumeroRemessa("9999999999")).toBe(false);
  });
});

describe("stepper — sair do campo (blur)", () => {
  it("vazio e 0 viram '1'; zeros à esquerda somem", () => {
    expect(finalizarNumeroRemessa("")).toBe("1");
    expect(finalizarNumeroRemessa("   ")).toBe("1");
    expect(finalizarNumeroRemessa("0")).toBe("1");
    expect(finalizarNumeroRemessa("007")).toBe("7");
  });

  it("valor válido fica igual; acima do máximo fica como está (a validação recusa ao salvar)", () => {
    expect(finalizarNumeroRemessa("12")).toBe("12");
    expect(finalizarNumeroRemessa("2147483647")).toBe("2147483647");
    expect(finalizarNumeroRemessa("9999999999")).toBe("9999999999");
  });
});
