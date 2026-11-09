import { describe, expect, it } from "vitest";
import {
  ehPlaceholderTracos,
  normalizarResponsavel,
  normalizarVendedor,
  parseBooleanoPlanilha,
  parseCsv,
  parseDataEntrega,
  parseDataPagamento,
  parseDataPlanilha,
  parseDirCsv,
  parseStatusDir,
} from "../../shared/utils/dirParser";
import { CABECALHO, CASCA, csv, linhaCsv } from "./helpers/dirCsv";

// CSV 100% SINTÉTICO (tests/unit/helpers/dirCsv.ts): nomes e dados inventados — nunca colar linha real
// da planilha aqui. As datas são texto puro, então estes testes devem passar com TZ=UTC,
// TZ=America/Sao_Paulo e TZ=Pacific/Honolulu (CLAUDE.md).

describe("parseCsv", () => {
  it("campos entre aspas com vírgula, aspas duplicadas e quebra de linha", () => {
    expect(parseCsv('a,"b,c","d ""e""","f\ng"\n1,2,3,4\n')).toEqual([
      ["a", "b,c", 'd "e"', "f\ng"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("CRLF, BOM e arquivo sem quebra de linha no fim", () => {
    expect(parseCsv("﻿a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("células vazias nas pontas", () => {
    expect(parseCsv(",a,\n")).toEqual([["", "a", ""]]);
  });
});

describe("parseDataPlanilha (dd.mm.aa-dia)", () => {
  it("converte para ISO e descarta o dia da semana", () => {
    expect(parseDataPlanilha("05.01.26-segunda-feira")).toEqual({ ok: true, valor: "2026-01-05" });
    expect(parseDataPlanilha("26.11.26-quinta-feira")).toEqual({ ok: true, valor: "2026-11-26" });
  });

  it("sábado e domingo (sem '-feira')", () => {
    expect(parseDataPlanilha("03.01.26-sábado")).toEqual({ ok: true, valor: "2026-01-03" });
    expect(parseDataPlanilha("04.01.26-domingo")).toEqual({ ok: true, valor: "2026-01-04" });
  });

  it("rejeita dia da semana que não confere", () => {
    const r = parseDataPlanilha("05.01.26-terça-feira");
    expect(r.ok).toBe(false);
  });

  it("rejeita data inexistente e formato desconhecido", () => {
    expect(parseDataPlanilha("31.02.26-segunda-feira").ok).toBe(false);
    expect(parseDataPlanilha("2026-01-05").ok).toBe(false);
    expect(parseDataPlanilha("05.01.26").ok).toBe(false);
  });
});

describe("parseDataPagamento (dd/mm/aaaa)", () => {
  it("converte para ISO", () => {
    expect(parseDataPagamento("10/02/2026")).toEqual({ ok: true, valor: "2026-02-10" });
  });

  it("rejeita inexistente, ISO e formato curto", () => {
    expect(parseDataPagamento("31/02/2026").ok).toBe(false);
    expect(parseDataPagamento("2026-02-10").ok).toBe(false);
    expect(parseDataPagamento("1/2/26").ok).toBe(false);
  });
});

describe("parseDataEntrega (dentro do STATUS)", () => {
  it.each([
    ["28.01.26", "2026-01-28"],
    ["19/8/26", "2026-08-19"],
    ["6/2/26", "2026-02-06"],
    ["4/9/2026", "2026-09-04"],
  ])("%s → %s", (entrada, iso) => {
    expect(parseDataEntrega(entrada)).toEqual({ ok: true, valor: iso });
  });

  it("rejeita data inexistente", () => {
    expect(parseDataEntrega("31/2/26").ok).toBe(false);
  });
});

describe("parseStatusDir", () => {
  it.each([
    ["Entregue 28.01.26", "entregue", "2026-01-28", false],
    ["Entregue: 19/8/26", "entregue", "2026-08-19", false],
    ["Entrega 30.03.26", "entregue", "2026-03-30", true],
    ["On going", "on_going", "", false],
    ["CANCELADA", "cancelado", "", false],
    ["CANCELADO", "cancelado", "", true],
    ["FALECIMENTO", "falecimento", "", false],
  ])("%s", (entrada, status, dataEntrega, grafiaIrregular) => {
    expect(parseStatusDir(entrada)).toEqual({ ok: true, valor: { status, dataEntrega, grafiaIrregular } });
  });

  it("vazio e só traços → status nulo (sem erro)", () => {
    for (const v of ["", "   ", "----------------------------"]) {
      expect(parseStatusDir(v)).toEqual({ ok: true, valor: { status: null, dataEntrega: "", grafiaIrregular: false } });
    }
  });

  it("texto desconhecido e data inválida são erro", () => {
    expect(parseStatusDir("INDEFERIDO").ok).toBe(false);
    expect(parseStatusDir("Entregue 31.02.26").ok).toBe(false);
  });
});

describe("parseBooleanoPlanilha", () => {
  it("aceita os dois dialetos, sem diferenciar caixa", () => {
    for (const v of ["TRUE", "true", "VERDADEIRO", "Verdadeiro"]) expect(parseBooleanoPlanilha(v)).toEqual({ ok: true, valor: true });
    for (const v of ["FALSE", "FALSO", "falso"]) expect(parseBooleanoPlanilha(v)).toEqual({ ok: true, valor: false });
  });

  it("vazio é null; qualquer outra coisa é erro", () => {
    expect(parseBooleanoPlanilha("  ")).toEqual({ ok: true, valor: null });
    expect(parseBooleanoPlanilha("SIM").ok).toBe(false);
  });
});

describe("normalizarVendedor / normalizarResponsavel", () => {
  it("mapeia para o nome canônico", () => {
    expect(normalizarVendedor("Mateus")).toEqual({ nome: "Mateus Morais", literal: false });
    expect(normalizarVendedor("André")).toEqual({ nome: "André Vitório", literal: false });
    expect(normalizarVendedor("Vinicius")).toEqual({ nome: "Vinícius Alves", literal: false });
    expect(normalizarVendedor("Ga Megda")).toEqual({ nome: "Gabriela Megda", literal: false });
    expect(normalizarVendedor("Gabi Santana")).toEqual({ nome: "Gabriela Santana", literal: false });
    expect(normalizarVendedor("Paulo Braga")).toEqual({ nome: "Paulo Braga", literal: false });
  });

  it("Braulio (3RB), Daniel Donato, ASD, Junior e Rodrigo ficam LITERAIS", () => {
    for (const v of ["Braulio (3RB)", "Daniel Donato", "ASD", "Junior", "Rodrigo"]) {
      expect(normalizarVendedor(v)).toEqual({ nome: v, literal: true });
    }
  });

  it("responsável: Re → Rebeca; Bruno fica; outro passa literal como desconhecido", () => {
    expect(normalizarResponsavel("Re")).toEqual({ nome: "Rebeca", conhecido: true });
    expect(normalizarResponsavel("Bruno")).toEqual({ nome: "Bruno", conhecido: true });
    expect(normalizarResponsavel("Fulano")).toEqual({ nome: "Fulano", conhecido: false });
  });
});

describe("ehPlaceholderTracos", () => {
  it("só traços", () => {
    expect(ehPlaceholderTracos("-----")).toBe(true);
    expect(ehPlaceholderTracos("")).toBe(false);
    expect(ehPlaceholderTracos("12-34")).toBe(false);
  });
});

describe("parseDirCsv", () => {
  it("linha normal vira registro completo (datas ISO, booleanos, vendedor e responsável normalizados)", () => {
    const r = parseDirCsv(csv(linhaCsv()));
    expect(r.colunasAusentes).toEqual([]);
    expect(r.colunasExtras).toEqual([]);
    const linha = r.linhas[0]!;
    expect(linha.linha).toBe(2);
    expect(linha.erros).toEqual([]);
    expect(linha.registro).toMatchObject({
      po: "PO26-01-0001",
      conferido: true,
      vendedor: "Mateus Morais",
      responsavel: "Rebeca",
      exigencia: false,
      dataEmissao: "2026-01-05",
      dataCobrancaFornecedores: "2026-01-08",
      status: "entregue",
      dataEntrega: "2026-01-28",
      dataPagamento: "2026-02-10",
      operacaoEncerrada: true,
      dactes: true,
      swift: false,
      termometro: false,
      banco: "Rendimento",
    });
  });

  it("linha casca (sem PO e sem paciente) é ignorada, mesmo com checkboxes preenchidos", () => {
    const r = parseDirCsv(csv(linhaCsv(), CASCA, CASCA));
    expect(r.linhas.map((l) => l.ignorada)).toEqual([false, true, true]);
    expect(r.linhas[1]!.registro).toBeNull();
    expect(r.linhas[1]!.erros).toEqual([]);
  });

  it("PO vazio ou fora do padrão e paciente vazio são ERRO (linha rejeitada)", () => {
    const r = parseDirCsv(csv(linhaCsv({ po: "" }), linhaCsv({ po: "PO26-1-0001" }), linhaCsv({ paciente: "" })));
    expect(r.linhas.map((l) => l.registro)).toEqual([null, null, null]);
    expect(r.linhas[0]!.erros).toContain("PO vazio");
    expect(r.linhas[1]!.erros[0]).toMatch(/fora do padrão/);
    expect(r.linhas[2]!.erros).toContain("PACIENTE vazio");
  });

  it("valores inválidos são erro: data, dia da semana, booleano, operação, status", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ emissao: "31.02.26-segunda-feira" }),
        linhaCsv({ emissao: "05.01.26-terça-feira" }),
        linhaCsv({ exigencia: "TALVEZ" }),
        linhaCsv({ operacao: "Parado" }),
        linhaCsv({ status: "INDEFERIDO" }),
        linhaCsv({ pagamento: "10-02-2026" }),
      ),
    );
    for (const l of r.linhas) {
      expect(l.registro).toBeNull();
      expect(l.erros.length).toBeGreaterThan(0);
    }
  });

  it("PO repetido e número repetido em meses diferentes são AVISO (importa as duas linhas)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-03-0109", paciente: "PACIENTE TESTE A (Ordem 1)", emissao: "12.03.26-quinta-feira", cobranca: "17.03.26-terça-feira", status: "On going" }),
        linhaCsv({ po: "PO26-03-0109", paciente: "PACIENTE TESTE A (Ordem 2)", emissao: "26.03.26-quinta-feira", cobranca: "26.03.26-quinta-feira", status: "On going" }),
        linhaCsv({ po: "PO26-07-0382", paciente: "PACIENTE TESTE B", emissao: "31.07.26-sexta-feira", cobranca: "04.08.26-terça-feira", status: "On going" }),
        linhaCsv({ po: "PO26-08-0382", paciente: "PACIENTE TESTE C", emissao: "03.08.26-segunda-feira", cobranca: "06.08.26-quinta-feira", status: "On going" }),
      ),
    );
    expect(r.linhas.every((l) => l.registro !== null)).toBe(true);
    const codigos = (i: number) => r.linhas[i]!.avisos.map((a) => a.codigo);
    expect(codigos(0)).toContain("PO_REPETIDO");
    expect(codigos(1)).toContain("PO_REPETIDO");
    expect(codigos(2)).toContain("NUMERO_PO_REPETIDO");
    expect(codigos(3)).toContain("NUMERO_PO_REPETIDO");
    expect(codigos(2)).not.toContain("PO_REPETIDO");
  });

  it("datas suspeitas são AVISO: entrega antes da emissão e emissão futura (com `hoje`)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-07-0325", emissao: "06.07.26-segunda-feira", cobranca: "09.07.26-quinta-feira", status: "Entregue 04.04.26" }),
        linhaCsv({ po: "PO26-07-0377", emissao: "26.11.26-quinta-feira", cobranca: "01.12.26-terça-feira", status: "On going" }),
      ),
      { hoje: "2026-10-26" },
    );
    expect(r.linhas[0]!.registro).not.toBeNull();
    expect(r.linhas[0]!.avisos.map((a) => a.codigo)).toContain("ENTREGA_ANTES_EMISSAO");
    expect(r.linhas[1]!.registro).not.toBeNull();
    expect(r.linhas[1]!.avisos.map((a) => a.codigo)).toContain("EMISSAO_FUTURA");
  });

  it("sem `hoje` não há aviso de data futura", () => {
    const r = parseDirCsv(csv(linhaCsv({ emissao: "26.11.26-quinta-feira", cobranca: "01.12.26-terça-feira" })));
    expect(r.linhas[0]!.avisos.map((a) => a.codigo)).not.toContain("EMISSAO_FUTURA");
  });

  it("status vazio / só traços → status nulo + aviso; AWB e contrato só com traços → vazios + aviso", () => {
    const r = parseDirCsv(csv(linhaCsv({ status: "" }), linhaCsv({ status: "-----", awb: "-----", contrato: "--------" })));
    expect(r.linhas[0]!.registro!.status).toBeNull();
    expect(r.linhas[1]!.registro).toMatchObject({ status: null, awb: "", contratoCambio: "" });
    expect(r.linhas[1]!.avisos.filter((a) => a.codigo === "PLACEHOLDER_TRACOS")).toHaveLength(2);
    expect(r.linhas[1]!.avisos.map((a) => a.codigo)).toContain("STATUS_VAZIO");
  });

  it("booleano vazio vira falso com aviso; responsável vazio fica vazio", () => {
    const r = parseDirCsv(csv(linhaCsv({ exigencia: "", termometro: "", responsavel: "" })));
    const l = r.linhas[0]!;
    expect(l.registro).toMatchObject({ exigencia: false, termometro: false, responsavel: "" });
    expect(l.avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(["BOOLEANO_VAZIO", "RESPONSAVEL_VAZIO"]));
  });

  it("vendedor literal gera aviso e fica como está na planilha", () => {
    const r = parseDirCsv(csv(linhaCsv({ vendedor: "Braulio (3RB)" })));
    expect(r.linhas[0]!.registro!.vendedor).toBe("Braulio (3RB)");
    expect(r.linhas[0]!.avisos.map((a) => a.codigo)).toContain("VENDEDOR_LITERAL");
  });

  it("coluna obrigatória ausente é reportada; coluna desconhecida também (FECHAMENTOS RESTANTES é conhecida, não é extra)", () => {
    const semBanco = CABECALHO.replace(",BANCO,", ",OUTRA COLUNA,");
    const r = parseDirCsv(`${semBanco}\n${linhaCsv()}\n`);
    expect(r.colunasAusentes).toEqual(["BANCO"]);
    expect(r.colunasExtras).toEqual(["OUTRA COLUNA"]);
  });

  it("PACIENTE nunca aparece nas mensagens de erro/aviso", () => {
    const nome = "NOME SENSIVEL DE TESTE";
    const r = parseDirCsv(
      csv(
        linhaCsv({ paciente: nome, po: "PO26-03-0109", emissao: "31.02.26-segunda-feira" }),
        linhaCsv({ paciente: nome, po: "PO26-03-0109", vendedor: "ASD", status: "" }),
        linhaCsv({ paciente: nome, po: "PO26-03-0109", vendedor: "ASD", status: "" }),
      ),
    );
    const textos = r.linhas.flatMap((l) => [...l.erros, ...l.avisos.map((a) => a.mensagem)]);
    expect(textos.length).toBeGreaterThan(0);
    expect(textos.join("\n")).not.toContain(nome);
  });

  it("espaços duplicados e nas pontas são normalizados", () => {
    const r = parseDirCsv(csv(linhaCsv({ medicamento: "  MEDICAMENTO   X  ", paciente: " PACIENTE   TESTE " })));
    expect(r.linhas[0]!.registro).toMatchObject({ medicamento: "MEDICAMENTO X", paciente: "PACIENTE TESTE" });
  });
});
