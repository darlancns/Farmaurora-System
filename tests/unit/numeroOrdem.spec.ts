import { describe, expect, it } from "vitest";
import {
  NUMERO_ORDEM_ERRO,
  NUMERO_ORDEM_LIMITE,
  formatarNumeroOrdem,
  mascararNumeroOrdem,
  normalizarNumeroOrdem,
  numeroOrdemValido,
} from "#shared/utils/numeroOrdem";

// Item 7 do lote Follow-Up (regra da Cris, 2ª versão) — Nº Ordem (PO): PO-00-0000 com barra automática e só
// números depois da barra; máscara, normalização e validação. Incompleto é permitido.

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

// Apaga com backspace no fim, até esvaziar; devolve todos os estados.
function apagarAteOFim(valor: string): string[] {
  const estados: string[] = [];
  let v = valor;
  while (v !== "") {
    const depois = formatarNumeroOrdem(v.slice(0, -1), v);
    expect(depois.length, `de "${v}"`).toBeLessThan(v.length); // sempre avança: nunca trava
    estados.push(depois);
    v = depois;
  }
  return estados;
}

describe("máscara: digitação tecla a tecla", () => {
  it("o prefixo PO- entra sozinho", () => {
    expect(formatarNumeroOrdem("p")).toBe("PO-");
    expect(formatarNumeroOrdem("po")).toBe("PO-");
    expect(formatarNumeroOrdem("PO")).toBe("PO-");
    expect(formatarNumeroOrdem("2")).toBe("PO-2");
    expect(digitar("po")).toBe("PO-");
    expect(digitar("PO-")).toBe("PO-");
  });

  it("o hífen nunca fica pendurado: 'po-25-' vira 'PO-25'; ele aparece com o 3º dígito", () => {
    expect(digitar("po-2")).toBe("PO-2");
    expect(digitar("po-25")).toBe("PO-25");
    expect(digitar("po-25-")).toBe("PO-25");
    expect(digitar("po-25-1")).toBe("PO-25-1");
    expect(digitar("po-25-11")).toBe("PO-25-11");
  });

  it("só os números já monta a máscara", () => {
    expect(digitar("2526523")).toBe("PO-25-2652/3");
    expect(digitar("2511")).toBe("PO-25-11");
  });

  it("parou nos 4 dígitos da sequência: sem barra no fim", () => {
    expect(digitar("252652")).toBe("PO-25-2652");
    expect(digitar("po-25-2652")).toBe("PO-25-2652");
  });

  it("barra AUTOMÁTICA: o 5º dígito da sequência vai para depois da barra", () => {
    expect(digitar("25265")).toBe("PO-25-265");
    expect(digitar("252652")).toBe("PO-25-2652");
    expect(formatarNumeroOrdem("PO-25-26523", "PO-25-2652")).toBe("PO-25-2652/3");
    expect(digitar("2526523")).toBe("PO-25-2652/3");
    expect(digitar("25265234")).toBe("PO-25-2652/34");
  });

  it("barra MANUAL: com ao menos 1 dígito da sequência, a '/' é aceita para continuar", () => {
    expect(digitar("po-25-11/")).toBe("PO-25-11/");
    expect(digitar("po-25-1/")).toBe("PO-25-1/");
    expect(digitar("po-25-2652/")).toBe("PO-25-2652/");
    expect(digitar("po-25-11/12")).toBe("PO-25-11/12");
    expect(digitar("po-25-2652/3")).toBe("PO-25-2652/3");
  });

  it("antes de haver dígito na sequência, a '/' é ignorada", () => {
    expect(digitar("/")).toBe("");
    expect(digitar("po/")).toBe("PO-");
    expect(digitar("po-2/")).toBe("PO-2");
    expect(digitar("po-25/")).toBe("PO-25");
    expect(digitar("po-25-/")).toBe("PO-25");
  });

  it("depois da barra SÓ dígitos: letras, espaços e símbolos são descartados", () => {
    expect(digitar("po-25-11/ab")).toBe("PO-25-11/");
    expect(digitar("po-25-11/a1 b-2!")).toBe("PO-25-11/12");
    expect(digitar("po-25-2652/3x/y")).toBe("PO-25-2652/3"); // barras extras também caem
  });

  it("letras e símbolos antes da barra também somem", () => {
    expect(digitar("po-2a5-1b1")).toBe("PO-25-11");
    expect(digitar("po-ab")).toBe("PO-");
    expect(digitar("xyz", "PO-")).toBe("PO-"); // já só havia o prefixo: o lixo é ignorado
  });

  it("limite de 30 caracteres no total", () => {
    const base = "PO-25-2652/";
    const cheio = formatarNumeroOrdem(base + "1".repeat(40));
    expect(cheio).toHaveLength(NUMERO_ORDEM_LIMITE);
    expect(cheio).toBe(base + "1".repeat(19));
    expect(digitar("252652" + "7".repeat(40))).toHaveLength(NUMERO_ORDEM_LIMITE);
    expect(NUMERO_ORDEM_LIMITE).toBe(30);
  });
});

