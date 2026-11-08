import { describe, expect, it } from "vitest";
import {
  NUMERO_ORDEM_ERRO,
  NUMERO_ORDEM_LIMITE,
  formatarNumeroOrdem,
  mascararNumeroOrdem,
  normalizarNumeroOrdem,
  numeroOrdemValido,
} from "#shared/utils/numeroOrdem";

// Item 7 do lote Follow-Up — Nº Ordem (PO): máscara PO-00-0000[/texto], normalização e validação.

// Simula o campo: a pessoa digita caractere a caractere (cursor sempre no fim), cada edição passa pela máscara.
function digitar(texto: string, inicial = ""): string {
  let atual = inicial;
  for (const ch of texto) atual = formatarNumeroOrdem(atual + ch, atual);
  return atual;
}

// Uma edição no meio do campo: troca [inicio, fim) de `valor` por `inserido`, cursor depois do inserido.
function editar(valor: string, inicio: number, fim: number, inserido = "") {
  const texto = valor.slice(0, inicio) + inserido + valor.slice(fim);
  return mascararNumeroOrdem(texto, { anterior: valor, cursor: inicio + inserido.length });
}

describe("máscara: digitação", () => {
  it("o prefixo PO- entra sozinho", () => {
    expect(formatarNumeroOrdem("p")).toBe("PO-");
    expect(formatarNumeroOrdem("po")).toBe("PO-");
    expect(formatarNumeroOrdem("PO")).toBe("PO-");
    expect(formatarNumeroOrdem("2")).toBe("PO-2");
  });

  it("digitar 'po-25-0123' caractere a caractere", () => {
    expect(digitar("po")).toBe("PO-");
    expect(digitar("po-")).toBe("PO-");
    expect(digitar("po-2")).toBe("PO-2");
    expect(digitar("po-25")).toBe("PO-25");
    expect(digitar("po-25-")).toBe("PO-25"); // o "-" é digitado mas nunca fica sobrando
    expect(digitar("po-25-0")).toBe("PO-25-0");
    expect(digitar("po-25-0123")).toBe("PO-25-0123");
  });

  it("digitar só os números já monta a máscara", () => {
    expect(digitar("250123")).toBe("PO-25-0123");
    expect(digitar("2501")).toBe("PO-25-01");
  });

  it("aceita só dígitos nas duas partes: letras e símbolos antes da barra somem", () => {
    expect(formatarNumeroOrdem("PO-2a5-0b1c2.3")).toBe("PO-25-0123");
    expect(formatarNumeroOrdem("PO-ab")).toBe("PO-");
  });

  it("não passa de 2 + 4 dígitos antes da barra", () => {
    expect(formatarNumeroOrdem("PO-25-01234")).toBe("PO-25-0123");
    expect(digitar("2501234567")).toBe("PO-25-0123");
  });

  it("a barra só libera o texto livre com os 4 dígitos completos", () => {
    expect(digitar("po-25-012/")).toBe("PO-25-012"); // incompleto: barra ignorada
    expect(digitar("po-25/")).toBe("PO-25");
    expect(digitar("po-25-0123/")).toBe("PO-25-0123/");
  });

  it("depois da barra tudo é aceito e vira maiúsculo (letras, números, espaço, símbolos, acento)", () => {
    expect(digitar("po-25-0123/alguma coisa 9 (x)")).toBe("PO-25-0123/ALGUMA COISA 9 (X)");
    expect(digitar("po-25-0123/ação")).toBe("PO-25-0123/AÇÃO");
    expect(digitar("po-25-0123/a/b")).toBe("PO-25-0123/A/B"); // barras extras fazem parte do texto
  });

  it("limite de 60 caracteres no total", () => {
    const longo = formatarNumeroOrdem("PO-25-0123/" + "x".repeat(100));
    expect(longo).toHaveLength(NUMERO_ORDEM_LIMITE);
    expect(longo).toBe("PO-25-0123/" + "X".repeat(49));
    expect(digitar("po-25-0123/" + "x".repeat(100))).toHaveLength(NUMERO_ORDEM_LIMITE);
  });
});

