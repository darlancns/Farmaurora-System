import { describe, expect, it } from "vitest";
import { capitalizarPrimeiraLetra, rotaForaDaRegra } from "../../app/utils/primeiraMaiuscula";

// Função pura da regra global "todo campo de texto começa com letra maiúscula".

describe("capitalizarPrimeiraLetra", () => {
  it.each([
    ["maria", "Maria"],
    ["  maria", "  Maria"],
    ["élida", "Élida"],
    ["a", "A"],
    ["maRIA", "MaRIA"],
    ["maria silva", "Maria silva"], // só a PRIMEIRA letra: o resto não é alterado
    ["\tmaria", "\tMaria"],
    ["ánibal", "Ánibal"],
    ["ç", "Ç"],
    ["ìtalo", "Ìtalo"],
  ])("%j → %j", (entrada, esperado) => {
    expect(capitalizarPrimeiraLetra(entrada)).toBe(esperado);
  });

  it.each([
    ["123abc"],
    [""],
    ["Maria"],
    ["   "],
    ["\n"],
    ["#maria"],
    ['"maria"'],
    ["-maria"],
    ["1maria"],
    ["MARIA"],
    ["  Maria"],
    ["日本語"],
  ])("sem mudança: %j", (entrada) => {
    expect(capitalizarPrimeiraLetra(entrada)).toBe(entrada);
  });

  it("não altera o tamanho do texto (o cursor não se desloca)", () => {
    for (const texto of ["ßeta", "ǆ", "ŉ", "maria", "élida"]) {
      expect(capitalizarPrimeiraLetra(texto).length).toBe(texto.length);
    }
  });

  it("letra cujo maiúsculo muda o tamanho (ß → SS) fica como está", () => {
    expect(capitalizarPrimeiraLetra("ßeta")).toBe("ßeta");
  });

  it("usa a regra de pt-BR (sem o 'i' pontuado do turco)", () => {
    expect(capitalizarPrimeiraLetra("isabel")).toBe("Isabel");
  });

  it("idempotente", () => {
    for (const texto of ["maria", "  élida", "123", ""]) {
      const uma = capitalizarPrimeiraLetra(texto);
      expect(capitalizarPrimeiraLetra(uma)).toBe(uma);
    }
  });
});

describe("rotaForaDaRegra (guarda temporária da DIR)", () => {
  it("a DIR e suas subrotas ficam fora", () => {
    expect(rotaForaDaRegra("/dir")).toBe(true);
    expect(rotaForaDaRegra("/dir/")).toBe(true);
    expect(rotaForaDaRegra("/dir/qualquer")).toBe(true);
  });

  it("as demais telas entram na regra (inclusive caminhos que só começam com 'dir')", () => {
    for (const rota of ["/", "/processos", "/prestacao", "/pagamentos", "/recados", "/configuracoes", "/login", "/direcao"]) {
      expect(rotaForaDaRegra(rota), rota).toBe(false);
    }
  });
});