describe("máscara: colar", () => {
  it("'po 25 11' → PO-25-11", () => {
    expect(formatarNumeroOrdem("po 25 11")).toBe("PO-25-11");
  });

  it("'PO-25-2652/3' → igual", () => {
    expect(formatarNumeroOrdem("PO-25-2652/3")).toBe("PO-25-2652/3");
  });

  it("'po-25-2652-3' → PO-25-2652/3 (hífen extra entre blocos de dígitos é descartado)", () => {
    expect(formatarNumeroOrdem("po-25-2652-3")).toBe("PO-25-2652/3");
  });

  it("outros formatos colados", () => {
    expect(formatarNumeroOrdem("  25 11  ")).toBe("PO-25-11");
    expect(formatarNumeroOrdem("po 25 11/12")).toBe("PO-25-11/12");
    expect(formatarNumeroOrdem("25-2652 / 3")).toBe("PO-25-2652/3");
    expect(formatarNumeroOrdem("25265234")).toBe("PO-25-2652/34");
    expect(formatarNumeroOrdem("25/11")).toBe("PO-25-11"); // barra antes da sequência é ignorada
  });

  it("valor antigo com texto livre depois da barra: o texto cai, a barra fica para continuar", () => {
    expect(formatarNumeroOrdem("PO-25-0123/ABC")).toBe("PO-25-0123/");
    expect(formatarNumeroOrdem("PO-25-0123/ABC 7")).toBe("PO-25-0123/7");
  });

  it("texto sem dígitos (e que não é o prefixo) → vazio", () => {
    expect(formatarNumeroOrdem("")).toBe("");
    expect(formatarNumeroOrdem("   ")).toBe("");
    expect(formatarNumeroOrdem("pasta sem numeros")).toBe("");
    expect(formatarNumeroOrdem("abc")).toBe("");
    expect(formatarNumeroOrdem("///")).toBe("");
  });

  it("colar por cima de um valor existente (campo inteiro selecionado)", () => {
    expect(formatarNumeroOrdem("po 26 7", "PO-25-2652/3")).toBe("PO-26-7");
  });

  it("idempotente: valor já mascarado não muda", () => {
    for (const v of ["PO-", "PO-2", "PO-25", "PO-25-1", "PO-25-11", "PO-25-2652", "PO-25-11/", "PO-25-2652/", "PO-25-2652/3", "PO-25-11/12"]) {
      expect(formatarNumeroOrdem(v, v), v).toBe(v);
      expect(formatarNumeroOrdem(v), v).toBe(v);
    }
  });
});