describe("máscara: colar", () => {
  it("colar 'po 25 0123' (espaços no lugar de hífens)", () => {
    expect(formatarNumeroOrdem("po 25 0123")).toBe("PO-25-0123");
  });

  it("colar 'PO-25-0123/abc'", () => {
    expect(formatarNumeroOrdem("PO-25-0123/abc")).toBe("PO-25-0123/ABC");
  });

  it("colar com espaços nas pontas e sem prefixo", () => {
    expect(formatarNumeroOrdem("  25-0123  ")).toBe("PO-25-0123");
    expect(formatarNumeroOrdem("25-0123/Fornecedor X")).toBe("PO-25-0123/FORNECEDOR X");
  });

  it("colar só espaços ou nada: campo vazio", () => {
    expect(formatarNumeroOrdem("")).toBe("");
    expect(formatarNumeroOrdem("   ")).toBe("");
  });

  it("colar valor já mascarado não muda nada (idempotente)", () => {
    for (const v of ["PO-", "PO-2", "PO-25", "PO-25-0", "PO-25-0123", "PO-25-0123/XYZ"]) {
      expect(formatarNumeroOrdem(v, v), v).toBe(v);
    }
  });

  it("colar por cima de um valor existente (campo inteiro selecionado)", () => {
    expect(formatarNumeroOrdem("po 26 0001", "PO-25-0123/ABC")).toBe("PO-26-0001");
  });
});

describe("máscara: apagar", () => {
  it("backspace no FIM, passo a passo, não trava em '-' nem em '/'", () => {
    let v = "PO-25-0123/AB";
    const passos: string[] = [];
    while (v !== "") {
      const depois = formatarNumeroOrdem(v.slice(0, -1), v);
      expect(depois.length, `de "${v}"`).toBeLessThan(v.length);
      passos.push(depois);
      v = depois;
    }
    expect(passos).toEqual([
      "PO-25-0123/A",
      "PO-25-0123/",
      "PO-25-0123",
      "PO-25-012",
      "PO-25-01",
      "PO-25-0",
      "PO-25",
      "PO-2",
      "PO-",
      "",
    ]);
  });

  it("apagar o '-' do prefixo ('PO-' → 'PO') limpa o campo", () => {
    expect(formatarNumeroOrdem("PO", "PO-")).toBe("");
  });

  it("apagar o último dígito deixa 'PO-' (e não 'PO')", () => {
    expect(formatarNumeroOrdem("PO-", "PO-2")).toBe("PO-");
  });

  it("selecionar tudo e apagar limpa", () => {
    expect(formatarNumeroOrdem("", "PO-25-0123/ABC")).toBe("");
  });

  it("backspace NO MEIO: apagar um dígito reajusta a máscara e o cursor fica ao lado do ponto apagado", () => {
    // "PO-25-0123" cursor depois do "1" (posição 8); apaga o "1" → "PO-25-023", cursor 7.
    const r = editar("PO-25-0123", 7, 8);
    expect(r.valor).toBe("PO-25-023");
    expect(r.cursor).toBe(7);
  });

  it("apagar um dígito da 1ª parte puxa os seguintes e o cursor não vai para o fim", () => {
    // "PO-25-0123": apaga o "5" (índice 4) → dígitos 2,0,1,2,3 → "PO-20-123"
    const r = editar("PO-25-0123", 4, 5);
    expect(r.valor).toBe("PO-20-123");
    expect(r.cursor).toBe(4); // logo depois do "2"
  });

  it("backspace logo depois do '-' do meio não apaga nada visível, mas o cursor anda (não trava)", () => {
    // "PO-25-|0123" (cursor 6): backspace apaga o "-" → texto "PO-250123", cursor 5 → valor igual, cursor antes do "-"
    const r = editar("PO-25-0123", 5, 6);
    expect(r.valor).toBe("PO-25-0123");
    expect(r.cursor).toBe(5);
  });

  it("apagar um dígito ANTES da barra mantém o texto livre", () => {
    const r = editar("PO-25-0123/ABC", 9, 10); // apaga o "3"
    expect(r.valor).toBe("PO-25-012/ABC");
    expect(r.cursor).toBe(9);
    // digitar o dígito de volta, no mesmo ponto, restaura tudo
    const volta = editar(r.valor, 9, 9, "3");
    expect(volta.valor).toBe("PO-25-0123/ABC");
    expect(volta.cursor).toBe(10);
  });

  it("apagar um caractere do texto livre", () => {
    const r = editar("PO-25-0123/ABCD", 13, 14); // apaga o "C"
    expect(r.valor).toBe("PO-25-0123/ABD");
    expect(r.cursor).toBe(13);
  });
});

