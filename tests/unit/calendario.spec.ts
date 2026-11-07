import { describe, expect, it } from "vitest";
import {
  dentroDoIntervalo,
  diaDaSemana,
  diasNoMes,
  ehBissexto,
  formatarEscolha,
  gradeDoMes,
  interpretarValor,
  limitarAoIntervalo,
  mesForaDoIntervalo,
  rotuloDoDia,
  somarAnos,
  somarMeses,
  textoParaExibir,
  tituloDoMes,
} from "../../app/utils/calendario";

// Lógica pura do calendário próprio. "Hoje" é sempre injetado (aqui 2026-11-07).
const HOJE = "2026-11-07";

describe("anos bissextos e dias do mês", () => {
  it.each([
    [2024, true],
    [2028, true],
    [2000, true],
    [1900, false],
    [2100, false],
    [2026, false],
    [2025, false],
  ])("ehBissexto(%i) = %s", (ano, esperado) => {
    expect(ehBissexto(ano)).toBe(esperado);
  });

  it("fevereiro: 28 ou 29 dias", () => {
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2024, 2)).toBe(29);
    expect(diasNoMes(1900, 2)).toBe(28);
    expect(diasNoMes(2000, 2)).toBe(29);
  });

  it("meses de 30 e 31 dias", () => {
    expect([1, 3, 5, 7, 8, 10, 12].every((m) => diasNoMes(2026, m) === 31)).toBe(true);
    expect([4, 6, 9, 11].every((m) => diasNoMes(2026, m) === 30)).toBe(true);
  });
});

describe("diaDaSemana (0 = domingo)", () => {
  it("datas conhecidas", () => {
    expect(diaDaSemana("2026-11-01")).toBe(0); // domingo
    expect(diaDaSemana("2026-11-07")).toBe(6); // sábado
    expect(diaDaSemana("2024-02-29")).toBe(4); // quinta
    expect(diaDaSemana("2000-01-01")).toBe(6);
  });

  it("data inválida", () => {
    expect(diaDaSemana("2026-02-30")).toBe(-1);
    expect(diaDaSemana("abc")).toBe(-1);
  });
});

