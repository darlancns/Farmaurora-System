import { describe, expect, it } from "vitest";
import {
  BRAND_ERRO,
  BRANDS_MEDICAMENTO,
  isBrandMedicamento,
  LABORATORIO_ERRO,
  LIMITE_LABORATORIO,
  ROTULOS_BRAND_MEDICAMENTO,
} from "#shared/constants/processos";
import {
  capitalizarIniciais,
  lerMedicamento,
  linhaLaboratorioBrand,
  normalizarLaboratorio,
  tamanhoLaboratorio,
} from "#shared/utils/laboratorio";

// Laboratório e Brand por medicamento (decisões da Cris): regras puras de shared/utils/laboratorio.ts e a constante única
// do Brand em shared/constants/processos.ts.

// Os exemplos da Cris: entrada → saída. Valem para o núcleo (ao digitar) e para a normalização completa.
const EXEMPLOS: Array<[string, string]> = [
  ["teuto brasileiro", "Teuto Brasileiro"],
  ["EMS", "EMS"],
  ["MSD", "MSD"],
  ["GSK", "GSK"],
  ["ems", "Ems"],
  ["bristol-myers squibb", "Bristol-Myers Squibb"],
  ["ácido farma", "Ácido Farma"],
  ["S.A.", "S.A."],
  ["s.a.", "S.a."],
];

describe("capitalizarIniciais — núcleo (variante ao digitar): 1ª letra de cada palavra maiúscula, o resto intacto", () => {
  it.each(EXEMPLOS)("%s → %s", (entrada, saida) => {
    expect(capitalizarIniciais(entrada)).toBe(saida);
  });

  it("siglas e caixa mista ficam exatamente como digitadas (Caps Lock/Shift inclusive); NÃO força minúsculas", () => {
    expect(capitalizarIniciais("laboratório EMS")).toBe("Laboratório EMS");
    expect(capitalizarIniciais("EMS SIGMA PHARMA")).toBe("EMS SIGMA PHARMA");
    expect(capitalizarIniciais("eMS")).toBe("EMS");
    expect(capitalizarIniciais("glaxoSmithKline GSK")).toBe("GlaxoSmithKline GSK");
    expect(capitalizarIniciais("AstraZeneca")).toBe("AstraZeneca");
  });

  it("NÃO faz trim nem junta espaços: o espaço no fim (a próxima palavra ainda vai ser digitada) fica", () => {
    expect(capitalizarIniciais("teuto ")).toBe("Teuto ");
    expect(capitalizarIniciais("  teuto   brasileiro  ")).toBe("  Teuto   Brasileiro  ");
    expect(capitalizarIniciais("teuto\tbrasileiro")).toBe("Teuto\tBrasileiro");
  });

  it("nunca muda o tamanho do texto (o cursor continua válido)", () => {
    for (const t of ["straße farma", "ß", "teuto brasileiro ", "ácido-éfe çiclo", "d'ávila"]) {
      expect(capitalizarIniciais(t)).toHaveLength(t.length);
    }
    expect(capitalizarIniciais("ß")).toBe("ß"); // "SS" mudaria o tamanho: fica como está
  });

  it("acentos pelo pt-BR; apóstrofo e ponto não começam palavra; dígitos e símbolos ficam", () => {
    expect(capitalizarIniciais("éfe ômega çiclo")).toBe("Éfe Ômega Çiclo");
    expect(capitalizarIniciais("d'ávila farma")).toBe("D'ávila Farma");
    expect(capitalizarIniciais("cristália ltda.")).toBe("Cristália Ltda.");
    expect(capitalizarIniciais("3m do brasil")).toBe("3m Do Brasil");
    expect(capitalizarIniciais("(teuto) farma")).toBe("(teuto) Farma");
  });

  it("vazio, null, undefined e não texto → ''", () => {
    expect(capitalizarIniciais("")).toBe("");
    expect(capitalizarIniciais(null)).toBe("");
    expect(capitalizarIniciais(undefined)).toBe("");
    expect(capitalizarIniciais(42 as unknown as string)).toBe("");
  });
});