describe("máscara: cursor", () => {
  it("digitando no fim, o cursor fica no fim", () => {
    expect(mascararNumeroOrdem("2", { cursor: 1 })).toEqual({ valor: "PO-2", cursor: 4 });
    expect(mascararNumeroOrdem("PO-25-0", { anterior: "PO-25", cursor: 7 })).toEqual({ valor: "PO-25-0", cursor: 7 });
  });

  it("depois do prefixo digitado, o cursor fica depois de 'PO-'", () => {
    expect(mascararNumeroOrdem("p", { cursor: 1 })).toEqual({ valor: "PO-", cursor: 3 });
  });

  it("inserir um dígito no meio empurra o cursor junto com o dígito", () => {
    const r = editar("PO-25-0123", 3, 3, "9"); // antes do "2"
    expect(r.valor).toBe("PO-92-5012");
    expect(r.cursor).toBe(4);
  });

  it("sem cursor informado, vai para o fim", () => {
    const r = mascararNumeroOrdem("po 25 0123/abc");
    expect(r.valor).toBe("PO-25-0123/ABC");
    expect(r.cursor).toBe(r.valor.length);
  });
});

describe("normalizarNumeroOrdem", () => {
  it("vazio, só espaços, null e undefined viram null", () => {
    expect(normalizarNumeroOrdem("")).toBeNull();
    expect(normalizarNumeroOrdem("   ")).toBeNull();
    expect(normalizarNumeroOrdem(null)).toBeNull();
    expect(normalizarNumeroOrdem(undefined)).toBeNull();
  });

  it("trim e maiúsculas", () => {
    expect(normalizarNumeroOrdem("  po-25-0123  ")).toBe("PO-25-0123");
    expect(normalizarNumeroOrdem("po-25-0123/alguma coisa")).toBe("PO-25-0123/ALGUMA COISA");
  });

  it("barra final sem texto depois é removida", () => {
    expect(normalizarNumeroOrdem("PO-25-0123/")).toBe("PO-25-0123");
    expect(normalizarNumeroOrdem("PO-25-0123/  ")).toBe("PO-25-0123");
    expect(normalizarNumeroOrdem("PO-25-0123 /")).toBe("PO-25-0123");
    expect(normalizarNumeroOrdem("PO-25-0123//")).toBe("PO-25-0123");
  });

  it("barra com texto depois fica", () => {
    expect(normalizarNumeroOrdem("PO-25-0123/x")).toBe("PO-25-0123/X");
  });

  it("é idempotente", () => {
    for (const v of ["po-25-0123/", "  PO-25-0123/ab  ", "PO-25-0123//", "x", ""]) {
      const um = normalizarNumeroOrdem(v);
      expect(normalizarNumeroOrdem(um), v).toBe(um);
    }
  });
});

describe("numeroOrdemValido", () => {
  it("vazio é válido", () => {
    for (const v of ["", "  ", null, undefined]) expect(numeroOrdemValido(v), String(v)).toBe(true);
  });

  it("formatos válidos", () => {
    for (const v of ["PO-25-0123", "po-25-0123", "  PO-25-0123 ", "PO-25-0123/X", "PO-25-0123/alguma coisa", "PO-25-0123/", "PO-00-0000"]) {
      expect(numeroOrdemValido(v), v).toBe(true);
    }
  });

  it("formatos inválidos", () => {
    for (const v of [
      "PO-25-01", // incompleto
      "PO-25",
      "PO-",
      "PO",
      "25-0123", // sem o prefixo
      "PO-2-0123",
      "PO-25-012",
      "PO-25-01234",
      "PO-253-0123",
      "PO-25-0123X", // sem a barra
      "PO-25-0123 X",
      "PO 25 0123",
      "PO-AB-0123",
      "XX-25-0123",
      "PO-25-0123\n/X",
    ]) {
      expect(numeroOrdemValido(v), v).toBe(false);
    }
  });

  it("limite de 60 caracteres", () => {
    expect(numeroOrdemValido("PO-25-0123/" + "A".repeat(49))).toBe(true); // 60
    expect(numeroOrdemValido("PO-25-0123/" + "A".repeat(50))).toBe(false); // 61
  });

  it("a mensagem de erro é a combinada", () => {
    expect(NUMERO_ORDEM_ERRO).toBe("Nº Ordem inválido. Use o formato PO-00-0000 (opcionalmente seguido de /texto).");
  });
});

describe("a saída da máscara completa é sempre válida; a incompleta nunca é", () => {
  it("completo", () => {
    for (const v of ["po 25 0123", "PO-25-0123/abc", "25 0123/x y z", "po-25-0123/"]) {
      expect(numeroOrdemValido(formatarNumeroOrdem(v)), v).toBe(true);
    }
  });

  it("incompleto", () => {
    for (const v of ["p", "po-2", "po-25-01", "25 012"]) {
      expect(numeroOrdemValido(formatarNumeroOrdem(v)), v).toBe(false);
    }
  });
});
