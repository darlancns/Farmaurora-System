import { describe, expect, it } from "vitest";
import { resolverFornecedorDaPlanilha } from "../../shared/utils/dirParser";
import { chaveCadastro, nomeReservadoCadastro, ordenarCadastro, rotuloCadastro } from "../../shared/utils/cadastroNome";

// Regras puras de nome dos Cadastros: chave de unicidade, nome reservado, ordem (pt-BR, ativos primeiro) e rótulo.

describe("chaveCadastro", () => {
  it("tira acento, caixa e espaços repetidos", () => {
    expect(chaveCadastro("  Speciality   Índia ")).toBe("speciality india");
    expect(chaveCadastro("BELDIMED - Bélgica")).toBe("beldimed - belgica");
    expect(chaveCadastro("Mohri (Japão)")).toBe("mohri (japao)");
  });

  it("é a MESMA normalização de chaveFornecedor (dirParser): concorda em variações de 'Care Pharma'", () => {
    // resolverFornecedorDaPlanilha só reconhece "Care Pharma" quando as chaves são iguais.
    const care = chaveCadastro("Care Pharma");
    const amostras = [
      "Care Pharma",
      "care  pharma",
      "CARE PHARMA",
      " Cáre Pharma ",
      "Care Pharmá",
      "Can Pharma",
      "Care Pharm",
      "Carepharma",
    ];
    for (const valor of amostras) {
      const reconhecidoPeloParser = resolverFornecedorDaPlanilha(valor, "Outra Origem").situacao !== "normal";
      expect(chaveCadastro(valor) === care, valor).toBe(reconhecidoPeloParser);
    }
  });
});

describe("nomeReservadoCadastro", () => {
  it('"Outro" é reservado em qualquer caixa, com espaços ou acento', () => {
    for (const nome of ["Outro", "outro", "OUTRO", "  Outro ", "Óutro"]) expect(nomeReservadoCadastro(nome), nome).toBe(true);
  });

  it("nomes parecidos não são reservados", () => {
    for (const nome of ["Outros", "Outro Pharma", "Poros"]) expect(nomeReservadoCadastro(nome), nome).toBe(false);
  });
});

describe("ordenarCadastro", () => {
  const item = (nome: string, ativo = true) => ({ nome, ativo });

  it("ordem alfabética pt-BR, sem diferença de caixa e acento", () => {
    const r = ordenarCadastro([item("Poros"), item("Zebra"), item("Beldimed"), item("Álcool"), item("Alfa")]);
    expect(r.map((i) => i.nome)).toEqual(["Álcool", "Alfa", "Beldimed", "Poros", "Zebra"]);
  });

  it("ativos primeiro, inativos depois — cada grupo em ordem alfabética", () => {
    const r = ordenarCadastro([item("Zeta", false), item("Beta"), item("Alfa", false), item("Gama")]);
    expect(r.map((i) => i.nome)).toEqual(["Beta", "Gama", "Alfa", "Zeta"]);
  });

  it('"Outro" (se aparecer) fica por último do seu grupo', () => {
    const r = ordenarCadastro([item("Outro"), item("Zeta"), item("Alfa")]);
    expect(r.map((i) => i.nome)).toEqual(["Alfa", "Zeta", "Outro"]);
  });

  it("devolve uma cópia e não muda a entrada", () => {
    const entrada = [item("B"), item("A")];
    const saida = ordenarCadastro(entrada);
    expect(saida).not.toBe(entrada);
    expect(entrada.map((i) => i.nome)).toEqual(["B", "A"]);
  });
});

describe("rotuloCadastro", () => {
  it('ativo mostra o nome; inativo leva "(inativo)"', () => {
    expect(rotuloCadastro({ nome: "Poros", ativo: true })).toBe("Poros");
    expect(rotuloCadastro({ nome: "Poros", ativo: false })).toBe("Poros (inativo)");
  });
});
