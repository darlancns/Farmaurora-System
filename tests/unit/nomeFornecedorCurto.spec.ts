import { describe, expect, it } from "vitest";
import { FORNECEDORES_PROCESSO } from "#shared/constants/processos";
import { nomeFornecedorCurto } from "../../app/utils/nomeFornecedorCurto";

describe("nomeFornecedorCurto (só exibição no card do Kanban)", () => {
  it("com país: só o nome", () => {
    expect(nomeFornecedorCurto("Beldimed - Bélgica")).toBe("Beldimed");
    expect(nomeFornecedorCurto("  Speciality - Índia  ")).toBe("Speciality");
  });

  it("sem país: o texto inteiro (com trim)", () => {
    expect(nomeFornecedorCurto("Baiyue")).toBe("Baiyue");
    expect(nomeFornecedorCurto("  Can Pharma ")).toBe("Can Pharma");
    expect(nomeFornecedorCurto("Laboratório-Hífen")).toBe("Laboratório-Hífen"); // hífen sem espaços não separa
  });

  it("vários ' - ': o que vem antes do ÚLTIMO", () => {
    expect(nomeFornecedorCurto("Nome - Filial - Brasil")).toBe("Nome - Filial");
  });

  it("resultado vazio: o texto original (com trim)", () => {
    expect(nomeFornecedorCurto(" - Bélgica")).toBe("- Bélgica");
    expect(nomeFornecedorCurto("Nome - ")).toBe("Nome");
  });

  it("vazio, só espaços, null e undefined → ''", () => {
    expect(nomeFornecedorCurto("")).toBe("");
    expect(nomeFornecedorCurto("   ")).toBe("");
    expect(nomeFornecedorCurto(null)).toBe("");
    expect(nomeFornecedorCurto(undefined)).toBe("");
  });

  it("lista fixa do formulário: todos viram só o nome", () => {
    expect(FORNECEDORES_PROCESSO.map((f) => [f, nomeFornecedorCurto(f)])).toEqual([
      ["Beldimed - Bélgica", "Beldimed"],
      ["Pharyx - China", "Pharyx"],
      ["Poros - Turquia", "Poros"],
      ["Speciality - Índia", "Speciality"],
      ["Outro", "Outro"],
    ]);
  });
});
