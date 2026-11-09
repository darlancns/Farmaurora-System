import { describe, expect, it } from "vitest";
import { colunasDeDir } from "../../server/utils/dirMappers";
import { parseDirCsv } from "../../shared/utils/dirParser";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";

// O parser da carga separa a cia do AWB (separarCiaAwb): companhiaAerea = cia ?? "" e awb = só o número. Sem cia
// reconhecida, a cia fica vazia e o AWB segue como a planilha escreveu. Traços ("-----") valem vazio no AWB e no contrato.

function linha(campos: Parameters<typeof linhaCsv>[0]) {
  const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, ...campos })));
  const l = r.linhas.find((x) => !x.ignorada)!;
  return { registro: l.registro!, avisos: l.avisos.map((a) => a.codigo), erros: l.erros };
}

describe("parser: cia aérea separada do AWB", () => {
  it.each([
    ["Lufthansa: 020-01045494", "Lufthansa", "020-01045494"],
    ["Emirates 176-62696911", "Emirates", "176-62696911"],
    ["Emiurates: 176-62696911", "Emirates", "176-62696911"], // erro de digitação que existe nos dados
    ["Fedex Formal: 8701 0946 525", "FedEx", "8701 0946 525"],
    ["DHL 75 4186 0476", "DHL", "75 4186 0476"],
    ["Turkish Cargo: 235-12345678", "Turkish", "235-12345678"],
    ["Swiss: 724-11112222", "Swiss", "724-11112222"],
    ["Qatar: 157 54815751", "Qatar", "157 54815751"],
  ])("%j → cia %j + AWB %j", (awb, cia, numero) => {
    const l = linha({ awb });
    expect(l.erros).toEqual([]);
    expect(l.registro.companhiaAerea).toBe(cia);
    expect(l.registro.awb).toBe(numero);
  });

  it("só o nome da cia, sem número: cia gravada e AWB vazio", () => {
    expect(linha({ awb: "Lufthansa" }).registro).toMatchObject({ companhiaAerea: "Lufthansa", awb: "" });
  });

  it("sem cia reconhecida: cia vazia e o AWB como a planilha escreveu (nada se perde)", () => {
    for (const awb of ["23/out.", "FALECIMENTO", "020-01045494", "Cargo X: 123"]) {
      const l = linha({ awb });
      expect(l.registro.companhiaAerea, awb).toBe("");
      expect(l.registro.awb, awb).toBe(awb);
    }
  });

  it("AWB vazio → cia e AWB vazios, sem aviso", () => {
    const l = linha({ awb: "" });
    expect(l.registro).toMatchObject({ companhiaAerea: "", awb: "" });
    expect(l.avisos).not.toContain("PLACEHOLDER_TRACOS");
  });

  it("AWB e contrato só com traços valem vazio (com o aviso de placeholder)", () => {
    for (const traco of ["-----", "--------", "—", "- - -"]) {
      const l = linha({ awb: traco, contrato: traco });
      expect(l.registro, traco).toMatchObject({ companhiaAerea: "", awb: "", contratoCambio: "" });
      expect(l.avisos.filter((a) => a === "PLACEHOLDER_TRACOS"), traco).toHaveLength(2);
    }
  });

  it("cia com o número em branco (\"Lufthansa: \"): a cia é gravada e o AWB fica vazio", () => {
    expect(linha({ awb: "Lufthansa: " }).registro).toMatchObject({ companhiaAerea: "Lufthansa", awb: "" });
  });

  it("a carga (colunasDeDir) grava companhia_aerea e awb separados; sem cia, a coluna vai vazia (NULL) e o AWB cru", () => {
    const comCia = colunasDeDir(linha({ awb: "Lufthansa: 020-01045494" }).registro);
    expect(comCia).toMatchObject({ companhia_aerea: "Lufthansa", awb: "020-01045494" });
    const semCia = colunasDeDir(linha({ awb: "23/out." }).registro);
    expect(semCia).toMatchObject({ companhia_aerea: null, awb: "23/out." });
  });

  it("a regra do Care Pharma segue valendo (fornecedor pela origem, sem tocar na cia)", () => {
    const l = linha({ fornecedor: "Care Pharma", origem: "Speciality", awb: "Emirates 176-62696911" });
    expect(l.registro).toMatchObject({ fornecedor: "Speciality", companhiaAerea: "Emirates", awb: "176-62696911" });
    expect(l.avisos).toContain("FORNECEDOR_PELA_ORIGEM");
  });

  it("a separação não cria erro nem aviso novo (o código de aviso é o de antes)", () => {
    const l = linha({ awb: "Lufthansa: 020-01045494" });
    expect(l.erros).toEqual([]);
    expect(l.avisos).not.toContain("PLACEHOLDER_TRACOS");
  });
});
