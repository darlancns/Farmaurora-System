import { describe, expect, it } from "vitest";
import type { MedicamentoLido } from "../../shared/types/Cadastro";
import { LIMITE_SUGESTOES_MEDICAMENTO, sugerirMedicamentos } from "../../app/utils/processoMedicamentoSugestoes";

// A sugestão do nome do medicamento no formulário do Follow-Up (função pura, sem rede): só ativos, sem acento nem caixa, os que COMEÇAM com o texto
// primeiro. Nomes de exemplo (o Cadastro grava em MAIÚSCULAS).

const med = (nome: string, ativo = true): MedicamentoLido => ({ nome, ativo });
const nomes = (lista: ReturnType<typeof sugerirMedicamentos>) => lista.map((s) => s.rotulo);

const CADASTRO = [
  med("AMOXICILINA 500 MG"),
  med("DIPIRONA TESTE"),
  med("DIPIRONA TESTE GOTAS"),
  med("KEYTRUDA"),
  med("XAROPE DIPIRONA TESTE"),
  med("ÁCIDO FÓLICO TESTE"),
  med("TESTE MEDICAMENTO ANTIGO", false),
];

describe("sugerirMedicamentos", () => {
  it("os que COMEÇAM com o texto vêm primeiro; depois os que o têm no meio, cada grupo na ordem do Cadastro", () => {
    expect(nomes(sugerirMedicamentos(CADASTRO, "dipi"))).toEqual(["DIPIRONA TESTE", "DIPIRONA TESTE GOTAS", "XAROPE DIPIRONA TESTE"]);
  });

  it("sem diferença de caixa nem de acento (a comparação do app para nomes do Cadastro)", () => {
    expect(nomes(sugerirMedicamentos(CADASTRO, "acido folico"))).toEqual(["ÁCIDO FÓLICO TESTE"]);
    expect(nomes(sugerirMedicamentos(CADASTRO, "  KeyTruDa  "))).toEqual(["KEYTRUDA"]);
    expect(nomes(sugerirMedicamentos(CADASTRO, "dipirona   teste"))).toEqual(["DIPIRONA TESTE", "DIPIRONA TESTE GOTAS", "XAROPE DIPIRONA TESTE"]);
  });

  it("NUNCA sugere um medicamento inativo", () => {
    expect(sugerirMedicamentos(CADASTRO, "antigo")).toEqual([]);
    expect(sugerirMedicamentos(CADASTRO, "teste medicamento")).toEqual([]);
  });

  it("texto vazio ou só espaços: nenhuma sugestão; sem lista: nenhuma sugestão", () => {
    expect(sugerirMedicamentos(CADASTRO, "")).toEqual([]);
    expect(sugerirMedicamentos(CADASTRO, "   ")).toEqual([]);
    expect(sugerirMedicamentos([], "dipi")).toEqual([]);
  });

  it("texto que não está em nenhum nome: nenhuma sugestão (o campo segue como texto livre)", () => {
    expect(sugerirMedicamentos(CADASTRO, "medicamento inventado")).toEqual([]);
  });

  it("a sugestão leva o nome do Cadastro como rótulo e como valor", () => {
    expect(sugerirMedicamentos(CADASTRO, "keytruda")).toEqual([{ valor: "KEYTRUDA", rotulo: "KEYTRUDA" }]);
  });

  it(`no máximo ${LIMITE_SUGESTOES_MEDICAMENTO} sugestões (e o limite é configurável)`, () => {
    const muitos = Array.from({ length: 200 }, (_, i) => med(`TESTE ${String(i).padStart(3, "0")}`));
    expect(sugerirMedicamentos(muitos, "teste")).toHaveLength(LIMITE_SUGESTOES_MEDICAMENTO);
    expect(sugerirMedicamentos(muitos, "teste", 5)).toHaveLength(5);
    expect(nomes(sugerirMedicamentos(muitos, "teste", 3))).toEqual(["TESTE 000", "TESTE 001", "TESTE 002"]);
  });

  it("o limite corta DEPOIS de ordenar: os que começam com o texto não são empurrados para fora por quem o tem no meio", () => {
    const lista = [med("XAROPE KEY A"), med("XAROPE KEY B"), med("KEY ZETA")];
    expect(nomes(sugerirMedicamentos(lista, "key", 1))).toEqual(["KEY ZETA"]);
  });
});