describe("máscara: apagar", () => {
  it("backspace no fim passa por todos os estados: PO-25-11/3 → PO-25-11/ → PO-25-11", () => {
    expect(apagarAteOFim("PO-25-11/3")).toEqual(["PO-25-11/", "PO-25-11", "PO-25-1", "PO-25", "PO-2", "PO-", ""]);
  });

  it("backspace no fim de uma barra automática", () => {
    expect(apagarAteOFim("PO-25-2652/3")).toEqual([
      "PO-25-2652/",
      "PO-25-2652",
      "PO-25-265",
      "PO-25-26",
      "PO-25-2",
      "PO-25",
      "PO-2",
      "PO-",
      "",
    ]);
  });

  it("backspace no fim com vários dígitos depois da barra", () => {
    expect(apagarAteOFim("PO-25-11/12").slice(0, 3)).toEqual(["PO-25-11/1", "PO-25-11/", "PO-25-11"]);
  });

  it("apagar o '-' do prefixo ('PO-' → 'PO') limpa o campo; apagar o último dígito deixa 'PO-'", () => {
    expect(formatarNumeroOrdem("PO", "PO-")).toBe("");
    expect(formatarNumeroOrdem("PO-", "PO-2")).toBe("PO-");
  });

  it("selecionar tudo e apagar limpa", () => {
    expect(formatarNumeroOrdem("", "PO-25-2652/3")).toBe("");
  });

  it("backspace NO MEIO: apagar um dígito da sequência reajusta a máscara e o cursor fica no ponto", () => {
    // "PO-25-2652": apaga o "6" (índice 7) → "PO-25-252", cursor 7.
    const r = editar("PO-25-2652", 7, 8);
    expect(r.valor).toBe("PO-25-252");
    expect(r.cursor).toBe(7);
  });

  it("apagar um dígito do ano puxa os seguintes e o cursor não vai para o fim", () => {
    // "PO-25-2652": apaga o "5" (índice 4) → dígitos 2,2,6,5,2 → "PO-22-652"
    const r = editar("PO-25-2652", 4, 5);
    expect(r.valor).toBe("PO-22-652");
    expect(r.cursor).toBe(4);
  });

  it("backspace logo depois do '-' do meio: o valor fica igual, o cursor anda (não trava)", () => {
    const r = editar("PO-25-11", 5, 6); // "PO-25-|11" → apaga o "-"
    expect(r.valor).toBe("PO-25-11");
    expect(r.cursor).toBe(5);
  });

  it("apagar um dígito depois da barra e no meio dela", () => {
    const r = editar("PO-25-11/345", 10, 11); // apaga o "4"
    expect(r.valor).toBe("PO-25-11/35");
    expect(r.cursor).toBe(10);
  });

  it("apagar um dígito ANTES da barra mantém os dígitos depois dela", () => {
    const r = editar("PO-25-11/3", 7, 8); // apaga o 2º "1"
    expect(r.valor).toBe("PO-25-1/3");
    expect(r.cursor).toBe(7);
    // digitar o dígito de volta, no mesmo ponto, restaura tudo
    const volta = editar(r.valor, 7, 7, "1");
    expect(volta.valor).toBe("PO-25-11/3");
    expect(volta.cursor).toBe(8);
  });
});

describe("máscara: cursor", () => {
  it("digitando no fim, o cursor fica no fim", () => {
    expect(mascararNumeroOrdem("2", { cursor: 1 })).toEqual({ valor: "PO-2", cursor: 4 });
    expect(mascararNumeroOrdem("PO-25-1", { anterior: "PO-25", cursor: 7 })).toEqual({ valor: "PO-25-1", cursor: 7 });
  });

  it("o 5º dígito empurra para depois da barra e o cursor acompanha (depois do dígito)", () => {
    expect(mascararNumeroOrdem("PO-25-26523", { anterior: "PO-25-2652", cursor: 11 })).toEqual({
      valor: "PO-25-2652/3",
      cursor: 12,
    });
  });

  it("digitar a '/' manual deixa o cursor depois dela", () => {
    expect(mascararNumeroOrdem("PO-25-11/", { anterior: "PO-25-11", cursor: 9 })).toEqual({ valor: "PO-25-11/", cursor: 9 });
  });

  it("depois do prefixo digitado, o cursor fica depois de 'PO-'", () => {
    expect(mascararNumeroOrdem("p", { cursor: 1 })).toEqual({ valor: "PO-", cursor: 3 });
  });

  it("inserir um dígito no meio empurra o cursor junto com o dígito", () => {
    const r = editar("PO-25-11", 3, 3, "9"); // antes do "2"
    expect(r.valor).toBe("PO-92-511");
    expect(r.cursor).toBe(4);
  });

  it("sem cursor informado, vai para o fim", () => {
    const r = mascararNumeroOrdem("po 25 2652 3");
    expect(r.valor).toBe("PO-25-2652/3");
    expect(r.cursor).toBe(r.valor.length);
  });
});