describe("normalizarLaboratorio — normalização completa (blur, payload e servidor)", () => {
  it.each(EXEMPLOS)("%s → %s", (entrada, saida) => {
    expect(normalizarLaboratorio(entrada)).toBe(saida);
  });

  it("trim e espaços repetidos (tab, quebra de linha) viram um", () => {
    expect(normalizarLaboratorio("  teuto    brasileiro  ")).toBe("Teuto Brasileiro");
    expect(normalizarLaboratorio("eurofarma\t\tlaboratórios")).toBe("Eurofarma Laboratórios");
    expect(normalizarLaboratorio("   ")).toBe("");
    expect(normalizarLaboratorio(" \t \n ")).toBe("");
    expect(normalizarLaboratorio(null)).toBe("");
    expect(normalizarLaboratorio(undefined)).toBe("");
  });

  it("mesmo núcleo da variante ao digitar: só difere nos espaços (nunca na caixa das letras)", () => {
    for (const t of ["teuto  brasileiro ", " EMS s.a.", "bristol-myers   squibb", "ácido FARMA", "MSD GSK ems"]) {
      expect(normalizarLaboratorio(t)).toBe(capitalizarIniciais(t).trim().replace(/\s+/g, " "));
      expect(normalizarLaboratorio(capitalizarIniciais(t))).toBe(normalizarLaboratorio(t));
    }
  });

  it("idempotente", () => {
    for (const entrada of ["teuto brasileiro", "bristol-myers squibb", "  EMS  s.a. ", "ácido farma"]) {
      const uma = normalizarLaboratorio(entrada);
      expect(normalizarLaboratorio(uma)).toBe(uma);
    }
  });

  it("máximo de 120 caracteres (corta sem deixar espaço no fim); tamanhoLaboratorio mede antes do corte", () => {
    expect(LIMITE_LABORATORIO).toBe(120);
    expect(normalizarLaboratorio("a".repeat(130))).toBe("A" + "a".repeat(119));
    const comEspacoNoCorte = `${"x".repeat(119)} yyy`;
    expect(normalizarLaboratorio(comEspacoNoCorte)).toBe("X" + "x".repeat(118));
    expect(tamanhoLaboratorio("a".repeat(130))).toBe(130);
    // Espaços extras não contam: 120 caracteres úteis com espaços sobrando cabem.
    const cabe = `  ${"x".repeat(59)}    ${"y".repeat(60)}  `;
    expect(tamanhoLaboratorio(cabe)).toBe(LIMITE_LABORATORIO);
    expect(normalizarLaboratorio(cabe)).toHaveLength(LIMITE_LABORATORIO);
    expect(LABORATORIO_ERRO).toBe("Laboratório: no máximo 120 caracteres.");
  });
});

describe("Brand — constante única", () => {
  it("valores internos sem acento, rótulos com acento, na ordem do select", () => {
    expect(BRANDS_MEDICAMENTO).toEqual(["bioequivalente", "referencia"]);
    expect(ROTULOS_BRAND_MEDICAMENTO).toEqual({ bioequivalente: "Bioequivalente", referencia: "Referência" });
    // A lista e o Record exaustivo têm exatamente os mesmos valores.
    expect([...BRANDS_MEDICAMENTO].sort()).toEqual(Object.keys(ROTULOS_BRAND_MEDICAMENTO).sort());
    expect(BRAND_ERRO).toBe("Brand inválido. Opções: Bioequivalente ou Referência.");
  });

  it("isBrandMedicamento: só os valores internos (não o rótulo, nem vazio, nem herança de Object)", () => {
    expect(isBrandMedicamento("bioequivalente")).toBe(true);
    expect(isBrandMedicamento("referencia")).toBe(true);
    for (const v of ["", "Referência", "referência", "Bioequivalente", "generico", "toString", null, undefined, 1]) {
      expect(isBrandMedicamento(v), String(v)).toBe(false);
    }
  });
});

describe("lerMedicamento — leitura tolerante de itens gravados", () => {
  it("item antigo sem as chaves → laboratorio e brand ''; as outras chaves ficam", () => {
    expect(lerMedicamento({ nome: "KEYTRUDA", quantidade: "2", dosagem: "100mg", marca: "MSD" })).toEqual({
      nome: "KEYTRUDA",
      quantidade: "2",
      dosagem: "100mg",
      marca: "MSD",
      laboratorio: "",
      brand: "",
    });
  });

  it("null ou tipo errado → ''; brand fora da lista → ''; texto do laboratório NÃO é normalizado na leitura", () => {
    expect(lerMedicamento({ nome: "A", laboratorio: null, brand: null } as never)).toMatchObject({ laboratorio: "", brand: "" });
    expect(lerMedicamento({ nome: "A", laboratorio: 7, brand: "Referência" } as never)).toMatchObject({ laboratorio: "", brand: "" });
    expect(lerMedicamento({ nome: "A", laboratorio: "ems", brand: "referencia" })).toMatchObject({ laboratorio: "ems", brand: "referencia" });
  });
});

describe("linhaLaboratorioBrand — 'Laboratório · Brand' sem '·' sobrando", () => {
  it("os dois → 'EMS · Referência'", () => {
    expect(linhaLaboratorioBrand({ laboratorio: "EMS", brand: "referencia" })).toBe("EMS · Referência");
  });
  it("só laboratório → só ele; só brand → só ele", () => {
    expect(linhaLaboratorioBrand({ laboratorio: "Teuto Brasileiro", brand: "" })).toBe("Teuto Brasileiro");
    expect(linhaLaboratorioBrand({ laboratorio: "", brand: "bioequivalente" })).toBe("Bioequivalente");
    expect(linhaLaboratorioBrand({ laboratorio: "   ", brand: "bioequivalente" })).toBe("Bioequivalente");
  });
  it("nenhum (ou chaves ausentes) → ''", () => {
    expect(linhaLaboratorioBrand({ laboratorio: "", brand: "" })).toBe("");
    expect(linhaLaboratorioBrand({})).toBe("");
    expect(linhaLaboratorioBrand({ laboratorio: "  ", brand: "x" as never })).toBe("");
  });
});
