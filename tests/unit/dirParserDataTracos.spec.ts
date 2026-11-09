import { describe, expect, it } from "vitest";
import { ehDataSoTracos, parseDirCsv } from "../../shared/utils/dirParser";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";

// Colunas de data da planilha (emissão, cobrança aos fornecedores, pagamento): célula só com traços (2 ou mais "-", com
// espaços em volta) vale vazio, com o aviso DATA_TRACOS. Qualquer outra coisa segue como antes. Dados 100% fictícios.

function linha(campos: Parameters<typeof linhaCsv>[0]) {
  const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, ...campos })));
  const l = r.linhas.find((x) => !x.ignorada)!;
  return { registro: l.registro, avisos: l.avisos, erros: l.erros };
}

const codigos = (avisos: { codigo: string }[]) => avisos.map((a) => a.codigo);

describe("ehDataSoTracos", () => {
  it.each(["--", "-----", "  ---  ", "-----------------------------------------------", "\t--\t"])("%j é só traços", (v) => {
    expect(ehDataSoTracos(v)).toBe(true);
  });
  it.each(["-", " - ", "", "   ", "10/-/2026", "--10/02/2026", "05.01.26-segunda-feira", "- -", "—", "–––", "__", "--x"])(
    "%j não é (continua como antes)",
    (v) => {
      expect(ehDataSoTracos(v)).toBe(false);
    },
  );
});

describe("parser: data só com traços vale vazio, com aviso", () => {
  it("emissão e cobrança só com traços (o caso do PO26-10-0470) → vazias, sem erro, 1 aviso por coluna", () => {
    const l = linha({ emissao: "-----------------------------------------------", cobranca: "--------------------------------------" });
    expect(l.erros).toEqual([]);
    expect(l.registro).toMatchObject({ dataEmissao: "", dataCobrancaFornecedores: "" });
    const tracos = l.avisos.filter((a) => a.codigo === "DATA_TRACOS");
    expect(tracos.map((a) => a.mensagem)).toEqual([
      "DATA DE EMISSÃO: data com traços tratada como vazia",
      "DATA DE COBRANÇA AOS FORNECEDORES: data com traços tratada como vazia",
    ]);
    expect(codigos(l.avisos)).not.toContain("DATA_VAZIA"); // um aviso só por célula
  });

  it("data de pagamento só com traços → vazia, com o aviso", () => {
    const l = linha({ pagamento: "-----" });
    expect(l.erros).toEqual([]);
    expect(l.registro!.dataPagamento).toBe("");
    expect(l.avisos.filter((a) => a.codigo === "DATA_TRACOS").map((a) => a.mensagem)).toEqual(["DATA DE PAGAMENTO: data com traços tratada como vazia"]);
  });

  it("2 traços e espaços em volta também valem", () => {
    const l = linha({ emissao: "  --  ", cobranca: "--", pagamento: " ----- " });
    expect(l.erros).toEqual([]);
    expect(l.registro).toMatchObject({ dataEmissao: "", dataCobrancaFornecedores: "", dataPagamento: "" });
    expect(l.avisos.filter((a) => a.codigo === "DATA_TRACOS")).toHaveLength(3);
  });

  it("o aviso e a mensagem não levam nome de paciente", () => {
    const l = linha({ emissao: "-----", paciente: "PACIENTE FICTICIO ZZ" });
    for (const a of l.avisos) expect(`${a.codigo} ${a.mensagem}`).not.toMatch(/PACIENTE FICTICIO/);
  });
});

describe("parser: o que não mudou nas datas", () => {
  it("data válida segue igual, sem aviso de traços", () => {
    const l = linha({ emissao: "05.01.26-segunda-feira", cobranca: "08.01.26-quinta-feira", pagamento: "10/02/2026" });
    expect(l.erros).toEqual([]);
    expect(l.registro).toMatchObject({ dataEmissao: "2026-01-05", dataCobrancaFornecedores: "2026-01-08", dataPagamento: "2026-02-10" });
    expect(codigos(l.avisos)).not.toContain("DATA_TRACOS");
  });

  it("data vazia segue igual: emissão e cobrança vazias dão DATA_VAZIA; pagamento vazio não dá aviso", () => {
    const l = linha({ emissao: "", cobranca: "", pagamento: "" });
    expect(l.erros).toEqual([]);
    expect(l.registro).toMatchObject({ dataEmissao: "", dataCobrancaFornecedores: "", dataPagamento: "" });
    expect(l.avisos.filter((a) => a.codigo === "DATA_VAZIA")).toHaveLength(2);
    expect(codigos(l.avisos)).not.toContain("DATA_TRACOS");
  });

  it.each([
    ["emissao", "DATA DE EMISSÃO"],
    ["cobranca", "DATA DE COBRANÇA AOS FORNECEDORES"],
    ["pagamento", "DATA DE PAGAMENTO"],
  ] as const)("texto inválido que não é só traços segue rejeitado em %s", (campo, coluna) => {
    for (const ruim of ["-", "10/-/2026", "--10/02/2026", "ontem", "—", "--x"]) {
      const l = linha({ [campo]: ruim });
      expect(l.registro, `${campo}=${ruim}`).toBeNull();
      expect(l.erros.some((e) => e.startsWith(`${coluna}:`)), `${campo}=${ruim}: ${l.erros.join("|")}`).toBe(true);
    }
  });

  it("data inexistente e dia da semana errado seguem rejeitados", () => {
    expect(linha({ emissao: "31.02.26-sábado" }).registro).toBeNull();
    expect(linha({ emissao: "05.01.26-terça-feira" }).registro).toBeNull();
  });

  it("os outros campos de texto continuam com o aviso de placeholder (não o das datas)", () => {
    const l = linha({ emissao: "-----", awb: "-----", contrato: "-----" });
    expect(l.avisos.filter((a) => a.codigo === "PLACEHOLDER_TRACOS")).toHaveLength(2);
    expect(l.avisos.filter((a) => a.codigo === "DATA_TRACOS")).toHaveLength(1);
  });

  it("a data do STATUS (Entregue …) não é coluna de data da planilha: segue a regra própria", () => {
    expect(linha({ status: "Entregue --" }).registro).toBeNull();
  });
});