describe("gradeDoMes — domingo primeiro, 6 semanas", () => {
  it("novembro/2026 começa num domingo: sem dias do mês anterior na 1ª linha", () => {
    const g = gradeDoMes(2026, 11);
    expect(g).toHaveLength(6);
    expect(g.every((semana) => semana.length === 7)).toBe(true);
    expect(g[0]![0]).toEqual({ iso: "2026-11-01", dia: 1, doMes: true });
    expect(g[0]![6]!.iso).toBe("2026-11-07");
    expect(g[4]![1]).toEqual({ iso: "2026-11-30", dia: 30, doMes: true });
    expect(g[4]![2]).toEqual({ iso: "2026-12-01", dia: 1, doMes: false }); // dia do mês seguinte
  });

  it("o mês que não começa no domingo traz os dias do mês anterior (esmaecidos)", () => {
    const g = gradeDoMes(2026, 10); // outubro/2026 começa numa quinta
    expect(g[0]!.map((c) => c.iso)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(g[0]!.map((c) => c.doMes)).toEqual([false, false, false, false, true, true, true]);
  });

  it("a coluna 0 é sempre domingo", () => {
    for (const [a, m] of [[2026, 2], [2024, 2], [2026, 11], [2027, 1], [1999, 12]] as const) {
      expect(gradeDoMes(a, m).every((semana) => diaDaSemana(semana[0]!.iso) === 0), `${a}-${m}`).toBe(true);
    }
  });

  it("fevereiro comum (28) e bissexto (29)", () => {
    const dias = (a: number, m: number) => gradeDoMes(a, m).flat().filter((c) => c.doMes).length;
    expect(dias(2026, 2)).toBe(28);
    expect(dias(2024, 2)).toBe(29);
    expect(gradeDoMes(2024, 2).flat().some((c) => c.iso === "2024-02-29" && c.doMes)).toBe(true);
    expect(gradeDoMes(2026, 2).flat().some((c) => c.iso === "2026-02-29")).toBe(false);
  });

  it("virada de ano: dezembro mostra janeiro; janeiro mostra dezembro", () => {
    expect(gradeDoMes(2026, 12).flat().some((c) => c.iso === "2027-01-02" && !c.doMes)).toBe(true);
    expect(gradeDoMes(2027, 1).flat().some((c) => c.iso === "2026-12-31" && !c.doMes)).toBe(true);
  });

  it("não repete nem pula dias", () => {
    const todos = gradeDoMes(2026, 3).flat().map((c) => c.iso);
    expect(new Set(todos).size).toBe(42);
    expect([...todos].sort()).toEqual(todos);
  });
});

describe("somarMeses / somarAnos", () => {
  it("mantém o dia", () => {
    expect(somarMeses("2026-11-07", 1)).toBe("2026-12-07");
    expect(somarMeses("2026-11-07", -1)).toBe("2026-10-07");
  });

  it("vira o ano nos dois sentidos", () => {
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(somarMeses("2026-01-15", -1)).toBe("2025-12-15");
    expect(somarMeses("2026-11-07", 14)).toBe("2028-01-07");
  });

  it("dia que não existe no mês de destino vai para o último dia", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2024-01-31", 1)).toBe("2024-02-29");
    expect(somarMeses("2026-03-31", -1)).toBe("2026-02-28");
    expect(somarMeses("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("29/02 + 1 ano cai em 28/02 (ano comum)", () => {
    expect(somarAnos("2024-02-29", 1)).toBe("2025-02-28");
    expect(somarAnos("2024-02-29", 4)).toBe("2028-02-29");
    expect(somarAnos("2026-11-07", -1)).toBe("2025-11-07");
  });

  it("data inválida devolve vazio", () => {
    expect(somarMeses("2026-02-30", 1)).toBe("");
  });
});

describe("limites min e max (inclusivos)", () => {
  it("dentroDoIntervalo", () => {
    expect(dentroDoIntervalo("2026-11-07", undefined, "2026-11-07")).toBe(true);
    expect(dentroDoIntervalo("2026-11-08", undefined, "2026-11-07")).toBe(false);
    expect(dentroDoIntervalo("2026-11-01", "2026-11-02", undefined)).toBe(false);
    expect(dentroDoIntervalo("2026-11-02", "2026-11-02", "2026-11-30")).toBe(true);
    expect(dentroDoIntervalo("2026-11-07")).toBe(true);
    expect(dentroDoIntervalo("2026-11-07", "", "")).toBe(true);
  });

  it("limitarAoIntervalo", () => {
    expect(limitarAoIntervalo("2030-01-01", undefined, HOJE)).toBe(HOJE);
    expect(limitarAoIntervalo("2020-01-01", "2026-01-01", HOJE)).toBe("2026-01-01");
    expect(limitarAoIntervalo("2026-05-05", "2026-01-01", HOJE)).toBe("2026-05-05");
  });

  it("mesForaDoIntervalo: o mês inteiro além do máximo/antes do mínimo", () => {
    expect(mesForaDoIntervalo(2026, 12, undefined, HOJE)).toBe(true);
    expect(mesForaDoIntervalo(2026, 11, undefined, HOJE)).toBe(false); // hoje está nele
    expect(mesForaDoIntervalo(2026, 10, undefined, HOJE)).toBe(false);
    expect(mesForaDoIntervalo(2026, 1, "2026-03-15", undefined)).toBe(true);
    expect(mesForaDoIntervalo(2026, 3, "2026-03-15", undefined)).toBe(false);
  });
});

describe("formatarEscolha — o que o calendário grava", () => {
  it("dd/mm, dia do ANO CORRENTE: só DD/MM", () => {
    expect(formatarEscolha("2026-08-05", "dd/mm", HOJE)).toBe("05/08");
    expect(formatarEscolha("2026-01-01", "dd/mm", HOJE)).toBe("01/01");
    expect(formatarEscolha("2026-12-31", "dd/mm", HOJE)).toBe("31/12");
  });

  it("dd/mm, dia de OUTRO ano: DD/MM/AAAA", () => {
    expect(formatarEscolha("2027-01-03", "dd/mm", HOJE)).toBe("03/01/2027");
    expect(formatarEscolha("2025-12-31", "dd/mm", HOJE)).toBe("31/12/2025");
    expect(formatarEscolha("2024-02-29", "dd/mm", HOJE)).toBe("29/02/2024");
  });

  it("o ano corrente é o de Brasília (virada do ano)", () => {
    expect(formatarEscolha("2026-12-31", "dd/mm", "2026-12-31")).toBe("31/12");
    expect(formatarEscolha("2026-12-31", "dd/mm", "2027-01-01")).toBe("31/12/2026");
    expect(formatarEscolha("2027-01-01", "dd/mm", "2027-01-01")).toBe("01/01");
  });

  it("iso: AAAA-MM-DD", () => {
    expect(formatarEscolha("2026-08-05", "iso", HOJE)).toBe("2026-08-05");
    expect(formatarEscolha("2020-03-10", "iso", HOJE)).toBe("2020-03-10");
  });

  it("nunca devolve texto com observação; data inválida devolve vazio", () => {
    expect(formatarEscolha("2026-02-30", "dd/mm", HOJE)).toBe("");
    expect(formatarEscolha("", "iso", HOJE)).toBe("");
  });
});

describe("interpretarValor — o que já está no campo", () => {
  it("vazio", () => {
    expect(interpretarValor("", "dd/mm", HOJE)).toEqual({ tipo: "vazio" });
    expect(interpretarValor("   ", "dd/mm", HOJE)).toEqual({ tipo: "vazio" });
  });

  it("data limpa DD/MM (ano corrente) e DD/MM/AAAA", () => {
    expect(interpretarValor("05/08", "dd/mm", HOJE)).toEqual({ tipo: "data", iso: "2026-08-05" });
    expect(interpretarValor("5/8", "dd/mm", HOJE)).toEqual({ tipo: "data", iso: "2026-08-05" });
    expect(interpretarValor(" 05/08/2027 ", "dd/mm", HOJE)).toEqual({ tipo: "data", iso: "2027-08-05" });
  });

  it("o 'ano corrente' vem do hoje injetado", () => {
    expect(interpretarValor("05/08", "dd/mm", "2030-01-01")).toEqual({ tipo: "data", iso: "2030-08-05" });
  });

  it.each([
    ["09/10 - agd. análise", "2026-10-09"],
    ["13/10; deferido 14/10", "2026-10-13"],
    ["26/10 (VCP)", "2026-10-26"],
    ["07/01/2027 (previsto)", "2027-01-07"],
    ["  05/09 (China adiantou o processo)", "2026-09-05"],
  ])("texto antigo que COMEÇA com data: %j pré-seleciona %s", (texto, iso) => {
    expect(interpretarValor(texto, "dd/mm", HOJE)).toEqual({ tipo: "texto", texto: texto.trim(), isoInicial: iso });
  });

  it.each([["já tem, compra recorrente"], ["ASD - agd. decisão com o local"], ["ASD"], ["semana que vem"], ["Entre 28/08 e 02/09"]])(
    "texto antigo sem data no início: %j (nada para pré-selecionar)",
    (texto) => {
      expect(interpretarValor(texto, "dd/mm", HOJE)).toEqual({ tipo: "texto", texto, isoInicial: null });
    },
  );

  it("data inexistente (31/02) é texto, sem pré-seleção", () => {
    expect(interpretarValor("31/02", "dd/mm", HOJE)).toEqual({ tipo: "texto", texto: "31/02", isoInicial: null });
    expect(interpretarValor("31/04 - algo", "dd/mm", HOJE)).toEqual({ tipo: "texto", texto: "31/04 - algo", isoInicial: null });
    expect(interpretarValor("00/10", "dd/mm", HOJE)).toMatchObject({ tipo: "texto", isoInicial: null });
    expect(interpretarValor("10/13", "dd/mm", HOJE)).toMatchObject({ tipo: "texto", isoInicial: null });
  });

  it("29/02 só existe em ano bissexto", () => {
    expect(interpretarValor("29/02", "dd/mm", "2028-05-01")).toEqual({ tipo: "data", iso: "2028-02-29" });
    expect(interpretarValor("29/02", "dd/mm", HOJE)).toMatchObject({ tipo: "texto", isoInicial: null });
    expect(interpretarValor("29/02/2024", "dd/mm", HOJE)).toEqual({ tipo: "data", iso: "2024-02-29" });
  });

  it("ano de 2 dígitos ou continuação colada não é uma data limpa nem pré-seleciona (mesmo critério dos alertas)", () => {
    expect(interpretarValor("04/11/26", "dd/mm", HOJE)).toEqual({ tipo: "texto", texto: "04/11/26", isoInicial: null });
    expect(interpretarValor("04/112", "dd/mm", HOJE)).toMatchObject({ tipo: "texto", isoInicial: null });
  });

  it("iso", () => {
    expect(interpretarValor("2026-11-05", "iso", HOJE)).toEqual({ tipo: "data", iso: "2026-11-05" });
    expect(interpretarValor("", "iso", HOJE)).toEqual({ tipo: "vazio" });
    expect(interpretarValor("05/11/2026", "iso", HOJE)).toEqual({ tipo: "texto", texto: "05/11/2026", isoInicial: null });
    expect(interpretarValor("2026-02-30", "iso", HOJE)).toMatchObject({ tipo: "texto" });
  });
});

describe("textoParaExibir", () => {
  it("o texto antigo aparece exatamente como está (sem aparar o meio, sem cortar)", () => {
    expect(textoParaExibir("ASD - agd. decisão com o local", "dd/mm", HOJE)).toBe("ASD - agd. decisão com o local");
    expect(textoParaExibir("13/10; deferido 14/10", "dd/mm", HOJE)).toBe("13/10; deferido 14/10");
  });

  it("data limpa dd/mm: como está gravada; iso: dd/mm/aaaa", () => {
    expect(textoParaExibir("05/08", "dd/mm", HOJE)).toBe("05/08");
    expect(textoParaExibir("05/08/2027", "dd/mm", HOJE)).toBe("05/08/2027");
    expect(textoParaExibir("2026-11-05", "iso", HOJE)).toBe("05/11/2026");
  });

  it("vazio", () => {
    expect(textoParaExibir("", "dd/mm", HOJE)).toBe("");
  });
});

describe("rótulos em pt-BR", () => {
  it("rotuloDoDia e tituloDoMes", () => {
    expect(rotuloDoDia("2026-11-05")).toBe("5 de novembro de 2026");
    expect(rotuloDoDia("2026-03-01")).toBe("1 de março de 2026");
    expect(tituloDoMes(2026, 11)).toBe("Novembro de 2026");
    expect(tituloDoMes(2026, 3)).toBe("Março de 2026");
  });
});
