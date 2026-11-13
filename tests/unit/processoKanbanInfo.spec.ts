import { describe, expect, it } from "vitest";
import { linhasInfoKanban, type LinhaInfoKanban, type ProcessoInfoKanban } from "../../app/utils/processoKanbanInfo";

const completo: ProcessoInfoKanban = {
  responsavelOperacional: "Rebeca",
  consultor: "Dani",
  pendencias: ["a", "b", "c", "d"],
  fornecedor: "Beldimed - Bélgica",
  despachante: "Aduaneira Sul",
  companhiaAerea: "LATAM Cargo",
  numeroAwb: "957-12345678",
};

// Resumo legível: [linha, [célula=texto(+awb)]].
function resumo(linhas: LinhaInfoKanban[]): Array<[string, string[]]> {
  return linhas.map((l) => [l.chave, l.celulas.map((c) => `${c.chave}=${c.texto}${c.awb ? `|${c.awb}` : ""}`)]);
}

describe("linhasInfoKanban (bloquinhos do card)", () => {
  it("processo completo: 3 linhas, na ordem, com valores já formatados", () => {
    const linhas = linhasInfoKanban(completo);
    expect(resumo(linhas)).toEqual([
      ["pessoas", ["responsavel=Rebeca", "consultor=Dani", "pendencias=4"]],
      ["origem", ["fornecedor=Beldimed", "despachante=Aduaneira Sul"]],
      ["aereo", ["aereo=LATAM Cargo|957-12345678"]],
    ]);
    const [pessoas, origem, aereo] = linhas;
    expect(pessoas!.celulas.map((c) => c.rotulo)).toEqual(["Responsável", "Consultor", "Pendências"]);
    expect(pessoas!.celulas[2]).toMatchObject({ titulo: "4 pendências", estreita: true, perigo: true });
    expect(pessoas!.celulas[0]!.estreita).toBeUndefined();
    expect(pessoas!.celulas[0]!.prioritaria).toBe(true); // Responsável não vira "Re…"
    expect(pessoas!.celulas[1]!.prioritaria).toBeUndefined();
    expect(origem!.celulas[0]!.titulo).toBe("Beldimed"); // o title também é o nome curto
    expect(aereo!.celulas[0]).toMatchObject({ rotulo: "Cia. aérea · AWB", titulo: "LATAM Cargo · 957-12345678" });
  });

  it("sem despachante: a linha de origem só com o fornecedor", () => {
    expect(resumo(linhasInfoKanban({ ...completo, despachante: undefined }))[1]).toEqual(["origem", ["fornecedor=Beldimed"]]);
  });

  it("sem fornecedor: a linha de origem só com o despachante", () => {
    expect(resumo(linhasInfoKanban({ ...completo, fornecedor: undefined }))[1]).toEqual(["origem", ["despachante=Aduaneira Sul"]]);
  });

  it("sem fornecedor e sem despachante: a linha de origem não existe", () => {
    const chaves = linhasInfoKanban({ ...completo, fornecedor: undefined, despachante: undefined }).map((l) => l.chave);
    expect(chaves).toEqual(["pessoas", "aereo"]);
  });

  it("sem cia e sem AWB: a linha aérea não existe", () => {
    const chaves = linhasInfoKanban({ ...completo, companhiaAerea: undefined, numeroAwb: undefined }).map((l) => l.chave);
    expect(chaves).toEqual(["pessoas", "origem"]);
  });

  it("só cia: só a cia, sem AWB", () => {
    const aereo = linhasInfoKanban({ ...completo, numeroAwb: undefined })[2]!.celulas[0]!;
    expect(aereo).toMatchObject({ texto: "LATAM Cargo", titulo: "LATAM Cargo" });
    expect(aereo.awb).toBeUndefined();
  });

  it("só AWB: só a AWB, sem texto de cia", () => {
    const aereo = linhasInfoKanban({ ...completo, companhiaAerea: undefined })[2]!.celulas[0]!;
    expect(aereo).toMatchObject({ texto: "", awb: "957-12345678", titulo: "957-12345678" });
  });

  it("sem pendências: a célula some", () => {
    expect(resumo(linhasInfoKanban({ ...completo, pendencias: [] }))[0]).toEqual(["pessoas", ["responsavel=Rebeca", "consultor=Dani"]]);
  });

  it("uma pendência: title no singular", () => {
    expect(linhasInfoKanban({ ...completo, pendencias: ["x"] })[0]!.celulas[2]!.titulo).toBe("1 pendência");
  });

  it("sem responsável", () => {
    expect(resumo(linhasInfoKanban({ ...completo, responsavelOperacional: undefined }))[0]).toEqual([
      "pessoas",
      ["consultor=Dani", "pendencias=4"],
    ]);
  });

  it("sem consultor (legado vazio)", () => {
    const p = { ...completo, consultor: "" as ProcessoInfoKanban["consultor"] };
    expect(resumo(linhasInfoKanban(p))[0]).toEqual(["pessoas", ["responsavel=Rebeca", "pendencias=4"]]);
  });

  it("linha 1 inteira vazia: não existe", () => {
    const p = { ...completo, responsavelOperacional: undefined, consultor: "" as ProcessoInfoKanban["consultor"], pendencias: [] };
    expect(linhasInfoKanban(p).map((l) => l.chave)).toEqual(["origem", "aereo"]);
  });

  it("strings só com espaços contam como vazias (e valores têm trim)", () => {
    const p: ProcessoInfoKanban = {
      responsavelOperacional: "   ",
      consultor: "  " as ProcessoInfoKanban["consultor"],
      pendencias: [],
      fornecedor: " ",
      despachante: "\t",
      companhiaAerea: "  ",
      numeroAwb: " ",
    };
    expect(linhasInfoKanban(p)).toEqual([]);
    const comEspacos = linhasInfoKanban({ ...completo, despachante: "  Aduaneira Sul ", companhiaAerea: " LATAM Cargo " });
    expect(comEspacos[1]!.celulas[1]!.texto).toBe("Aduaneira Sul");
    expect(comEspacos[2]!.celulas[0]!.titulo).toBe("LATAM Cargo · 957-12345678");
  });
});