describe("normalizarNumeroOrdem", () => {
  it("vazio, só espaços, null, undefined, 'PO' e 'PO-' viram null", () => {
    for (const v of ["", "   ", null, undefined, "PO", "PO-", "po", " po- ", "PO-/", "/"]) {
      expect(normalizarNumeroOrdem(v), String(v)).toBeNull();
    }
  });

  it("trim e maiúsculas", () => {
    expect(normalizarNumeroOrdem("  po-25-11  ")).toBe("PO-25-11");
    expect(normalizarNumeroOrdem("po-25-2652/3")).toBe("PO-25-2652/3");
  });

  it("barra final sem dígitos depois é removida", () => {
    expect(normalizarNumeroOrdem("PO-25-11/")).toBe("PO-25-11");
    expect(normalizarNumeroOrdem("PO-25-11/  ")).toBe("PO-25-11");
    expect(normalizarNumeroOrdem("PO-25-11 /")).toBe("PO-25-11");
    expect(normalizarNumeroOrdem("PO-25-11//")).toBe("PO-25-11");
  });

  it("barra com dígitos depois fica; incompleto fica como está", () => {
    expect(normalizarNumeroOrdem("PO-25-11/3")).toBe("PO-25-11/3");
    expect(normalizarNumeroOrdem("PO-25")).toBe("PO-25");
    expect(normalizarNumeroOrdem("PO-25-1")).toBe("PO-25-1");
  });

  it("é idempotente", () => {
    for (const v of ["po-25-11/", "  PO-25-11/3  ", "PO-25-11//", "PO-", "x", ""]) {
      const um = normalizarNumeroOrdem(v);
      expect(normalizarNumeroOrdem(um), v).toBe(um);
    }
  });
});

describe("numeroOrdemValido (o que o servidor aceita)", () => {
  it("vazio é válido", () => {
    for (const v of ["", "  ", null, undefined, "PO-", "PO"]) expect(numeroOrdemValido(v), String(v)).toBe(true);
  });

  it("tudo que a máscara pode produzir, inclusive incompleto", () => {
    for (const v of [
      "PO-25-2652",
      "PO-25-11",
      "PO-25-1",
      "PO-25",
      "PO-2",
      "PO-25-2652/3",
      "PO-25-11/12",
      "PO-25-11/",
      "po-25-11",
      "  PO-25-11 ",
      "PO-25-2652/" + "1".repeat(19), // 30 caracteres
    ]) {
      expect(numeroOrdemValido(v), v).toBe(true);
    }
  });

  it("qualquer outra coisa é inválida", () => {
    for (const v of [
      "PO-25-0123/ABC", // texto livre
      "PO-25-11/ABC",
      "PO-25-11/3A",
      "XX-25-1",
      "PO-255",
      "PO-25-12345",
      "PO-25-",
      "PO-25-11 /3",
      "PO-25-2652/3/4",
      "25-11",
      "PO 25 11",
      "PO-AB-11",
      "PO-25-11\n/3",
      "PO-25-2652/" + "1".repeat(20), // 31 caracteres
    ]) {
      expect(numeroOrdemValido(v), v).toBe(false);
    }
  });

  it("a mensagem de erro é a combinada", () => {
    expect(NUMERO_ORDEM_ERRO).toBe("Nº Ordem inválido. Use o formato PO-00-0000 (opcionalmente seguido de / e números).");
  });
});

describe("a saída da máscara é sempre aceita pela validação", () => {
  it("digitando ou colando qualquer coisa", () => {
    for (const v of ["p", "po-2", "po-25-1", "po 25 11", "po-25-2652-3", "25265234", "po-25-11/ab", "PO-25-0123/ABC", "x1y2z3"]) {
      expect(numeroOrdemValido(formatarNumeroOrdem(v)), v).toBe(true);
      expect(numeroOrdemValido(digitar(v)), v).toBe(true);
    }
  });
});
