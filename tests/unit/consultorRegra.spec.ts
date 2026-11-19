import { describe, expect, it } from "vitest";
import { montarConsultorOptions } from "../../app/utils/consultorOptions";
import {
  CONSULTOR_ERRO,
  consultorAtivoValido,
  erroConsultor,
  nomesConsultoresAtivos,
  situacaoDoConsultor,
  type ItemConsultor,
} from "../../shared/utils/consultorRegra";

// Regra ÚNICA de consultor (Contas, Follow-Up, Prestação e DIR leem do Cadastro) e as opções do select de todas as telas.
// Fixtures sintéticas: só nomes de consultor.

const ATIVOS = ["André Teste", "Mateus Teste", "Paulo Teste"];
const ITENS: ItemConsultor[] = [
  ...ATIVOS.map((nome) => ({ nome, ativo: true })),
  { nome: "Junior", ativo: false },
];
const A_DEFINIR = "A ser definido";
const LITERAL = "Braulio (3RB)";

describe("nomesConsultoresAtivos", () => {
  it("só os ativos, em ordem alfabética pt-BR (acento e caixa não atrapalham)", () => {
    const itens = [
      { nome: "Vinícius Teste", ativo: true },
      { nome: "Junior", ativo: false },
      { nome: "álvaro Teste", ativo: true },
      { nome: "Bolívar Teste", ativo: true },
      { nome: "Zeca Teste", ativo: false },
    ];
    expect(nomesConsultoresAtivos(itens)).toEqual(["álvaro Teste", "Bolívar Teste", "Vinícius Teste"]);
    expect(nomesConsultoresAtivos([])).toEqual([]);
  });
});

describe("consultorAtivoValido", () => {
  it("exatamente o nome de um ativo (aparado, sensível a caixa); vazio e inativo não", () => {
    expect(consultorAtivoValido("Mateus Teste", ATIVOS)).toBe(true);
    expect(consultorAtivoValido("  Mateus Teste ", ATIVOS)).toBe(true);
    expect(consultorAtivoValido("mateus teste", ATIVOS)).toBe(false);
    expect(consultorAtivoValido("Junior", ATIVOS)).toBe(false);
    expect(consultorAtivoValido("", ATIVOS)).toBe(false);
    expect(consultorAtivoValido(null, ATIVOS)).toBe(false);
    expect(consultorAtivoValido(undefined, ATIVOS)).toBe(false);
  });
});

describe("erroConsultor — valor NOVO só de consultor ativo; o valor que o registro já tem é tolerado", () => {
  it("valor novo de consultor ativo passa; inativo, literal, 'Flavinha' e vazio são recusados", () => {
    expect(erroConsultor("Paulo Teste", ATIVOS)).toBeNull();
    for (const valor of ["Junior", A_DEFINIR, LITERAL, "Flavinha", ""]) {
      expect(erroConsultor(valor, ATIVOS), valor).toBe(CONSULTOR_ERRO);
    }
  });

  it("o valor que o registro JÁ tem é aceito mesmo fora da lista; outro valor fora da lista não", () => {
    for (const antigo of ["Junior", A_DEFINIR, LITERAL, "Flavinha", "ASD"]) {
      expect(erroConsultor(antigo, ATIVOS, { consultor: antigo }), antigo).toBeNull();
      expect(erroConsultor(` ${antigo} `, ATIVOS, { consultor: antigo }), `${antigo} (espaços)`).toBeNull();
      expect(erroConsultor("Rodrigo", ATIVOS, { consultor: antigo }), `${antigo} → Rodrigo`).toBe(CONSULTOR_ERRO);
    }
    expect(erroConsultor("Junior", ATIVOS, { consultor: "Mateus Teste" })).toBe(CONSULTOR_ERRO);
    expect(erroConsultor("Junior", ATIVOS, { consultor: null })).toBe(CONSULTOR_ERRO);
  });

  it("Cadastro vazio: nenhum valor NOVO é aceito, mas o já gravado continua", () => {
    expect(erroConsultor("Mateus Teste", [])).toBe(CONSULTOR_ERRO);
    expect(erroConsultor("Mateus Teste", [], { consultor: "Mateus Teste" })).toBeNull();
  });
});

describe("situacaoDoConsultor", () => {
  it("ativo, inativo (existe desativado) ou desconhecido (o Cadastro não tem)", () => {
    expect(situacaoDoConsultor("Mateus Teste", ITENS)).toBe("ativo");
    expect(situacaoDoConsultor("Junior", ITENS)).toBe("inativo");
    expect(situacaoDoConsultor("Flavinha", ITENS)).toBe("desconhecido");
    expect(situacaoDoConsultor(A_DEFINIR, ITENS)).toBe("desconhecido");
    expect(situacaoDoConsultor("Mateus Teste", [])).toBe("desconhecido");
  });
});

describe("montarConsultorOptions — o select Consultor de todas as telas", () => {
  const rotulos = (o: ReturnType<typeof montarConsultorOptions>) => o.map((x) => x.label);

  it('"Selecione" + os consultores ATIVOS em ordem alfabética, SEM "Outro" e sem inativos', () => {
    const o = montarConsultorOptions("", ITENS);
    expect(rotulos(o)).toEqual(["Selecione", ...ATIVOS]);
    expect(o[0]).toEqual({ value: "", label: "Selecione" });
    expect(rotulos(o)).not.toContain("Outro");
    expect(rotulos(o)).not.toContain("Junior");
  });

  it("valor atual de consultor ativo não duplica nem ganha sufixo", () => {
    expect(rotulos(montarConsultorOptions("Mateus Teste", ITENS))).toEqual(["Selecione", ...ATIVOS]);
  });

  it('valor atual INATIVO no Cadastro entra como "<valor> (inativo)" e mantém o valor', () => {
    const o = montarConsultorOptions("Junior", ITENS);
    expect(o.at(-1)).toEqual({ value: "Junior", label: "Junior (inativo)" });
    expect(o).toHaveLength(ATIVOS.length + 2);
  });

  it('valor atual que o Cadastro NÃO conhece ("A ser definido", "Braulio (3RB)", "Flavinha") entra como está, SEM "(inativo)"', () => {
    for (const antigo of [A_DEFINIR, LITERAL, "Flavinha"]) {
      expect(montarConsultorOptions(antigo, ITENS).at(-1), antigo).toEqual({ value: antigo, label: antigo });
    }
  });

  it("sem lista carregada: só 'Selecione' e, se houver, o valor atual (nunca vira vazio)", () => {
    expect(rotulos(montarConsultorOptions("", []))).toEqual(["Selecione"]);
    expect(rotulos(montarConsultorOptions("Flavinha", []))).toEqual(["Selecione", "Flavinha"]);
  });
});
