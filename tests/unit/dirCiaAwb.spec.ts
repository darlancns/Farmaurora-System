import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CIAS_AEREAS_TODAS } from "#shared/constants/processos";
import { separarCiaAwb } from "#shared/utils/dirCiaAwb";

// Função pura: cia normalizada para os nomes da lista do Follow-Up e o número como escrito (espaços e hífens preservados).

const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

describe("separarCiaAwb: casos reais", () => {
  it.each([
    ["Lufthansa: 020-01045494", "Lufthansa", "020-01045494"],
    ["Emirates 176-62655703", "Emirates", "176-62655703"],
    ["Emiurates: 176-16552955", "Emirates", "176-16552955"],
    ["Turkish Airline: 235-96259984", "Turkish", "235-96259984"],
    ["Turkish Cargo 235-38910476", "Turkish", "235-38910476"],
    ["Lufthansa: 020 46391704", "Lufthansa", "020 46391704"],
    ["DHL Formal: 17 8702 6706", "DHL", "17 8702 6706"],
    ["DHL 75 4186 0476", "DHL", "75 4186 0476"],
    ["Fedex Formal: 8701 0946 525", "FedEx", "8701 0946 525"],
    ["FedEx Formal: 8784 3637 4674", "FedEx", "8784 3637 4674"],
    ["Fedex Courier: 8787 4954 6211", "FedEx", "8787 4954 6211"],
    ["Qatar: 157-54815751", "Qatar", "157-54815751"],
  ])("%j → cia %j, awb %j", (texto, cia, awb) => {
    expect(separarCiaAwb(texto)).toEqual({ cia, awb });
  });

  it.each([["23/out."], ["FALECIMENTO"], [""]])("%j não casa: cia nula e awb igual ao texto", (texto) => {
    expect(separarCiaAwb(texto)).toEqual({ cia: null, awb: texto });
  });
});

describe("separarCiaAwb: variações", () => {
  it("caixa, espaços extras e separadores diferentes", () => {
    for (const texto of [
      "LUFTHANSA: 020-01045494",
      "lufthansa 020-01045494",
      "  Lufthansa :  020-01045494  ",
      "Lufthansa - 020-01045494",
      "Lufthansa:020-01045494",
      "LuFtHaNsA:\t020-01045494",
    ]) {
      expect(separarCiaAwb(texto), texto).toEqual({ cia: "Lufthansa", awb: "020-01045494" });
    }
  });

  it("cada grafia do mapa vai para o nome da lista, em qualquer caixa", () => {
    const casos: Array<[string, string]> = [
      ["emirates", "Emirates"],
      ["EMIURATES", "Emirates"],
      ["swiss", "Swiss"],
      ["TURKISH", "Turkish"],
      ["turkish cargo", "Turkish"],
      ["TURKISH AIRLINE", "Turkish"],
      ["qatar", "Qatar"],
      ["dhl", "DHL"],
      ["Dhl Formal", "DHL"],
      ["fedex", "FedEx"],
      ["FEDEX FORMAL", "FedEx"],
      ["fedex courier", "FedEx"],
    ];
    for (const [nome, esperado] of casos) {
      expect(separarCiaAwb(`${nome}: 123-456`), nome).toEqual({ cia: esperado, awb: "123-456" });
    }
  });

  it("o número vai como escrito: espaços e hífens preservados, só aparado nas pontas", () => {
    expect(separarCiaAwb("Lufthansa:   020  4639 -1704  ").awb).toBe("020  4639 -1704");
    expect(separarCiaAwb("DHL 75 4186 0476").awb).toBe("75 4186 0476");
  });

  it("número com algo depois dele (anotação) fica inteiro no awb: nada é descartado", () => {
    expect(separarCiaAwb("Lufthansa: 020-01045494 (reenvio)")).toEqual({ cia: "Lufthansa", awb: "020-01045494 (reenvio)" });
  });

  it("só o nome da companhia, sem número: a cia é reconhecida e o awb fica vazio", () => {
    expect(separarCiaAwb("Lufthansa")).toEqual({ cia: "Lufthansa", awb: "" });
    expect(separarCiaAwb("Fedex Courier:")).toEqual({ cia: "FedEx", awb: "" });
  });

  it("nome desconhecido, número sozinho ou texto antes do nome: não casa e volta intacto", () => {
    for (const texto of [
      "LATAM: 957-12345678",
      "020-01045494",
      "Aguardando Lufthansa 020-1",
      "Lufthansa Cargo 020-1",
      "Turkish Airlines 235-1",
      "23/out. Lufthansa 020-1",
    ]) {
      expect(separarCiaAwb(texto), texto).toEqual({ cia: null, awb: texto });
    }
  });

  it("texto que não casa volta com os espaços originais (intacto, sem aparar)", () => {
    expect(separarCiaAwb("  FALECIMENTO ")).toEqual({ cia: null, awb: "  FALECIMENTO " });
  });

  it("entrada que não é texto não quebra", () => {
    expect(separarCiaAwb(undefined as unknown as string)).toEqual({ cia: null, awb: "" });
    expect(separarCiaAwb(null as unknown as string)).toEqual({ cia: null, awb: "" });
  });

  it("é pura: a mesma entrada dá sempre o mesmo resultado, e o número sozinho não vira outra cia", () => {
    const a = separarCiaAwb("Fedex Formal: 8701 0946 525");
    expect(separarCiaAwb("Fedex Formal: 8701 0946 525")).toEqual(a);
    expect(separarCiaAwb(a.awb)).toEqual({ cia: null, awb: a.awb });
  });
});

describe("separarCiaAwb: nomes e fonte", () => {
  it("toda cia devolvida existe na lista de companhias do Follow-Up (fonte única)", () => {
    const textos = [
      "Lufthansa: 1",
      "Emirates 1",
      "Emiurates: 1",
      "Swiss 1",
      "Turkish 1",
      "Turkish Cargo 1",
      "Turkish Airline: 1",
      "Qatar: 1",
      "DHL 1",
      "DHL Formal: 1",
      "Fedex 1",
      "Fedex Formal: 1",
      "Fedex Courier: 1",
    ];
    for (const t of textos) {
      const { cia } = separarCiaAwb(t);
      expect(CIAS_AEREAS_TODAS, t).toContain(cia);
    }
  });

  it("a lista do Follow-Up já tem Qatar (nada a acrescentar) e é a união das cias dos modais", () => {
    expect([...CIAS_AEREAS_TODAS]).toEqual(["DHL", "Emirates", "FedEx", "Lufthansa", "Qatar", "Swiss", "Turkish"]);
  });

  it("é arquivo sem imports e ainda NÃO está ligado a nenhum fluxo (parser da carga, servidor, formulário)", () => {
    expect(lerFonte("shared/utils/dirCiaAwb.ts")).not.toMatch(/^import /m);
    for (const arquivo of [
      "shared/utils/dirParser.ts",
      "scripts/migration/carga-dir.mjs",
      "scripts/migration/dry-run-dir.mjs",
      "server/utils/dirStore.ts",
      "server/utils/dirMappers.ts",
      "server/utils/dirValidation.ts",
      "app/composables/useDirForm.ts",
      "app/components/dir/DirFormModal.vue",
      "app/utils/dirFiltros.ts",
    ]) {
      expect(lerFonte(arquivo), arquivo).not.toContain("dirCiaAwb");
    }
  });
});
