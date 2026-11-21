import { describe, expect, it } from "vitest";
import { NOME_CADASTRO_MAX } from "../../shared/constants/cadastros";
import {
  digitarMedicamento,
  escolherMedicamentoDoCadastro,
  estaForaDoCadastro,
  estaVinculado,
  limparMedicamento,
  montarPedidoPreCadastro,
  nomeEnviadoAoCadastro,
  nomeInicialParaOCadastro,
  podeOferecerPreCadastro,
  PRE_CADASTRO_SEM_NOME,
  PRE_CADASTRO_SEM_TEMPERATURA,
  vinculoContinua,
} from "../../shared/utils/compraMedicamento";
import { itemDeTeste } from "./helpers/compraFixtures";

// O vínculo do medicamento com o Cadastro (Opção A): o texto é um só; completar o nome do Cadastro mantém o vínculo; mudar o começo o
// desfaz (e zera a temperatura que veio do Cadastro); fora do Cadastro, o pré-cadastro é um pedido EXPLÍCITO. Dados fictícios (TESTE).

const ligado = (extra = {}) =>
  itemDeTeste(1, { medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "DIPIRONA TESTE", temperatura: "2°C a 8°C", ...extra });

describe("vinculoContinua: enquanto o texto COMEÇA com o nome do Cadastro (por chaveCadastro)", () => {
  it("o próprio nome e o nome completado continuam", () => {
    expect(vinculoContinua("DIPIRONA TESTE", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("DIPIRONA TESTE 500 mg c/ 10 ampolas", "DIPIRONA TESTE")).toBe(true);
  });

  it("sem acento nem caixa nem espaços repetidos", () => {
    expect(vinculoContinua("dipirona   teste 500", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("Ácido Fólico Teste 5 mg", "ACIDO FOLICO TESTE")).toBe(true);
    expect(vinculoContinua("  DIPIRONA TESTE", "DIPIRONA TESTE")).toBe(true);
  });

  it("mudou o COMEÇO (ou encurtou): não continua", () => {
    expect(vinculoContinua("DIPIRONA TEST", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("XDIPIRONA TESTE", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("OUTRO DIPIRONA TESTE", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("", "DIPIRONA TESTE")).toBe(false);
  });

  it("LIMITE DE PALAVRA: depois do nome o texto acaba, ou o próximo caractere não é letra nem dígito", () => {
    expect(vinculoContinua("DIPIRONA TESTE", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("DIPIRONA TESTE 500", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("DIPIRONA TESTE-500", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("DIPIRONA TESTE, 500 mg", "DIPIRONA TESTE")).toBe(true);
    expect(vinculoContinua("DIPIRONA TESTE (500 mg)", "DIPIRONA TESTE")).toBe(true);
    // colado em letra ou dígito: é outra palavra
    expect(vinculoContinua("DIPIRONA TESTEX", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("DIPIRONA TESTE2", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("DIPIRONA TESTEÇ", "DIPIRONA TESTE")).toBe(false);
    expect(vinculoContinua("DIPIRONAX", "DIPIRONA")).toBe(false);
    expect(vinculoContinua("dipironax 500", "DIPIRONA")).toBe(false);
  });

  it("sem o nome do Cadastro (null ou vazio) não há com o que comparar", () => {
    expect(vinculoContinua("DIPIRONA TESTE", null)).toBe(false);
    expect(vinculoContinua("DIPIRONA TESTE", "")).toBe(false);
    expect(vinculoContinua("DIPIRONA TESTE", "   ")).toBe(false);
  });
});

describe("escolherMedicamentoDoCadastro", () => {
  it("liga o item: o texto vira o nome do Cadastro, guarda o nome (só leitura), esquece pré-cadastro e traz a temperatura", () => {
    expect(escolherMedicamentoDoCadastro({ id: "med_1", nome: "DIPIRONA TESTE", temperatura: "2°C a 8°C" })).toEqual({
      medicamento: "DIPIRONA TESTE",
      medicamentoCadastroId: "med_1",
      medicamentoCadastroNome: "DIPIRONA TESTE",
      preCadastroId: null,
      preCadastroStatus: null,
      temperatura: "2°C a 8°C",
    });
  });

  it("o Cadastro sem temperatura não mexe na temperatura do item", () => {
    const m = escolherMedicamentoDoCadastro({ id: "med_1", nome: "DIPIRONA TESTE", temperatura: "  " });
    expect(m).not.toHaveProperty("temperatura");
    expect(m.medicamentoCadastroId).toBe("med_1");
  });
});

describe("digitarMedicamento: o texto mudou", () => {
  it("ligado e o texto continua com o nome do Cadastro: só o texto muda (vínculo e temperatura ficam)", () => {
    expect(digitarMedicamento(ligado(), "DIPIRONA TESTE 500 mg")).toEqual({ medicamento: "DIPIRONA TESTE 500 mg" });
    expect(digitarMedicamento(ligado(), "dipirona teste")).toEqual({ medicamento: "dipirona teste" });
  });

  it("ligado e o começo mudou: o vínculo some, o nome do Cadastro também, e a temperatura que veio do Cadastro é zerada", () => {
    expect(digitarMedicamento(ligado(), "DIPIRONA TEST")).toEqual({
      medicamento: "DIPIRONA TEST",
      medicamentoCadastroId: null,
      medicamentoCadastroNome: null,
      preCadastroId: null,
      preCadastroStatus: null,
      temperatura: "",
    });
  });

  it("depois de desfeito, voltar a digitar o nome inteiro NÃO religa (só escolhendo na lista)", () => {
    const desligado = { ...ligado(), ...digitarMedicamento(ligado(), "DIPIRONA TEST") };
    const depois = digitarMedicamento(desligado, "DIPIRONA TESTE");
    expect(depois).toEqual({ medicamento: "DIPIRONA TESTE" });
    expect(estaVinculado({ ...desligado, ...depois })).toBe(false);
  });

  it("ligado mas sem o nome do Cadastro (dado inconsistente): qualquer mudança desfaz", () => {
    expect(digitarMedicamento(ligado({ medicamentoCadastroNome: null }), "DIPIRONA TESTE X")).toMatchObject({ medicamentoCadastroId: null, temperatura: "" });
  });

  it("ligado e o texto vira outra palavra colada no nome (DIPIRONA TESTEX): o vínculo some", () => {
    expect(digitarMedicamento(ligado(), "DIPIRONA TESTEX")).toMatchObject({ medicamentoCadastroId: null, temperatura: "" });
  });

  it("fora do Cadastro, sem pedido: só o texto muda e a temperatura (escolhida pela pessoa) fica", () => {
    const livre = itemDeTeste(1, { medicamento: "NOVO TESTE", temperatura: "Ambiente" });
    expect(digitarMedicamento(livre, "NOVO TESTE 2")).toEqual({ medicamento: "NOVO TESTE 2" });
  });

  it("fora do Cadastro com um pedido de pré-cadastro de OUTRO texto: o pedido é esquecido", () => {
    const pedido = itemDeTeste(1, { medicamento: "NOVO TESTE", preCadastroId: "pre_1", preCadastroStatus: "pendente" });
    expect(digitarMedicamento(pedido, "NOVO TESTE 2")).toEqual({ medicamento: "NOVO TESTE 2", preCadastroId: null, preCadastroStatus: null });
  });

  it("não altera o item recebido", () => {
    const item = ligado();
    const antes = JSON.stringify(item);
    digitarMedicamento(item, "OUTRA COISA");
    expect(JSON.stringify(item)).toBe(antes);
  });
});

describe("limparMedicamento", () => {
  it("ligado: zera texto, vínculo e a temperatura do Cadastro", () => {
    expect(limparMedicamento(ligado())).toEqual({ medicamento: "", medicamentoCadastroId: null, medicamentoCadastroNome: null, preCadastroId: null, preCadastroStatus: null, temperatura: "" });
  });

  it("fora do Cadastro: a temperatura escolhida fica", () => {
    expect(limparMedicamento(itemDeTeste(1, { medicamento: "NOVO", temperatura: "Ambiente" }))).not.toHaveProperty("temperatura");
  });
});

describe("estado 'fora do Cadastro' e o nome para o cadastro", () => {
  it("fora do Cadastro = tem texto e não está ligado", () => {
    expect(estaForaDoCadastro(itemDeTeste(1, { medicamento: "NOVO TESTE" }))).toBe(true);
    expect(estaForaDoCadastro(itemDeTeste(1, { medicamento: "   " }))).toBe(false);
    expect(estaForaDoCadastro(ligado())).toBe(false);
  });

  it("o campo começa com o texto atual, limpo, SEM mudar a caixa, cortado em 120", () => {
    expect(nomeInicialParaOCadastro("  Novo   Med Teste 5 mg ")).toBe("Novo Med Teste 5 mg");
    expect(nomeInicialParaOCadastro("A".repeat(300))).toHaveLength(NOME_CADASTRO_MAX);
    expect(NOME_CADASTRO_MAX).toBe(120);
  });

  it("o nome ENVIADO é limpo e em MAIÚSCULAS", () => {
    expect(nomeEnviadoAoCadastro("  novo   med teste ")).toBe("NOVO MED TESTE");
    expect(nomeEnviadoAoCadastro("ácido fólico")).toBe("ÁCIDO FÓLICO");
  });

  it("só se oferece o pedido fora do Cadastro e enquanto não há pedido feito", () => {
    expect(podeOferecerPreCadastro(itemDeTeste(1, { medicamento: "NOVO TESTE" }))).toBe(true);
    expect(podeOferecerPreCadastro(itemDeTeste(1, { medicamento: "NOVO TESTE", preCadastroId: "pre_1" }))).toBe(false);
    expect(podeOferecerPreCadastro(ligado())).toBe(false);
    expect(podeOferecerPreCadastro(itemDeTeste(1, { medicamento: "" }))).toBe(false);
  });
});

describe("montarPedidoPreCadastro: a temperatura é obrigatória, o nome sai em MAIÚSCULAS e cabe em 120", () => {
  it("válido: { nome em maiúsculas, temperatura }", () => {
    expect(montarPedidoPreCadastro("novo med teste", "Ambiente")).toEqual({ ok: true, pedido: { nome: "NOVO MED TESTE", temperatura: "Ambiente" } });
  });

  it("sem temperatura: recusa com a mensagem (nada é pedido por conta própria ao escolher a temperatura)", () => {
    expect(montarPedidoPreCadastro("NOVO TESTE", "")).toEqual({ ok: false, erro: PRE_CADASTRO_SEM_TEMPERATURA });
    expect(montarPedidoPreCadastro("NOVO TESTE", "   ")).toEqual({ ok: false, erro: PRE_CADASTRO_SEM_TEMPERATURA });
  });

  it("nome vazio: recusa", () => {
    expect(montarPedidoPreCadastro("   ", "Ambiente")).toEqual({ ok: false, erro: PRE_CADASTRO_SEM_NOME });
  });

  it("120 caracteres passam; 121 não", () => {
    expect(montarPedidoPreCadastro("a".repeat(120), "Ambiente").ok).toBe(true);
    const r = montarPedidoPreCadastro("a".repeat(121), "Ambiente");
    expect(r.ok).toBe(false);
  });
});
