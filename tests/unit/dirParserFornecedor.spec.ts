import { describe, expect, it } from "vitest";
import { colunasDeDir } from "../../server/utils/dirMappers";
import { parseDirCsv, resolverFornecedorDaPlanilha } from "../../shared/utils/dirParser";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";

// Regra do parser para a coluna ORIGEM da planilha (a Origem NÃO é mais gravada): Fornecedor "Care Pharma" com Origem preenchida
// e diferente → o fornecedor carregado é o valor da Origem. Care Pharma com Origem vazia ou igual: fica como está e avisa
// "sem fornecedor real". Qualquer outro fornecedor: vale o Fornecedor, com ou sem Origem.

function linha(fornecedor: string, origem: string, po = "PO26-01-0002") {
  const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, po, fornecedor, origem })));
  const l = r.linhas.find((x) => !x.ignorada)!;
  return { registro: l.registro!, avisos: l.avisos.map((a) => a.codigo), erros: l.erros };
}

describe("parser: fornecedor × origem (regra do Care Pharma)", () => {
  it("Care Pharma + Speciality → o fornecedor carregado é Speciality", () => {
    const l = linha("Care Pharma", "Speciality");
    expect(l.erros).toEqual([]);
    expect(l.registro.fornecedor).toBe("Speciality");
    expect(l.avisos).toContain("FORNECEDOR_PELA_ORIGEM");
    expect(l.avisos).not.toContain("FORNECEDOR_SEM_REAL");
  });

  it("Care Pharma + Care Pharma → fica Care Pharma e sai como 'sem fornecedor real'", () => {
    const l = linha("Care Pharma", "Care Pharma");
    expect(l.registro.fornecedor).toBe("Care Pharma");
    expect(l.avisos).toContain("FORNECEDOR_SEM_REAL");
    expect(l.avisos).not.toContain("FORNECEDOR_PELA_ORIGEM");
  });

  it("Care Pharma sem origem (vazia) → fica Care Pharma e sai como 'sem fornecedor real'", () => {
    const l = linha("Care Pharma", "");
    expect(l.registro.fornecedor).toBe("Care Pharma");
    expect(l.avisos).toContain("FORNECEDOR_SEM_REAL");
  });

  it("Care Pharma com origem só de traços (tratada como vazia) → sem fornecedor real", () => {
    const l = linha("Care Pharma", "---");
    expect(l.registro.fornecedor).toBe("Care Pharma");
    expect(l.avisos).toContain("FORNECEDOR_SEM_REAL");
  });

  it("fornecedor normal com origem igual → fica o fornecedor, sem aviso da regra", () => {
    const l = linha("Speciality", "Speciality");
    expect(l.registro.fornecedor).toBe("Speciality");
    expect(l.avisos).not.toContain("FORNECEDOR_PELA_ORIGEM");
    expect(l.avisos).not.toContain("FORNECEDOR_SEM_REAL");
  });

  it("fornecedor diferente de Care Pharma com origem diferente → vale o Fornecedor", () => {
    const l = linha("Beldimed", "Tosun (China)");
    expect(l.registro.fornecedor).toBe("Beldimed");
    expect(l.avisos).not.toContain("FORNECEDOR_PELA_ORIGEM");
    expect(l.avisos).not.toContain("FORNECEDOR_SEM_REAL");
  });

  it("fornecedor normal sem origem → fica o fornecedor", () => {
    expect(linha("Matsun", "").registro.fornecedor).toBe("Matsun");
  });

  it("a comparação ignora caixa, acento e espaços repetidos; o fornecedor trocado vem como a Origem escreveu", () => {
    expect(linha("CARE  PHARMA", "tosun (china)").registro.fornecedor).toBe("tosun (china)");
    expect(linha("care pharma", "CARE PHARMA").avisos).toContain("FORNECEDOR_SEM_REAL");
    expect(linha("Cäre Pharma", "Medimoon").registro.fornecedor).toBe("Medimoon");
  });

  it("o registro NÃO traz origem e a carga não escreve a coluna origem (mesmo com origem na planilha)", () => {
    const { registro } = linha("Care Pharma", "Speciality");
    expect("origem" in registro).toBe(false);
    const colunas = colunasDeDir(registro);
    expect("origem" in colunas).toBe(false);
    expect(colunas.fornecedor).toBe("Speciality");
  });

  it("a coluna ORIGEM continua sendo lida: sem ela no cabeçalho a planilha é reportada como incompleta", () => {
    const semOrigem = csv(CASCA, linhaCsv(EM_ABERTO)).replace(",ORIGEM,", ",");
    expect(parseDirCsv(semOrigem).colunasAusentes).toContain("ORIGEM");
  });

  it("a coluna ORIGEM não vira 'coluna desconhecida' no relatório", () => {
    expect(parseDirCsv(csv(CASCA, linhaCsv(EM_ABERTO))).colunasExtras).not.toContain("ORIGEM");
  });

  it("a regra do Care Pharma convive com a separação da cia do AWB (uma não mexe na outra)", () => {
    const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, fornecedor: "Care Pharma", origem: "Speciality", awb: "Lufthansa: 020-01045494" })));
    const registro = r.linhas.find((l) => !l.ignorada)!.registro!;
    expect(registro).toMatchObject({ fornecedor: "Speciality", companhiaAerea: "Lufthansa", awb: "020-01045494" });
  });
});

describe("resolverFornecedorDaPlanilha (regra pura)", () => {
  it.each([
    ["Care Pharma", "Speciality", "Speciality", "pela_origem"],
    ["Care Pharma", "Care Pharma", "Care Pharma", "sem_real"],
    ["Care Pharma", "", "Care Pharma", "sem_real"],
    ["Care Pharma", "   ", "Care Pharma", "sem_real"],
    ["Speciality", "Speciality", "Speciality", "normal"],
    ["Beldimed", "Tosun (China)", "Beldimed", "normal"],
    ["", "Speciality", "", "normal"],
    ["", "", "", "normal"],
  ] as const)("(%j, %j) → %j (%s)", (fornecedor, origem, esperado, situacao) => {
    expect(resolverFornecedorDaPlanilha(fornecedor, origem)).toEqual({ fornecedor: esperado, situacao });
  });
});
